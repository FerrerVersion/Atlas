import { describe, expect, it } from 'vitest'
import { demoRoads } from '@/data/demo'
import { navigationState } from '@/features/navigation/navigationProgress'
import { buildGraphFromOsm } from '@/features/routing/graph'
import { planNetworkQuery, routeOnGraph } from '@/features/routing/routeService'

describe('progreso de navegación', () => {
  const g = buildGraphFromOsm(demoRoads)
  const route = routeOnGraph(
    g,
    [
      { lat: 39.4205, lng: -0.7905 },
      { lat: 39.4135, lng: -0.7945 },
    ],
    { cost: 'fastest', avoidHighways: false },
  )

  it('al inicio anuncia la primera maniobra y el total restante', () => {
    const st = navigationState(route, 0)
    expect(st.remainingDistance).toBeCloseTo(route.distance, 3)
    expect(st.remainingTime).toBeCloseTo(route.duration, 3)
    expect(st.current.type).toBe('depart')
    expect(st.arrived).toBe(false)
  })

  it('a mitad de camino reduce distancia y tiempo restantes', () => {
    const st = navigationState(route, route.distance / 2)
    expect(st.remainingDistance).toBeCloseTo(route.distance / 2, 3)
    expect(st.remainingTime).toBeLessThan(route.duration)
    expect(st.distanceToNext).toBeGreaterThanOrEqual(0)
  })

  it('al final indica llegada', () => {
    const st = navigationState(route, route.distance)
    expect(st.arrived).toBe(true)
    expect(st.next).toBeNull()
  })
})

describe('planificación de descarga de red', () => {
  it('rutas cortas: una sola zona con todo el detalle', () => {
    const plan = planNetworkQuery([{ lat: 39.47, lng: -0.376 }, { lat: 39.48, lng: -0.37 }], 'car')
    expect(plan.detail).toHaveLength(1)
    expect(plan.corridor).toBeUndefined()
  })

  it('Valencia → Buñol: detalle en extremos + corredor de vías principales', () => {
    const plan = planNetworkQuery([{ lat: 39.4699, lng: -0.3763 }, { lat: 39.419, lng: -0.791 }], 'car')
    expect(plan.detail).toHaveLength(2)
    expect(plan.corridor?.level).toBe('secondary')
  })

  it('rechaza distancias excesivas', () => {
    expect(() => planNetworkQuery([{ lat: 39.47, lng: -0.37 }, { lat: 43.36, lng: -8.41 }], 'car')).toThrow()
  })
})
