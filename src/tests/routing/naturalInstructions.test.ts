import { afterEach, describe, expect, it, vi } from 'vitest'
import { demoRoads } from '@/data/demo'
import { findRoute } from '@/features/routing/astar'
import { buildGraphFromOsm, createGraph } from '@/features/routing/graph'
import { generateInstructions } from '@/features/routing/routeInstructions'
import { routeOnGraph } from '@/features/routing/routeService'
import { SmoothValue } from '@/features/navigation/smoothMotion'
import type { RoadGraph } from '@/features/routing/routeTypes'
import { node, road } from './fixtures'

/**
 * Instrucciones naturales: se avisa cuando hay una DECISIÓN (giro, bifurcación, rotonda,
 * cambio de carretera), no por cada curva de la vía. Grafos sintéticos con etiquetas de
 * prueba (no son lugares reales), salvo el último bloque, con el extracto real de Buñol.
 * En el ecuador 0,001° ≈ 111 m.
 */
const types = (g: RoadGraph, from: string, to: string) => {
  const r = findRoute(g, from, to)
  if (!r.ok) throw new Error(r.message)
  return generateInstructions(g, r.edges)
}

describe('instrucciones: curvas sin decisión', () => {
  it('carretera con curvas consecutivas (sin cruces): solo salida y llegada', () => {
    const g = createGraph()
    node(g, 'a', 0, 0)
    node(g, 'b', 0, 0.01)
    node(g, 'c', 0.006, 0.016)
    node(g, 'd', 0.006, 0.026)
    // Tres vías OSM distintas, mismo nombre, con curvas fuertes en su geometría y en las uniones.
    road(g, 'ab', 'a', 'b', { name: 'Carretera Uno', via: [[0.001, 0.003], [-0.001, 0.006], [0.001, 0.008]] })
    road(g, 'bc', 'b', 'c', { name: 'Carretera Uno', via: [[0.004, 0.011]] })
    road(g, 'cd', 'c', 'd', { name: 'Carretera Uno', via: [[0.004, 0.02], [0.007, 0.023]] })
    expect(types(g, 'a', 'd').map((i) => i.type)).toEqual(['depart', 'arrive'])
  })

  it('la calle tuerce 45° en un cruce con una perpendicular: no es un giro', () => {
    const g = createGraph()
    node(g, 'w', 0, -0.002)
    node(g, 'x', 0, 0)
    node(g, 'ne', 0.0015, 0.0015) // la calle sigue hacia el noreste
    node(g, 's', -0.002, 0) // bocacalle al sur
    road(g, 'wx', 'w', 'x', { name: 'Calle Mayor' })
    road(g, 'xne', 'x', 'ne', { name: 'Calle Mayor' })
    road(g, 'xs', 'x', 's', { name: 'Calle Lateral' })
    expect(types(g, 'w', 'ne').map((i) => i.type)).toEqual(['depart', 'arrive'])
  })

  it('cambio de nombre en una calle que sigue recta: sin aviso (el panel muestra la calle)', () => {
    const g = createGraph()
    node(g, 'a', 0, 0)
    node(g, 'b', 0, 0.003)
    node(g, 'c', 0, 0.006)
    node(g, 'n', 0.002, 0.003)
    road(g, 'ab', 'a', 'b', { name: 'Calle Primera' })
    road(g, 'bc', 'b', 'c', { name: 'Calle Segunda' })
    road(g, 'bn', 'b', 'n', { name: 'Calle Norte' })
    expect(types(g, 'a', 'c').map((i) => i.type)).toEqual(['depart', 'arrive'])
  })

  it('al pasar a otra carretera (otra referencia) sí se avisa, una vez', () => {
    const g = createGraph()
    node(g, 'a', 0, 0)
    node(g, 'b', 0, 0.003)
    node(g, 'c', 0, 0.02)
    node(g, 'n', 0.002, 0.003)
    road(g, 'ab', 'a', 'b', { name: 'Calle Primera' })
    addRef(g, 'bc', 'b', 'c', 'CV-999')
    road(g, 'bn', 'b', 'n', { name: 'Calle Norte' })
    const ins = types(g, 'a', 'c')
    expect(ins.map((i) => i.type)).toEqual(['depart', 'continue', 'arrive'])
    expect(ins[1].text).toMatch(/^Continúa por CV-999/)
  })

  it('las entradas a garajes y aparcamientos no convierten una curva en giro', () => {
    const g = createGraph()
    node(g, 'w', 0, -0.002)
    node(g, 'x', 0, 0)
    node(g, 'e', 0.0006, 0.002)
    node(g, 'p', -0.0005, 0.0003)
    road(g, 'wx', 'w', 'x', { name: 'Avenida' })
    road(g, 'xe', 'x', 'e', { name: 'Avenida' })
    road(g, 'xp', 'x', 'p', { name: 'Aparcamiento', type: 'service' })
    expect(types(g, 'w', 'e').map((i) => i.type)).toEqual(['depart', 'arrive'])
  })
})

