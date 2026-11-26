import { useEffect, useRef, useState } from 'react'
import { Popup, useMapEvents } from 'react-leaflet'
import { Flag, MapPin, Navigation2, Plus, Search } from 'lucide-react'
import { placeFromMap, pointPlace } from '@/features/geocoding/placeFromMap'
import { useAppStore } from '@/store/useAppStore'
import { useNavStore } from '@/store/useNavStore'

/** Menú al pulsar el mapa: usar el punto como origen, destino, parada o consultar qué hay. */
export function MapContextPopup() {
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null)
  const navActive = useNavStore((s) => s.navigation.active)
  // Leaflet recibe el clic del botón del menú después de React (con el popup ya
  // desmontado): se ignora el clic inmediatamente posterior a una acción.
  const ignoreUntil = useRef(0)

  useMapEvents({
    click: (e) => {
      if (navActive || performance.now() < ignoreUntil.current) return
      if ((e.originalEvent.target as HTMLElement | null)?.closest('.leaflet-popup')) return
      setPoint({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })

  useEffect(() => {
    if (!point) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPoint(null)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [point])

  if (!point) return null

  const act = (kind: 'origin' | 'destination' | 'stop' | 'info') => {
    const p = point
    // El clic «sobrante» que Leaflet recibe del botón llega casi a la vez: basta un margen corto.
    ignoreUntil.current = performance.now() + 120
    setPoint(null)
    // El punto se usa YA (la ruta empieza a calcularse); su nombre real llega después.
    const place = pointPlace(p.lat, p.lng)
    placeFromMap(p.lat, p.lng).then((named) => useAppStore.getState().updatePlace(named))
    const st = useAppStore.getState()
    if (kind === 'info') {
      st.selectPlace(place, { fly: false })
      st.setPanelTab('explore')
      return
    }
    if (kind === 'origin') st.setOrigin(place)
    else if (kind === 'destination') st.setDestination(place)
    else {
      const emptyMiddle = st.waypoints.findIndex((w, i) => i > 0 && i < st.waypoints.length - 1 && !w.place)
      if (emptyMiddle >= 0) st.setWaypoint(emptyMiddle, place)
      else st.addStop(place)
    }
    st.setPanelTab('route')
  }

  const item = 'flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-white/10'
  return (
    <Popup key={`${point.lat},${point.lng}`} position={[point.lat, point.lng]} eventHandlers={{ remove: () => setPoint(null) }} closeButton={false}>
      <div className="min-w-[200px] py-1" role="menu" aria-label="Acciones del punto">
        <p className="px-4 pt-2 pb-1 font-mono text-[11px] text-slate-500">
          {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
        </p>
        <button type="button" role="menuitem" className={item} onClick={() => act('origin')}>
          <Navigation2 className="h-4 w-4 text-emerald-500" /> Ruta desde aquí
        </button>
        <button type="button" role="menuitem" className={item} onClick={() => act('destination')}>
          <Flag className="h-4 w-4 text-rose-500" /> Ruta hasta aquí
        </button>
        <button type="button" role="menuitem" className={item} onClick={() => act('stop')}>
          <Plus className="h-4 w-4 text-sky-500" /> Añadir como parada
        </button>
        <button type="button" role="menuitem" className={item} onClick={() => act('info')}>
          <Search className="h-4 w-4 text-slate-500" /> ¿Qué hay aquí?
        </button>
        <p className="flex items-center gap-1 px-4 pt-1 pb-2 text-[10px] text-slate-400">
          <MapPin className="h-3 w-3" /> Nombre real vía Nominatim
        </p>
      </div>
    </Popup>
  )
}
