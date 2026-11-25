import type { Place } from '@/features/geocoding/geocodingService'
import { useAppStore } from '@/store/useAppStore'
import { PlaceAutocomplete } from './PlaceAutocomplete'

/** Buscador principal: ciudades, municipios, barrios, calles, POIs, categorías y coordenadas. */
export function SearchBar({ size = 'lg' }: { size?: 'md' | 'lg' }) {
  const query = useAppStore((s) => s.searchQuery)
  const setQuery = useAppStore((s) => s.setSearchQuery)

  const onPick = (p: Place) => {
    const s = useAppStore.getState()
    if (p.kind === 'category' && p.category) {
      if (!s.activeCategories.includes(p.category as never)) s.toggleCategory(p.category as never)
      s.setSearchQuery('')
      s.setPanelTab('explore')
      return
    }
    setQuery(p.name)
    s.selectPlace(p)
    s.setPanelTab('explore')
  }

  return (
    <PlaceAutocomplete
      value={query}
      onValueChange={setQuery}
      onPick={onPick}
      size={size}
      placeholder="Busca ciudades, calles, lugares…"
      ariaLabel="Buscar un lugar"
    />
  )
}
