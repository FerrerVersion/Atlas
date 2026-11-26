import type { OsmWay } from '@/features/routing/graph'

/**
 * Ciudad sintética con la forma de los datos reales de OSM: una cuadrícula de N×N
 * cruces con manzanas de ~110 m; cada tramo entre dos cruces es una vía con 6 puntos
 * (como la media de las vías reales, ~11 puntos por vía de ~250 m). Algunas avenidas
 * son de sentido único y principales, para que A* tenga decisiones reales que tomar.
 */
export function syntheticCity(n: number, origin = { lat: 39.40, lng: -0.45 }, step = 0.001): OsmWay[] {
  const ways: OsmWay[] = []
  const nodeId = (i: number, j: number) => i * 100_000 + j + 1
  let id = 1
  let extra = 50_000_000
  const segment = (i0: number, j0: number, i1: number, j1: number, tags: Record<string, string>) => {
    const pts = 6
    const nodes: number[] = []
    const geometry: { lat: number; lon: number }[] = []
    for (let k = 0; k < pts; k++) {
      const t = k / (pts - 1)
      // Ligera curvatura para que el modelo de curvas trabaje.
      const wiggle = k > 0 && k < pts - 1 ? Math.sin(t * Math.PI) * step * 0.04 : 0
      geometry.push({
        lat: origin.lat + (i0 + (i1 - i0) * t) * step + (j0 === j1 ? 0 : wiggle),
        lon: origin.lng + (j0 + (j1 - j0) * t) * step + (i0 === i1 ? 0 : wiggle),
      })
      nodes.push(k === 0 ? nodeId(i0, j0) : k === pts - 1 ? nodeId(i1, j1) : extra++)
    }
    ways.push({ type: 'way', id: id++, nodes, geometry, tags })
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const avenueRow = i % 10 === 0
      const avenueCol = j % 10 === 0
      if (j + 1 < n) {
        segment(i, j, i, j + 1, avenueRow
          ? { highway: 'primary', name: `Avenida ${i}`, maxspeed: '50' }
          : { highway: 'residential', name: `Calle ${i}`, ...(i % 2 ? { oneway: 'yes' } : {}) })
      }
      if (i + 1 < n) {
        segment(i, j, i + 1, j, avenueCol
          ? { highway: 'secondary', name: `Avenida vertical ${j}` }
          : { highway: 'residential', name: `Travesía ${j}`, ...(j % 2 ? { oneway: '-1' } : {}) })
      }
    }
  }
  return ways
}
