import type { OsmPoiElement } from '@/features/poi/poiTypes'
import type { OsmWay } from '@/features/routing/graph'
import cityJson from './demoCity.json'
import poisJson from './demoPOIs.json'
import roadsJson from './demoRoads.json'

/**
 * Extracto REAL de OpenStreetMap (Buñol, Valencia) generado con `npm run data:demo`.
 * © OpenStreetMap contributors — ODbL 1.0.
 */
export interface DemoMeta {
  name: string
  bbox: { south: number; west: number; north: number; east: number }
  center: { lat: number; lng: number }
  source: string
  license: string
  osmTimestamp: string | null
  downloadedAt: string
}

export const demoCity = cityJson as DemoMeta
export const demoRoads = (roadsJson as unknown as { elements: OsmWay[] }).elements
export const demoPOIs = (poisJson as unknown as { elements: OsmPoiElement[] }).elements