describe('instrucciones: decisiones reales', () => {
  it('giro real en un cruce: se anuncia con la calle', () => {
    const g = createGraph()
    node(g, 'w', 0, -0.002)
    node(g, 'x', 0, 0)
    node(g, 'e', 0, 0.002)
    node(g, 'n', 0.002, 0)
    road(g, 'wx', 'w', 'x', { name: 'Calle Oeste' })
    road(g, 'xe', 'x', 'e', { name: 'Calle Oeste' })
    road(g, 'xn', 'x', 'n', { name: 'Calle Norte' })
    const ins = types(g, 'w', 'n')
    expect(ins.map((i) => i.type)).toEqual(['depart', 'left', 'arrive'])
    expect(ins[1].text).toBe('Gira a la izquierda por Calle Norte')
  })

  it('la vía principal tuerce y otra sigue recta: «gira para seguir por…»', () => {
    const g = createGraph()
    node(g, 'w', 0, -0.002)
    node(g, 'x', 0, 0)
    node(g, 'e', 0, 0.002)
    node(g, 's', -0.002, 0.0005)
    road(g, 'wx', 'w', 'x', { name: 'Calle Mayor' })
    road(g, 'xs', 'x', 's', { name: 'Calle Mayor' })
    road(g, 'xe', 'x', 'e', { name: 'Calle Recta' })
    const ins = types(g, 'w', 's')
    expect(ins[1].type).toBe('right')
    expect(ins[1].text).toBe('Gira a la derecha para seguir por Calle Mayor')
  })

  it('bifurcación con dos salidas casi rectas: «mantente a la izquierda/derecha»', () => {
    const g = createGraph()
    node(g, 'a', 0, -0.003)
    node(g, 'x', 0, 0)
    node(g, 'l', 0.0008, 0.003) // ~15° a la izquierda
    node(g, 'r', -0.0008, 0.003) // ~15° a la derecha
    road(g, 'ax', 'a', 'x', { name: 'Carretera' })
    road(g, 'xl', 'x', 'l', { name: 'Ramal Norte' })
    road(g, 'xr', 'x', 'r', { name: 'Ramal Sur' })
    const left = types(g, 'a', 'l')
    expect(left[1].type).toBe('slight-left')
    expect(left[1].text).toBe('Mantente a la izquierda hacia Ramal Norte')
    expect(types(g, 'a', 'r')[1].text).toBe('Mantente a la derecha hacia Ramal Sur')
  })

  it('dos giros pegados (cruzar una avenida con mediana) son una sola maniobra', () => {
    const g = createGraph()
    node(g, 's', -0.003, 0)
    node(g, 'x1', 0, 0)
    node(g, 'x2', 0.00012, 0) // 13 m más allá: la otra calzada
    node(g, 'w2', 0.00012, -0.003)
    node(g, 'e1', 0, 0.003)
    node(g, 'n', 0.003, 0)
    road(g, 'sx1', 's', 'x1', { name: 'Calle Sur' })
    road(g, 'x1x2', 'x1', 'x2', { name: 'Cruce' })
    road(g, 'x2w2', 'x2', 'w2', { name: 'Avenida', oneWay: true })
    road(g, 'x1e1', 'x1', 'e1', { name: 'Avenida', oneWay: true })
    road(g, 'x2n', 'x2', 'n', { name: 'Calle Norte' })
    const ins = types(g, 's', 'w2')
    expect(ins.map((i) => i.type)).toEqual(['depart', 'left', 'arrive'])
  })

  it('rotonda: una sola maniobra con la salida, sin aviso extra al salir', () => {
    const g = createGraph()
    node(g, 'in', 0, -0.003)
    node(g, 'r1', 0, -0.001)
    node(g, 'r2', 0.001, 0)
    node(g, 'r3', 0, 0.001)
    node(g, 'r4', -0.001, 0)
    node(g, 'o3', 0, 0.003)
    node(g, 'o2', 0.003, 0)
    node(g, 'y', 0, 0.00315) // bocacalle justo a la salida
    road(g, 'IN', 'in', 'r1', { name: 'Entrada' })
    road(g, 'R12', 'r1', 'r2', { oneWay: true, roundabout: true, name: 'Rotonda' })
    road(g, 'R23', 'r2', 'r3', { oneWay: true, roundabout: true, name: 'Rotonda' })
    road(g, 'R34', 'r3', 'r4', { oneWay: true, roundabout: true, name: 'Rotonda' })
    road(g, 'R41', 'r4', 'r1', { oneWay: true, roundabout: true, name: 'Rotonda' })
    road(g, 'O2', 'r2', 'o2', { name: 'Calle Norte' })
    road(g, 'O3', 'r3', 'o3', { name: 'Calle Este' })
    road(g, 'O3b', 'o3', 'y', { name: 'Calle Este' })
    const ins = types(g, 'in', 'y')
    expect(ins.map((i) => i.type)).toEqual(['depart', 'roundabout', 'arrive'])
    expect(ins[1].text).toBe('En la rotonda, toma la 2.ª salida hacia Calle Este')
  })
})

