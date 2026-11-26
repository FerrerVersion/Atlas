import { describe, expect, it } from 'vitest'
import { buildGraphFromOsm, type OsmWay } from '@/features/routing/graph'
import type { TravelProfile } from '@/features/routing/routeTypes'

/** ¿Se puede circular por una vía con estas etiquetas reales de OSM? */
function usable(tags: Record<string, string>, profile: TravelProfile) {
  const way: OsmWay = {
    type: 'way',
    id: 1,
    nodes: [1, 2],
    geometry: [
      { lat: 39.419, lon: -0.791 },
      { lat: 39.42, lon: -0.79 },
    ],
    tags,
  }
  return buildGraphFromOsm([way], { profile }).edges.size > 0
}

describe('restricciones de acceso de OSM (la etiqueta más específica manda)', () => {
  it.each<[string, Record<string, string>, TravelProfile, boolean]>([
    // A pie: foot > access
    ['zona peatonal cerrada al tráfico pero abierta a pie', { highway: 'pedestrian', access: 'no', foot: 'yes' }, 'walk', true],
    ['calle con access=private y foot=permissive', { highway: 'residential', access: 'private', foot: 'permissive' }, 'walk', true],
    ['camino designado para peatones', { highway: 'path', access: 'no', foot: 'designated' }, 'walk', true],
    ['access=no sin excepción para peatones', { highway: 'residential', access: 'no' }, 'walk', false],
    ['foot=no aunque access=yes', { highway: 'residential', access: 'yes', foot: 'no' }, 'walk', false],
    ['foot=private', { highway: 'service', foot: 'private' }, 'walk', false],
    // En coche: motorcar > motor_vehicle > vehicle > access
    ['access=no con motor_vehicle=yes', { highway: 'service', access: 'no', motor_vehicle: 'yes' }, 'car', true],
    ['access=no con vehicle=yes', { highway: 'residential', access: 'no', vehicle: 'yes' }, 'car', true],
    ['motor_vehicle=no con motorcar=yes', { highway: 'residential', motor_vehicle: 'no', motorcar: 'yes' }, 'car', true],
    ['acceso solo para residentes (destination)', { highway: 'residential', motor_vehicle: 'destination' }, 'car', true],
    ['access=no con bus=yes (solo autobús)', { highway: 'service', access: 'no', bus: 'yes' }, 'car', false],
    ['vehicle=no aunque access=yes', { highway: 'residential', access: 'yes', vehicle: 'no' }, 'car', false],
    ['motor_vehicle=agricultural', { highway: 'track', motor_vehicle: 'agricultural' }, 'car', false],
    ['access=private', { highway: 'residential', access: 'private' }, 'car', false],
    ['sin etiquetas de acceso', { highway: 'residential' }, 'car', true],
    ['peatonal sin permiso para coches', { highway: 'pedestrian' }, 'car', false],
  ])('%s', (_label, tags, profile, expected) => {
    expect(usable(tags, profile)).toBe(expected)
  })
})
