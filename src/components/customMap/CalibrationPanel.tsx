import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import type { AffineTransform, CustomMap } from '@/features/customMap/customMapTypes'

interface Props {
  map: CustomMap
  transform: AffineTransform
  calibrated: boolean
  pendingRef: { x: number; y: number } | null
  onAdd: (lat: number, lng: number) => void
  onCancel: () => void
  update: (fn: (m: CustomMap) => CustomMap) => void
}

export function CalibrationPanel({ map, transform, calibrated, pendingRef, onAdd, onCancel, update }: Props) {
  const [coords, setCoords] = useState('')
  const parsed = coords.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/)

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Pulsa un punto reconocible de la imagen y escribe sus coordenadas reales. Con 2 puntos se calcula escala y rotación; con 3 o
        más, una transformación afín por mínimos cuadrados.
      </p>
      {pendingRef ? (
        <form
          className="space-y-2 rounded-xl bg-purple-500/10 p-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (parsed) {
              onAdd(Number(parsed[1]), Number(parsed[2]))
              setCoords('')
            }
          }}
        >
          <label className="block text-xs font-medium">
            Coordenadas del píxel ({Math.round(pendingRef.x)}, {Math.round(pendingRef.y)})
            <input
              autoFocus
              value={coords}
              onChange={(e) => setCoords(e.target.value)}
              placeholder="lat, lng (p. ej. 39.4699, -0.3763)"
              className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 font-mono text-xs dark:border-white/15 dark:bg-ink-800"
            />
          </label>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" type="submit" disabled={!parsed}>
              Añadir referencia
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 p-3 text-xs dark:border-white/15">Haz clic en la imagen para añadir un punto de referencia.</p>
      )}
      <ul className="space-y-1">
        {map.references.map((r, i) => (
          <li key={r.id} className="flex items-center gap-2 rounded-lg bg-slate-900/5 px-2 py-1 font-mono text-[11px] dark:bg-white/5">
            <span className="font-sans font-semibold text-purple-500">R{i + 1}</span>
            <span className="flex-1">
              ({Math.round(r.x)}, {Math.round(r.y)}) → {r.lat.toFixed(5)}, {r.lng.toFixed(5)}
            </span>
            <IconButton
              label={`Eliminar referencia ${i + 1}`}
              size="sm"
              onClick={() => update((m) => ({ ...m, references: m.references.filter((x) => x.id !== r.id) }))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </li>
        ))}
      </ul>
      {!calibrated && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">
            Escala manual (m/píxel)
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={map.manualScale}
              onChange={(e) => update((m) => ({ ...m, manualScale: Math.max(0.01, Number(e.target.value) || 1) }))}
              className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 dark:border-white/15 dark:bg-ink-800"
            />
          </label>
          <label className="text-xs">
            Rotación (°)
            <input
              type="number"
              step="1"
              value={map.manualRotationDeg}
              onChange={(e) => update((m) => ({ ...m, manualRotationDeg: Number(e.target.value) || 0 }))}
              className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 dark:border-white/15 dark:bg-ink-800"
            />
          </label>
        </div>
      )}
      <dl className="grid grid-cols-3 gap-2 text-center text-[11px]">
        <div className="rounded-lg bg-slate-900/5 p-2 dark:bg-white/5">
          <dt className="text-slate-500">Modo</dt>
          <dd className="font-semibold">{calibrated ? 'Geográfico' : 'Manual'}</dd>
        </div>
        <div className="rounded-lg bg-slate-900/5 p-2 dark:bg-white/5">
          <dt className="text-slate-500">Escala</dt>
          <dd className="font-semibold tabular-nums">{transform.metersPerPixel.toFixed(3)} m/px</dd>
        </div>
        <div className="rounded-lg bg-slate-900/5 p-2 dark:bg-white/5">
          <dt className="text-slate-500">Rotación</dt>
          <dd className="font-semibold tabular-nums">{transform.rotationDeg.toFixed(1)}°</dd>
        </div>
      </dl>
      {map.references.length >= 3 && (
        <p className="text-[11px] text-slate-500">Error medio de ajuste: {transform.rmse.toFixed(2)} m</p>
      )}
    </div>
  )
}
