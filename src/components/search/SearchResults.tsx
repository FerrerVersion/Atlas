import { Building2, Globe2, Hash, Home, LayoutGrid, Map, MapPin, Navigation, Signpost, Store } from 'lucide-react'
import type { Place, PlaceKind } from '@/features/geocoding/geocodingService'
import { POI_CATEGORY_MAP, type PoiCategory } from '@/features/poi/poiTypes'
import { DynamicIcon } from '@/components/ui/DynamicIcon'
import { formatDistance } from '@/utils/distance'

const KIND_ICON: Record<PlaceKind, typeof MapPin> = {
  country: Globe2,
  region: Map,
  city: Building2,
  town: Building2,
  village: Home,
  suburb: LayoutGrid,
  street: Signpost,
  address: Hash,
  poi: Store,
  category: LayoutGrid,
  coordinates: Navigation,
  other: MapPin,
}

export function PlaceIcon({ place, className = 'h-4 w-4' }: { place: Place; className?: string }) {
  if ((place.kind === 'category' || place.source === 'local') && place.category && place.category in POI_CATEGORY_MAP) {
    return <DynamicIcon name={POI_CATEGORY_MAP[place.category as PoiCategory].icon} className={className} />
  }
  const Icon = KIND_ICON[place.kind] ?? MapPin
  return <Icon className={className} />
}

interface Props {
  id: string
  results: Place[]
  activeIndex: number
  onPick: (p: Place) => void
  onHover?: (i: number) => void
}

/** Lista de resultados: nombre real, tipo, dirección, icono y distancia aproximada. */
export function SearchResults({ id, results, activeIndex, onPick, onHover }: Props) {
  return (
    <ul id={id} role="listbox" aria-label="Resultados de búsqueda" className="scroll-thin max-h-[50vh] overflow-y-auto py-1">
      {results.map((p, i) => (
        <li key={p.id} role="option" aria-selected={i === activeIndex} id={`${id}-${i}`}>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(p)}
            onMouseEnter={() => onHover?.(i)}
            className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
              i === activeIndex ? 'bg-accent/10' : 'hover:bg-slate-900/5 dark:hover:bg-white/5'
            }`}
          >
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                p.kind === 'category' ? 'bg-accent text-white' : 'bg-slate-900/5 text-slate-600 dark:bg-white/8 dark:text-slate-300'
              }`}
            >
              <PlaceIcon place={p} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{p.name}</span>
              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                {p.kindLabel}
                {p.address ? ` · ${p.address}` : ''}
              </span>
            </span>
            {p.distanceMeters !== undefined && (
              <span className="shrink-0 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{formatDistance(p.distanceMeters)}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}