describe('instrucciones al recalcular en marcha', () => {
  function street() {
    const g = createGraph()
    node(g, 'a', 0, 0)
    node(g, 'b', 0, 0.004)
    road(g, 'ab', 'a', 'b', { name: 'Calle Larga' })
    return g
  }

  it('en el sentido de la marcha: «Continúa por…», no «Dirígete hacia el este»', () => {
    const g = street()
    const r = findRoute(g, 'a', 'b')
    if (!r.ok) throw new Error()
    const ins = generateInstructions(g, r.edges, { departHeading: 92 })
    expect(ins[0].type).toBe('depart')
    expect(ins[0].text).toMatch(/^Continúa por Calle Larga durante/)
  })

  it('si de verdad hay que dar la vuelta, se dice claramente', () => {
    const g = street()
    const r = findRoute(g, 'a', 'b')
    if (!r.ok) throw new Error()
    const ins = generateInstructions(g, r.edges, { departHeading: 270 })
    expect(ins[0].type).toBe('uturn')
    expect(ins[0].text).toMatch(/^Da la vuelta cuando sea posible y sigue por Calle Larga/)
  })
})

describe('instrucciones con datos reales (Buñol)', () => {
  it('rutas reales: pocas instrucciones, sin avisos pegados ni repetidos', () => {
    const g = buildGraphFromOsm(demoRoads)
    const nodes = [...g.nodes.values()].filter((n) => n.type === 'intersection')
    let seed = 11
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    let routes = 0
    let total = 0
    for (let k = 0; k < 120 && routes < 60; k++) {
      const a = nodes[Math.floor(rnd() * nodes.length)]
      const b = nodes[Math.floor(rnd() * nodes.length)]
      let r
      try {
        r = routeOnGraph(g, [a, b], { cost: 'fastest', avoidHighways: false })
      } catch {
        continue
      }
      if (r.distance < 800) continue
      routes++
      const ins = r.instructions
      total += ins.length
      for (let i = 2; i < ins.length - 1; i++) {
        // Nunca el mismo aviso repetido a pocos metros (sí dos giros iguales separados).
        const dup = ins[i].type === ins[i - 1].type && ins[i].street === ins[i - 1].street && ins[i].offset - ins[i - 1].offset < 80
        expect(dup).toBe(false)
        // Ni dos maniobras pegadas salvo la llegada.
        expect(ins[i].offset - ins[i - 1].offset).toBeGreaterThanOrEqual(i > 1 ? 1 : 0)
      }
    }
    expect(routes).toBeGreaterThan(30)
    // Antes de este cambio: 12,9 instrucciones por ruta en esta misma muestra de Buñol.
    expect(total / routes).toBeLessThan(9.5)
  })
})

describe('SmoothValue con objetivo nuevo en cada fotograma (simulación)', () => {
  afterEach(() => vi.useRealTimers())
  it('el valor avanza (antes se quedaba congelado)', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    const v = new SmoothValue(() => false)
    v.setTarget([0], performance.now())
    for (let f = 1; f <= 30; f++) {
      v.setTarget([f * 5], performance.now())
      vi.advanceTimersToNextFrame()
    }
    expect(v.get()![0]).toBeGreaterThan(100)
  })
})

/** Vía con referencia de carretera (p. ej. CV-999, etiqueta de prueba). */
function addRef(g: RoadGraph, id: string, from: string, to: string, ref: string) {
  road(g, id, from, to, { name: ref, type: 'secondary' })
  for (const e of g.edges.values()) if (e.id.startsWith(`${id}:`)) e.ref = ref
}
