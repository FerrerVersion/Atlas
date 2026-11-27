import { describe, expect, it } from 'vitest'
import { applyH, cameraLayout, containerToScreenH, invertH, NAV_TILT, visibleRadius } from '@/features/map/camera'

/** Composición explícita de la transformación CSS (referencia independiente). */
function cssProject(x: number, y: number, size: number, left: number, top: number, d: number, bearing: number, tilt: number) {
  const o = size / 2
  const b = (-bearing * Math.PI) / 180
  const t = (tilt * Math.PI) / 180
  const rx = x - o
  const ry = y - o
  const x1 = rx * Math.cos(b) - ry * Math.sin(b)
  const y1 = rx * Math.sin(b) + ry * Math.cos(b)
  const Y = y1 * Math.cos(t)
  const Z = y1 * Math.sin(t)
  const w = 1 - Z / d
  return { x: x1 / w + o + left, y: Y / w + o + top }
}

describe('cámara de navegación (camera.ts)', () => {
  const v = { width: 400, height: 850 }

  it('sin giro ni inclinación no transforma nada (vista norte idéntica a la actual)', () => {
    const l = cameraLayout(v, { bearing: 0, tilt: 0 })
    expect(l.identity).toBe(true)
    expect(l.transform).toBe('')
  })

  it('la homografía coincide con la transformación CSS y se invierte', () => {
    for (const pose of [{ bearing: 37, tilt: NAV_TILT }, { bearing: 200, tilt: 0 }, { bearing: 0, tilt: 30 }]) {
      const l = cameraLayout(v, pose)
      const h = containerToScreenH(l, pose)
      const inv = invertH(h)
      for (const [x, y] of [[l.size / 2, l.size / 2], [100, 900], [l.size - 50, 300]]) {
        const ref = cssProject(x, y, l.size, l.left, l.top, l.perspective, pose.bearing, pose.tilt)
        const got = applyH(h, x, y)
        expect(got.x).toBeCloseTo(ref.x, 6)
        expect(got.y).toBeCloseTo(ref.y, 6)
        const back = applyH(inv, got.x, got.y)
        expect(back.x).toBeCloseTo(x, 6)
        expect(back.y).toBeCloseTo(y, 6)
      }
    }
  })

  it('el usuario (centro del contenedor) queda en el ancla: más abajo al inclinar', () => {
    const pose = { bearing: 120, tilt: NAV_TILT }
    const l = cameraLayout(v, pose)
    const p = applyH(containerToScreenH(l, pose), l.size / 2, l.size / 2)
    expect(p.x).toBeCloseTo(200, 6)
    expect(p.y).toBeCloseTo(850 * 0.7, 6)
  })

  it('el contenedor cubre toda la pantalla visible en cualquier rumbo', () => {
    for (const bearing of [0, 45, 90, 135, 222, 315]) {
      const pose = { bearing, tilt: NAV_TILT }
      const l = cameraLayout(v, pose)
      const inv = invertH(containerToScreenH(l, pose))
      // Esquinas de la pantalla por debajo de la niebla del horizonte.
      for (const [sx, sy] of [[0, 850 * 0.16], [400, 850 * 0.16], [0, 850], [400, 850]]) {
        const c = applyH(inv, sx, sy)
        expect(c.x).toBeGreaterThanOrEqual(0)
        expect(c.y).toBeGreaterThanOrEqual(0)
        expect(c.x).toBeLessThanOrEqual(l.size)
        expect(c.y).toBeLessThanOrEqual(l.size)
      }
    }
  })

  it('tamaño contenido (no descarga teselas de más): ~1 700 px en móvil', () => {
    const size = cameraLayout(v, { bearing: 10, tilt: NAV_TILT }).size
    expect(size).toBeLessThanOrEqual(2048)
    expect(visibleRadius(v, 0)).toBeCloseTo(Math.hypot(200, 425), 0)
  })
})
