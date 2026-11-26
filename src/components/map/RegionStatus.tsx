import { LoaderCircle, PauseCircle } from 'lucide-react'
import { useRegionProgress } from '@/features/osm/regionalRoads'
import { useCorridorProgress } from '@/features/osm/routeCorridor'
import { useRegionTileProgress } from '@/hooks/useRegionalPreload'
import { useAppStore } from '@/store/useAppStore'

const percent = (parts: { done: number; total: number }[]) => {
  const valid = parts.filter((p) => p.total > 0)
  return valid.length ? Math.round((valid.reduce((a, p) => a + Math.min(1, p.done / p.total), 0) / valid.length) * 100) : 0
}

/**
 * Indicador discreto de las cargas de fondo: la zona de 200 km, el corredor de 5 km
 * alrededor de la ruta, o la pausa mientras se calcula una ruta.
 */
export function RegionStatus({ className = '' }: { className?: string }) {
  const roads = useRegionProgress()
  const tiles = useRegionTileProgress()
  const corridor = useCorridorProgress()
  const routing = useAppStore((s) => s.routeStatus === 'loading')
  const region = roads.running || tiles.running
  if (!region && !corridor.running) return null

  const text = routing
    ? 'Calculando la ruta · el resto de cargas, en pausa'
    : corridor.running
      ? `Cargando 5 km alrededor de la ruta · ${percent([corridor])} %`
      : `Cargando tu zona (200 km) · ${percent([roads, tiles])} %`

  return (
    <div
      role="status"
      aria-label="Precarga de la zona"
      className={`pointer-events-none flex items-center gap-2 rounded-full bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-100 shadow-lg backdrop-blur ${className}`}
    >
      {routing ? (
        <PauseCircle className="h-3.5 w-3.5" style={{ color: 'var(--ui-accent)' }} />
      ) : (
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" style={{ color: 'var(--ui-accent)' }} />
      )}
      {text}
    </div>
  )
}
