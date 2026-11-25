import { networkStore } from './networkStore'
import { poisFromOsm } from '@/features/poi/poiTypes'
import { useAppStore } from '@/store/useAppStore'

/**
 * Carga el extracto real de OpenStreetMap incluido en el repositorio para
 * trabajar sin conexión (se descarga en un chunk aparte, solo bajo demanda).
 */
export async function loadDemoData() {
  const { demoCity, demoRoads, demoPOIs } = await import('@/data/demo')
  networkStore.addWays(demoRoads)
  const s = useAppStore.getState()
  s.setPois(poisFromOsm(demoPOIs), 'idle')
  s.flyTo(demoCity.center.lat, demoCity.center.lng, 16, demoCity.bbox)
  return demoCity
}
