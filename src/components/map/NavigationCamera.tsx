import { useEffect } from 'react'
import { useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { applyH, cameraLayout, containerToScreenH, invertH, MAX_TILT, NAV_TILT, type CameraLayout, type CameraPose, type Homography } from '@/features/map/camera'
import { prefersReducedMotion, userIcon } from '@/features/map/mapUtils'
import { angleDiff, norm, stepBearing, stepScalar } from '@/features/navigation/heading'
import { cameraState, publishPose, setCameraCommandHandler } from '@/features/navigation/cameraState'
import { smoothLocation, smoothProgress } from '@/features/navigation/smoothMotion'
import { bearing, type LatLngTuple } from '@/utils/distance'
import { pointAlong } from '@/utils/geometry'
import { useAppStore } from '@/store/useAppStore'
import { useNavStore } from '@/store/useNavStore'
import { enterFreeView } from './cameraFollow'

/**
 * Cámara de navegación: UN solo bucle por fotograma decide dónde está el usuario, hacia
 * dónde mira la flecha, cuánto se gira y se inclina el mapa y si la vista le sigue. Así
 * la posición, el rumbo, la perspectiva y la ruta (también tras recalcularla) se mueven
 * juntos y sin contradecirse.
 *
 * Modos (preferencia `navPrefs.cameraView` + `navigation.following`):
 *  - vista de navegación: rumbo arriba, inclinada, siguiendo al usuario;
 *  - vista norte: norte arriba, cenital, siguiendo al usuario (como antes);
 *  - vista libre: al arrastrar/girar/inclinar a mano se deja de seguir; «Recentrar» (o
 *    15 s sin tocar el mapa) vuelve al modo automático.
 *
 * El bucle solo corre mientras algo cambia (avance animado, giro pendiente…): parado y
 * con la cámara asentada no consume batería.
 */

/** Metros por delante usados para la dirección de la ruta (anticipa las curvas suavemente). */
const ROUTE_LOOKAHEAD_M = 22
/** Zoom al empezar a seguir (si se estaba más lejos de NAV_MIN_ZOOM). */
const NAV_ZOOM = 17
const NAV_MIN_ZOOM = 16

export function NavigationCamera() {
  const map = useMap()
  // Arrastrar con el mapa plano (Leaflet nativo) también pasa a la vista libre.
  useMapEvents({
    dragstart: () => {
      if (useNavStore.getState().navigation.active) enterFreeView()
    },
  })
  useEffect(() => {
    const engine = new CameraEngine(map)
    return () => engine.destroy()
  }, [map])
  return null
}

class CameraEngine {
  private readonly map: L.Map
  private readonly wrapper: HTMLElement
  private readonly viewport: HTMLElement
  private readonly controls: HTMLElement
  private readonly controlContainer: HTMLElement | null
  private raf = 0
  private lastT = 0
  private pose: CameraPose = { bearing: 0, tilt: 0 }
  private heading: number | null = null
  private layout: CameraLayout | null = null
  private inverse: Homography = [1, 0, 0, 0, 1, 0, 0, 0, 1]
  private transformed = false
  private puck: L.Marker | null = null
  private puckArrow: HTMLElement | null = null
  private readonly unsubs: (() => void)[] = []
  private readonly originalMouseToContainer: L.Map['mouseEventToContainerPoint']
  private dragEnabledBefore = true
  private pointers = new Map<number, { x: number; y: number }>()
  private gestureMoved = false
  private engaged = false
  private pausedLeafletDrag = false

  constructor(map: L.Map) {
    this.map = map
    const container = map.getContainer()
    this.wrapper = container.parentElement as HTMLElement
    this.viewport = this.wrapper.parentElement as HTMLElement
    this.originalMouseToContainer = map.mouseEventToContainerPoint.bind(map)

    // Los controles de Leaflet (atribución) quedan fuera de la parte que gira: siempre
    // derechos y en su esquina de la pantalla.
    this.controls = document.createElement('div')
    this.controls.className = 'atlas-map-controls'
    this.controlContainer = container.querySelector<HTMLElement>('.leaflet-control-container')
    if (this.controlContainer) this.controls.appendChild(this.controlContainer)
    this.viewport.appendChild(this.controls)

    const kick = () => this.kick()
    this.unsubs.push(smoothProgress.subscribe(kick), smoothLocation.subscribe(kick), useNavStore.subscribe(kick))
    this.unsubs.push(useAppStore.subscribe((s, p) => (s.route !== p.route || s.navPrefs !== p.navPrefs) && kick()))
    const ro = new ResizeObserver(kick)
    ro.observe(this.viewport)
    this.unsubs.push(() => ro.disconnect())

    const opts = { passive: false } as AddEventListenerOptions
    const down = (e: PointerEvent) => this.onPointerDown(e)
    const move = (e: PointerEvent) => this.onPointerMove(e)
    const up = (e: PointerEvent) => this.onPointerUp(e)
    this.viewport.addEventListener('pointerdown', down, opts)
    window.addEventListener('pointermove', move, opts)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    this.unsubs.push(() => {
      this.viewport.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    })

    setCameraCommandHandler((command) => {
      enterFreeView()
      const next = command({ ...cameraState.freePose })
      cameraState.freePose = { bearing: norm(next.bearing), tilt: Math.max(0, Math.min(MAX_TILT, next.tilt)) }
      this.kick()
    })
    this.kick()
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    this.unsubs.forEach((u) => u())
    setCameraCommandHandler(null)
    this.exitTransformed()
    this.puck?.remove()
    // Los controles vuelven a su sitio (en desarrollo React monta y desmonta dos veces).
    if (this.controlContainer) this.map.getContainer().appendChild(this.controlContainer)
    this.controls.remove()
  }

  kick() {
    if (this.raf) return
    this.raf = requestAnimationFrame((t) => {
      this.raf = 0
      if (this.frame(t)) this.kick()
    })
  }

  /** Devuelve true si hace falta otro fotograma (algo sigue animándose). */
  private frame(now: number): boolean {
    const dt = this.lastT ? Math.min(0.1, (now - this.lastT) / 1000) : 1 / 60
    this.lastT = now
    const nav = useNavStore.getState()
    const { route, navPrefs } = useAppStore.getState()
    const active = nav.navigation.active && !!route
    const reduce = prefersReducedMotion()

    // 1) Posición mostrada y rumbo objetivo.
    let pos: LatLngTuple | null = null
    let target: number | null = null
    if (active && route) {
      const live = nav.live
      const offRoute = !nav.navigation.simulating && live.status === 'off-route'
      const loc = smoothLocation.get()
      if (offRoute && loc) {
        // Fuera de la ruta la flecha va donde estás de verdad (no pegada a la ruta).
        pos = [loc[0], loc[1]]
        target = live.course.course
      } else {
        const p = smoothProgress.get()?.[0] ?? nav.navigation.progress
        pos = pointAlong(route.geometry, p)
        const ahead = pointAlong(route.geometry, Math.min(p + ROUTE_LOOKAHEAD_M, route.distance))
        const tangent = ahead[0] !== pos[0] || ahead[1] !== pos[1] ? bearing(pos[0], pos[1], ahead[0], ahead[1]) : null
        const src = live.course.source
        // Simulación o rumbo ajustado a la ruta: tangente de la ruta en la posición animada.
        // Movimiento real distinto de la ruta, o parado: el rumbo medido / conservado.
        target = nav.navigation.simulating || src === 'route' || src === null ? tangent ?? live.course.course : live.course.course
      }
    }
    let animating = false
    if (target !== null) {
      if (this.heading === null || reduce) this.heading = target
      else {
        this.heading = stepBearing(this.heading, target, dt, 0.3)
        animating ||= angleDiff(this.heading, target) > 1.6
      }
    }
    cameraState.heading = this.heading ?? 0

    // 2) Pose objetivo según el modo.
    const following = nav.navigation.following
    const headingUp = navPrefs.cameraView !== 'north'
    const goal: CameraPose = !active
      ? { bearing: 0, tilt: 0 }
      : !following
        ? cameraState.freePose
        : headingUp
          ? { bearing: this.heading ?? 0, tilt: NAV_TILT }
          : { bearing: 0, tilt: 0 }
    if (reduce) this.pose = { ...goal }
    else {
      const locked = following && headingUp && angleDiff(this.pose.bearing, goal.bearing) < 3
      const bearingNow = locked ? goal.bearing : stepBearing(this.pose.bearing, goal.bearing, dt, 0.22, 240)
      const tiltNow = stepScalar(this.pose.tilt, goal.tilt, dt, 0.22)
      // El último tramo se completa de golpe: la vista plana vuelve a ser exactamente la de antes.
      this.pose = {
        bearing: angleDiff(bearingNow, goal.bearing) < 2 ? goal.bearing : bearingNow,
        tilt: Math.abs(tiltNow - goal.tilt) < 0.6 ? goal.tilt : tiltNow,
      }
      animating ||= angleDiff(this.pose.bearing, goal.bearing) > 0.3 || Math.abs(this.pose.tilt - goal.tilt) > 0.05
    }

    // 3) Contenedor transformado (o plano), seguimiento y flecha.
    this.applyLayout()
    // Al empezar a seguir (inicio o «Recentrar»), se acerca el mapa a la calle.
    const engaged = active && following && !!pos
    if (engaged && !this.engaged && this.map.getZoom() < NAV_MIN_ZOOM) this.map.setZoom(NAV_ZOOM, { animate: false })
    this.engaged = engaged
    if (engaged && pos) this.centerOn(pos)
    this.updatePuck(active ? pos : null)
    publishPose(this.pose)
    this.viewport.style.setProperty('--cam-bearing', `${this.pose.bearing.toFixed(2)}deg`)
    this.viewport.style.setProperty('--cam-unsquash', (1 / Math.cos((this.pose.tilt * Math.PI) / 180)).toFixed(4))
    this.viewport.style.setProperty('--cam-horizon', (this.pose.tilt / NAV_TILT).toFixed(3))
    return animating
  }

  private applyLayout() {
    const v = { width: this.viewport.clientWidth, height: this.viewport.clientHeight }
    if (!v.width || !v.height) return
    const layout = cameraLayout(v, this.pose)
    const prev = this.layout
    this.layout = layout
    if (layout.identity) {
      this.exitTransformed()
      return
    }
    if (!this.transformed) this.enterTransformed()
    const s = this.wrapper.style
    if (!prev || prev.size !== layout.size || prev.identity) {
      s.width = s.height = `${layout.size}px`
      this.map.invalidateSize({ pan: true, debounceMoveend: true })
    }
    s.left = `${layout.left}px`
    s.top = `${layout.top}px`
    s.transform = layout.transform
    this.inverse = invertH(containerToScreenH(layout, this.pose))
  }

  private enterTransformed() {
    this.transformed = true
    this.viewport.classList.add('is-3d')
    this.wrapper.style.position = 'absolute'
    this.wrapper.style.transformOrigin = '50% 50%'
    // El arrastre de Leaflet no entiende un mapa girado: se hace aquí (ver onPointerMove).
    this.dragEnabledBefore = this.map.dragging.enabled() || this.pausedLeafletDrag
    this.map.dragging.disable()
    // Clics, doble clic y rueda: de pantalla a mapa con la homografía inversa.
    this.map.mouseEventToContainerPoint = (e: MouseEvent | Touch) => {
      const r = this.viewport.getBoundingClientRect()
      const c = applyH(this.inverse, e.clientX - r.left, e.clientY - r.top)
      return L.point(c.x, c.y)
    }
    // El zoom (rueda y pellizco) se hace sobre el foco, que es el centro del contenedor.
    this.map.options.scrollWheelZoom = 'center'
    this.map.options.touchZoom = 'center'
  }

  private exitTransformed() {
    if (!this.transformed) return
    this.transformed = false
    this.viewport.classList.remove('is-3d')
    const s = this.wrapper.style
    s.position = s.left = s.top = s.width = s.height = s.transform = s.transformOrigin = ''
    this.map.mouseEventToContainerPoint = this.originalMouseToContainer
    this.map.options.scrollWheelZoom = true
    this.map.options.touchZoom = true
    if (this.dragEnabledBefore) this.map.dragging.enable()
    this.map.invalidateSize({ pan: true, debounceMoveend: true })
    this.layout = null
  }

  /** Coloca la posición en el centro del contenedor (el foco de la cámara). */
  private centerOn(pos: LatLngTuple) {
    const p = this.map.latLngToContainerPoint(pos)
    const offset = p.subtract(this.map.getSize().divideBy(2))
    // panBy desplaza el plano unos píxeles (barato); panTo reiniciaría la vista cada vez.
    if (Math.abs(offset.x) + Math.abs(offset.y) >= 0.5) this.map.panBy(offset, { animate: false })
  }

  private updatePuck(pos: LatLngTuple | null) {
    if (!pos) {
      this.puck?.remove()
      this.puck = null
      this.puckArrow = null
      return
    }
    if (!this.puck) {
      this.puck = L.marker(pos, { icon: userIcon(true, 0), interactive: false, keyboard: false, zIndexOffset: 2000 }).addTo(this.map)
    } else this.puck.setLatLng(pos)
    this.puckArrow ??= this.puck.getElement()?.querySelector<HTMLElement>('[data-arrow]') ?? null
    // El icono «Navigation» apunta al noreste (45°): se compensa. Gira en el plano del
    // mapa, así con el mapa girado apunta hacia arriba en pantalla.
    if (this.puckArrow) this.puckArrow.style.transform = `rotate(${((this.heading ?? 0) - 45).toFixed(1)}deg)`
  }

  /* ---------------------------- Gestos (mapa girado) ---------------------------- */

  private toContainer(e: { clientX: number; clientY: number }) {
    const r = this.viewport.getBoundingClientRect()
    return applyH(this.inverse, e.clientX - r.left, e.clientY - r.top)
  }

  private onPointerDown(e: PointerEvent) {
    // Gestos solo durante la navegación (fuera de ella el mapa es el de siempre).
    if (!useNavStore.getState().navigation.active) return
    const t = e.target as HTMLElement
    if (!t.closest('.leaflet-container') || t.closest('.leaflet-control')) return
    if (this.pointers.size === 0) this.gestureMoved = false
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    // Con el mapa plano, Ctrl/Alt/Cmd + arrastrar gira e inclina: Leaflet no debe desplazarlo a la vez.
    if (!this.transformed && (e.ctrlKey || e.altKey || e.metaKey) && this.map.dragging.enabled()) {
      this.map.dragging.disable()
      this.pausedLeafletDrag = true
    }
  }

  private onPointerMove(e: PointerEvent) {
    const prev = this.pointers.get(e.pointerId)
    if (!prev) return
    const modifier = e.ctrlKey || e.altKey || e.metaKey || e.buttons === 2
    // Con el mapa plano, el arrastre con un dedo lo hace Leaflet; aquí solo girar/inclinar.
    if (!this.transformed && this.pointers.size < 2 && !modifier) {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      return
    }
    const cur = { x: e.clientX, y: e.clientY }
    if (!this.gestureMoved && Math.hypot(cur.x - prev.x, cur.y - prev.y) < 4) return
    if (!this.gestureMoved) {
      this.gestureMoved = true
      enterFreeView()
    }
    cameraState.lastInteraction = performance.now()
    if (this.pointers.size >= 2) {
      // Dos dedos: girar (torsión) e inclinar (desplazamiento vertical). El pellizco
      // (zoom) lo hace Leaflet sobre el foco.
      const [a, b] = [...this.pointers.entries()]
      const other = a[0] === e.pointerId ? b[1] : a[1]
      const before = Math.atan2(prev.y - other.y, prev.x - other.x)
      const after = Math.atan2(cur.y - other.y, cur.x - other.x)
      let twist = ((after - before) * 180) / Math.PI
      if (twist > 180) twist -= 360
      if (twist < -180) twist += 360
      const fp = cameraState.freePose
      cameraState.freePose = {
        bearing: norm(fp.bearing - twist),
        tilt: Math.max(0, Math.min(MAX_TILT, fp.tilt - (cur.y - prev.y) * 0.15)),
      }
    } else if (modifier) {
      // Ratón con tecla: horizontal gira, vertical inclina.
      const fp = cameraState.freePose
      cameraState.freePose = {
        bearing: norm(fp.bearing - (cur.x - prev.x) * 0.4),
        tilt: Math.max(0, Math.min(MAX_TILT, fp.tilt - (cur.y - prev.y) * 0.25)),
      }
    } else {
      // Arrastre: el punto del mapa bajo el dedo le acompaña (exacto también inclinado).
      const c0 = this.toContainer({ clientX: prev.x, clientY: prev.y })
      const c1 = this.toContainer(e)
      this.map.panBy([c0.x - c1.x, c0.y - c1.y], { animate: false })
    }
    this.pointers.set(e.pointerId, cur)
    this.kick()
  }

  private onPointerUp(e: PointerEvent) {
    if (!this.pointers.delete(e.pointerId)) return
    if (this.pointers.size === 0 && this.pausedLeafletDrag) {
      this.pausedLeafletDrag = false
      if (!this.transformed) this.map.dragging.enable()
      else this.dragEnabledBefore = true
    }
    if (this.gestureMoved && this.pointers.size === 0) {
      // Tras arrastrar no se dispara el clic del mapa (menú contextual).
      const swallow = (ev: Event) => {
        ev.stopPropagation()
        ev.preventDefault()
      }
      window.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
    }
  }
}
