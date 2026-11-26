import { useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, GripVertical, LocateFixed, Plus, X } from 'lucide-react'
import { PlaceAutocomplete } from '@/components/search/PlaceAutocomplete'
import { Button, IconButton } from '@/components/ui/Button'
import type { Place } from '@/features/geocoding/geocodingService'
import { requestPosition } from '@/hooks/useGeolocation'
import { useAppStore, type Waypoint } from '@/store/useAppStore'

const MAX_STOPS = 8

function WaypointRow({ wp, index, total }: { wp: Waypoint; index: number; total: number }) {
  // El componente se remonta (key) cuando cambia el lugar, reiniciando el texto.
  const [text, setText] = useState(wp.place?.name ?? '')
  const s = () => useAppStore.getState()
  const isFirst = index === 0
  const isLast = index === total - 1
  const label = isFirst ? 'Origen' : isLast ? 'Destino' : `Parada ${index}`
  const color = isFirst ? 'bg-emerald-500' : isLast ? 'bg-rose-500' : 'bg-sky-500'

  const useMyLocation = () => {
    const u = s().userLocation
    const apply = (lat: number, lng: number) =>
      s().setWaypoint(index, {
        id: `gps:${lat.toFixed(6)},${lng.toFixed(6)}`,
        name: 'Mi ubicación',
        kind: 'coordinates',
        kindLabel: 'Ubicación GPS',
        lat,
        lng,
        source: 'gps',
      })
    if (u) return apply(u.lat, u.lng)
    requestPosition().then((pos) => pos && apply(pos.lat, pos.lng))
  }

  return (
    <li
      className="group flex items-center gap-1.5"
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/x-waypoint', String(index))}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const from = Number(e.dataTransfer.getData('text/x-waypoint'))
        if (Number.isFinite(from)) s().moveWaypoint(from, index)
      }}
    >
      <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-slate-300 dark:text-slate-600" aria-hidden />
      <div className="min-w-0 flex-1">
        <PlaceAutocomplete
          value={text}
          onValueChange={setText}
          onPick={(p: Place) => s().setWaypoint(index, p)}
          placeholder={isFirst ? 'Elige el origen' : isLast ? 'Elige el destino' : 'Añade una parada'}
          ariaLabel={label}
          leading={
            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${color}`}>
              {isFirst ? 'A' : isLast ? 'B' : index}
            </span>
          }
        />
      </div>
      <div className="flex shrink-0 items-center opacity-70 group-focus-within:opacity-100 group-hover:opacity-100">
        {isFirst && (
          <IconButton label="Usar mi ubicación como origen" size="sm" onClick={useMyLocation}>
            <LocateFixed className="h-4 w-4" />
          </IconButton>
        )}
        <IconButton label={`Subir ${label}`} size="sm" disabled={isFirst} onClick={() => s().moveWaypoint(index, index - 1)}>
          <ArrowUp className="h-4 w-4" />
        </IconButton>
        <IconButton label={`Bajar ${label}`} size="sm" disabled={isLast} onClick={() => s().moveWaypoint(index, index + 1)}>
          <ArrowDown className="h-4 w-4" />
        </IconButton>
        <IconButton label={`Eliminar ${label}`} size="sm" onClick={() => s().removeWaypoint(index)}>
          <X className="h-4 w-4" />
        </IconButton>
      </div>
    </li>
  )
}

/** Origen, paradas intermedias y destino: añadir, eliminar, reordenar e intercambiar. */
export function WaypointList() {
  const waypoints = useAppStore((s) => s.waypoints)
  return (
    <div className="space-y-2">
      <ol className="space-y-2" aria-label="Paradas de la ruta">
        {waypoints.map((w, i) => (
          <WaypointRow key={`${w.id}:${w.place?.id ?? ''}`} wp={w} index={i} total={waypoints.length} />
        ))}
      </ol>
      <div className="flex gap-2">
        <Button
          size="sm"
          icon={<Plus className="h-3.5 w-3.5" />}
          disabled={waypoints.length >= MAX_STOPS + 2}
          onClick={() => useAppStore.getState().addStop()}
        >
          Añadir parada
        </Button>
        <Button size="sm" icon={<ArrowUpDown className="h-3.5 w-3.5" />} onClick={() => useAppStore.getState().swapEnds()}>
          Invertir
        </Button>
      </div>
    </div>
  )
}
