import { Flag, MapPinOff } from 'lucide-react'
import { IconButton } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Controls'
import { DynamicIcon } from '@/components/ui/DynamicIcon'
import { POI_CATEGORY_MAP } from '@/features/poi/poiTypes'
import { poiToPlace } from '@/features/search/searchService'
import { formatDistance, haversine } from '@/utils/distance'
import { useAppStore } from '@/store/useAppStore'

/** Lista de POIs encontrados, ordenados por distancia al centro del mapa. */
export function PoiList() {
  const pois = useAppStore((s) => s.pois)
  const active = useAppStore((s) => s.activeCategories)
  const view = useAppStore((s) => s.lastView)
  const selectedId = useAppStore((s) => s.selectedPoiId)
  if (active.length === 0) return null
  if (pois.length === 0) {
    return <EmptyState icon={<MapPinOff className="h-6 w-6" />} title="Sin resultados todavía" text="Mueve el mapa o espera a que OSM responda." />
  }
  const sorted = pois
    .map((p) => ({ p, d: haversine(view.lat, view.lng, p.coordinates.lat, p.coordinates.lng) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 60)

  return (
    <ul className="divide-y divide-slate-200/70 dark:divide-white/5">
      {sorted.map(({ p, d }) => {
        const def = POI_CATEGORY_MAP[p.category]
        const place = poiToPlace(p)
        return (
          <li key={p.id} className={`flex items-center gap-3 py-2 ${selectedId === p.id ? 'bg-accent/5' : ''}`}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white" style={{ background: def.color }}>
              <DynamicIcon name={def.icon} className="h-4 w-4" />
            </span>
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                const s = useAppStore.getState()
                s.selectPoi(p.id)
                s.selectPlace(place, { addToHistory: false })
              }}
            >
              <span className={`block truncate text-sm font-medium ${p.name ? '' : 'italic text-slate-500'}`}>{place.name}</span>
              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                {def.label}
                {p.address ? ` · ${p.address}` : ''} · {formatDistance(d)}
              </span>
            </button>
            <IconButton
              label={`Ir a ${place.name}`}
              size="sm"
              onClick={() => useAppStore.getState().goTo(place)}
            >
              <Flag className="h-4 w-4" />
            </IconButton>
          </li>
        )
      })}
    </ul>
  )
}
