import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { Place } from '@/features/geocoding/geocodingService'
import { searchPlaces } from '@/features/search/searchService'
import { useAppStore } from '@/store/useAppStore'
import { PlaceCard } from './PlaceCard'
import { PoiFilters } from './PoiFilters'
import { PoiList } from './PoiList'

/** Ejemplos de búsqueda: lugares reales consultados en vivo, no datos precargados. */
const QUICK = ['Valencia, España', 'Buñol, Valencia', 'Madrid, España', 'Barcelona, España']

async function quickSearch(q: string) {
  const s = useAppStore.getState()
  s.setSearchQuery(q)
  try {
    const found = await searchPlaces(q, { submit: true })
    const first = found.find((p) => p.kind !== 'category')
    if (first) {
      s.setSearchQuery(first.name)
      s.selectPlace(first)
    } else s.notify(`No se encontró «${q}» en OpenStreetMap.`)
  } catch {
    s.notify('El servicio de búsqueda no responde.', 'error')
  }
}

export function ExplorePanel() {
  const selected = useAppStore((s) => s.selectedPlace)
  const history = useAppStore((s) => s.history)

  return (
    <div className="space-y-5">
      <PlaceCard />
      {!selected && (
        <section className="space-y-2">
          <h3 className="panel-title">Empieza a explorar</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Busca cualquier ciudad, municipio, barrio o calle. Los nombres proceden de OpenStreetMap.
          </p>
          <div className="flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <Button key={q} size="sm" icon={<Compass className="h-3.5 w-3.5" />} onClick={() => quickSearch(q)}>
                {q.split(',')[0]}
              </Button>
            ))}
          </div>
          {history.length > 0 && (
            <div className="pt-1">
              <h4 className="mb-1 text-xs font-medium text-slate-500">Recientes</h4>
              <div className="flex flex-wrap gap-1.5">
                {history.slice(0, 5).map((h: Place) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => useAppStore.getState().selectPlace(h)}
                    className="focus-ring max-w-[14rem] truncate rounded-full bg-slate-900/5 px-3 py-1 text-xs hover:bg-slate-900/10 dark:bg-white/8 dark:hover:bg-white/14"
                  >
                    {h.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
      <PoiFilters />
      <PoiList />
    </div>
  )
}
