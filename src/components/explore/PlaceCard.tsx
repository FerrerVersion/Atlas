import { Copy, Download, Flag, Navigation2, Plus, Star, X } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { PlaceIcon } from '@/components/search/SearchResults'
import { loadRoadsForBBox } from '@/hooks/useRoadAutoLoader'
import { bboxAround } from '@/utils/geometry'
import { useAppStore } from '@/store/useAppStore'

/** Ficha del lugar seleccionado con su nombre real, tipo, dirección y acciones. */
export function PlaceCard() {
  const place = useAppStore((s) => s.selectedPlace)
  const favorites = useAppStore((s) => s.favorites)
  if (!place) return null
  const fav = favorites.some((f) => f.id === place.id)
  const s = () => useAppStore.getState()

  const loadRoads = async () => {
    s().setRoadsStatus('loading')
    try {
      const n = await loadRoadsForBBox(bboxAround(place.lat, place.lng, 1500))
      s().setRoadsStatus('idle')
      s().notify(n > 0 ? `Cargadas ${n} vías reales alrededor de ${place.name}.` : 'Las calles de esta zona ya estaban cargadas.', 'success')
    } catch (e) {
      s().setRoadsStatus('error')
      s().notify((e as Error).message, 'error')
    }
  }

  return (
    <article className="animate-fade-in space-y-3 rounded-2xl border border-slate-200 bg-white/60 p-4 dark:border-white/10 dark:bg-white/5">
      <header className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
          <PlaceIcon place={place} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base leading-tight font-semibold" data-testid="place-name">
            {place.name}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {place.kindLabel}
            {place.address ? ` · ${place.address}` : ''}
          </p>
          <button
            type="button"
            onClick={() =>
              navigator.clipboard
                ?.writeText(`${place.lat.toFixed(6)}, ${place.lng.toFixed(6)}`)
                .then(() => s().notify('Coordenadas copiadas.', 'success'))
                .catch(() => s().notify('No se han podido copiar las coordenadas.', 'error'))
            }
            className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] text-slate-500 hover:text-accent dark:text-slate-400"
            title="Copiar coordenadas"
            aria-label={`Copiar coordenadas ${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`}
          >
            {place.lat.toFixed(5)}, {place.lng.toFixed(5)} <Copy className="h-3 w-3" />
          </button>
        </div>
        <IconButton label={fav ? 'Quitar de favoritos' : 'Guardar en favoritos'} size="sm" onClick={() => s().toggleFavorite(place)}>
          <Star className={`h-4 w-4 ${fav ? 'fill-amber-400 text-amber-400' : ''}`} />
        </IconButton>
        <IconButton label="Cerrar ficha" size="sm" onClick={() => s().selectPlace(null)}>
          <X className="h-4 w-4" />
        </IconButton>
      </header>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="primary"
          icon={<Flag className="h-4 w-4" />}
          onClick={() => s().goTo(place)}
        >
          Ir aquí
        </Button>
        <Button
          icon={<Navigation2 className="h-4 w-4" />}
          onClick={() => {
            s().setOrigin(place)
            s().setPanelTab('route')
          }}
        >
          Desde aquí
        </Button>
        <Button
          icon={<Plus className="h-4 w-4" />}
          onClick={() => {
            s().addStop(place)
            s().setPanelTab('route')
          }}
        >
          Añadir parada
        </Button>
        <Button icon={<Download className="h-4 w-4" />} onClick={loadRoads}>
          Cargar calles
        </Button>
      </div>
      <p className="text-[10px] text-slate-500 dark:text-slate-400">
        Fuente: {place.source === 'local' ? 'datos OSM cargados' : place.source === 'map' ? 'Nominatim (inversa)' : place.source} · ©
        OpenStreetMap contributors
      </p>
    </article>
  )
}
