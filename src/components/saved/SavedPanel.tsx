import { Clock, Flag, Star, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { EmptyState, Section } from '@/components/ui/Controls'
import { PlaceIcon } from '@/components/search/SearchResults'
import type { Place } from '@/features/geocoding/geocodingService'
import { useAppStore } from '@/store/useAppStore'

function PlaceRow({ place, actions }: { place: Place; actions?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-900/5 dark:bg-white/8">
        <PlaceIcon place={place} />
      </span>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => useAppStore.getState().selectPlace(place, { addToHistory: false })}>
        <span className="block truncate text-sm font-medium">{place.name}</span>
        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
          {place.kindLabel}
          {place.address ? ` · ${place.address}` : ''}
        </span>
      </button>
      <IconButton
        label={`Ir a ${place.name}`}
        size="sm"
        onClick={() => {
          const s = useAppStore.getState()
          s.setDestination(place)
          s.setPanelTab('route')
        }}
      >
        <Flag className="h-4 w-4" />
      </IconButton>
      {actions}
    </li>
  )
}

/** Favoritos e historial de búsquedas (persistidos en LocalStorage). */
export function SavedPanel() {
  const favorites = useAppStore((s) => s.favorites)
  const history = useAppStore((s) => s.history)
  const toggleFavorite = useAppStore((s) => s.toggleFavorite)
  const clearHistory = useAppStore((s) => s.clearHistory)
  return (
    <div className="space-y-6">
      <Section title="Favoritos">
        {favorites.length === 0 ? (
          <EmptyState icon={<Star className="h-6 w-6" />} title="Aún no tienes favoritos" text="Pulsa la estrella en la ficha de un lugar." />
        ) : (
          <ul className="divide-y divide-slate-200/70 dark:divide-white/5">
            {favorites.map((f) => (
              <PlaceRow
                key={f.id}
                place={f}
                actions={
                  <IconButton label={`Quitar ${f.name} de favoritos`} size="sm" onClick={() => toggleFavorite(f)}>
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  </IconButton>
                }
              />
            ))}
          </ul>
        )}
      </Section>
      <Section
        title="Historial"
        action={
          history.length > 0 && (
            <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={clearHistory}>
              Borrar
            </Button>
          )
        }
      >
        {history.length === 0 ? (
          <EmptyState icon={<Clock className="h-6 w-6" />} title="Sin búsquedas recientes" />
        ) : (
          <ul className="divide-y divide-slate-200/70 dark:divide-white/5">
            {history.map((h) => (
              <PlaceRow key={h.id} place={h} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
