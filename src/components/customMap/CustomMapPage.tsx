import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Crosshair, Download, FileJson, ImagePlus, Route, Spline, Trash2, Upload, Waypoints } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { Section, Segmented, Toggle } from '@/components/ui/Controls'
import { ManeuverIcon } from '@/components/navigation/ManeuverIcon'
import {
  deleteCustomMap, downloadJson, emptyCustomMap, exportCustomMap, importCustomMap, listCustomMaps, readImageFile,
} from '@/features/customMap/customMapService'
import type { RoadType } from '@/features/routing/routeTypes'
import { formatDistance, formatDuration } from '@/utils/distance'
import { CalibrationPanel } from './CalibrationPanel'
import { CustomMapCanvas } from './CustomMapCanvas'
import { useCustomMapEditor, type EditorMode } from './useCustomMapEditor'

const ROAD_TYPES: { value: RoadType; label: string; speed: number }[] = [
  { value: 'motorway', label: 'Autopista', speed: 120 },
  { value: 'primary', label: 'Carretera principal', speed: 80 },
  { value: 'secondary', label: 'Secundaria', speed: 60 },
  { value: 'residential', label: 'Calle', speed: 50 },
  { value: 'track', label: 'Camino', speed: 20 },
]

/** Editor de mapas personalizados: imagen propia, calibración, nodos, carreteras y rutas A*. */
export default function CustomMapPage() {
  const ed = useCustomMapEditor()
  const { map, update } = ed
  const fileRef = useRef<HTMLInputElement>(null)
  const jsonRef = useRef<HTMLInputElement>(null)
  const [includeImage, setIncludeImage] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const onImage = async (file?: File) => {
    if (!file) return
    try {
      const image = await readImageFile(file)
      setError(null)
      ed.setMap({ ...emptyCustomMap(), name: file.name.replace(/\.\w+$/, ''), image })
      ed.setMode('calibrate')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const onJson = async (file?: File) => {
    if (!file) return
    try {
      ed.setMap(importCustomMap(JSON.parse(await file.text())))
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="scroll-thin order-2 max-h-[55vh] w-full shrink-0 space-y-5 overflow-y-auto border-slate-200 bg-white p-4 md:order-1 md:max-h-none md:w-[380px] md:border-r dark:border-white/10 dark:bg-ink-900">
        <header className="flex items-center gap-2">
          <Link to="/" aria-label="Volver al mapa" className="focus-ring grid h-9 w-9 place-items-center rounded-xl hover:bg-slate-900/5 dark:hover:bg-white/10">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-base font-bold">Mapas personalizados</h1>
            <p className="text-[11px] text-slate-500">Procesado 100 % local · nombres definidos por ti</p>
          </div>
        </header>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" icon={<ImagePlus className="h-3.5 w-3.5" />} onClick={() => fileRef.current?.click()}>
            Cargar imagen
          </Button>
          <Button size="sm" icon={<Upload className="h-3.5 w-3.5" />} onClick={() => jsonRef.current?.click()}>
            Importar JSON
          </Button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="Imagen del mapa" onChange={(e) => onImage(e.target.files?.[0])} />
          <input ref={jsonRef} type="file" accept="application/json,.json" hidden aria-label="Archivo JSON" onChange={(e) => onJson(e.target.files?.[0])} />
        </div>
        {error && <p role="alert" className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}

        {map.image && (
          <>
            <label className="block text-xs font-medium">
              Nombre del mapa
              <input
                value={map.name}
                onChange={(e) => update((m) => ({ ...m, name: e.target.value }))}
                className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-white/15 dark:bg-ink-800"
              />
            </label>
            <Segmented<EditorMode>
              label="Herramienta"
              value={ed.mode}
              onChange={ed.setMode}
              options={[
                { value: 'calibrate', label: 'Calibrar', icon: <Crosshair className="h-3.5 w-3.5" /> },
                { value: 'nodes', label: 'Nodos', icon: <Waypoints className="h-3.5 w-3.5" /> },
                { value: 'roads', label: 'Vías', icon: <Spline className="h-3.5 w-3.5" /> },
                { value: 'route', label: 'Ruta', icon: <Route className="h-3.5 w-3.5" /> },
              ]}
            />

            {ed.mode === 'calibrate' && (
              <CalibrationPanel
                map={map}
                transform={ed.transform}
                calibrated={ed.calibrated}
                pendingRef={ed.pendingRef}
                onAdd={ed.addReference}
                onCancel={() => ed.setPendingRef(null)}
                update={update}
              />
            )}

            {ed.mode === 'nodes' && (
              <Section title={`Nodos (${map.nodes.length})`}>
                <p className="text-xs text-slate-500">Haz clic en la imagen para crear un nodo (intersección). Puedes nombrarlo libremente.</p>
                <ul className="space-y-1">
                  {map.nodes.map((n, i) => (
                    <li key={n.id} className="flex items-center gap-2">
                      <span className="w-6 text-right text-[11px] text-slate-400">{i + 1}</span>
                      <input
                        value={n.name}
                        placeholder="Sin nombre"
                        aria-label={`Nombre del nodo ${i + 1}`}
                        onChange={(e) => update((m) => ({ ...m, nodes: m.nodes.map((x) => (x.id === n.id ? { ...x, name: e.target.value } : x)) }))}
                        className="h-8 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-xs dark:border-white/15 dark:bg-ink-800"
                      />
                      <IconButton
                        label={`Eliminar nodo ${i + 1}`}
                        size="sm"
                        onClick={() =>
                          update((m) => ({
                            ...m,
                            nodes: m.nodes.filter((x) => x.id !== n.id),
                            roads: m.roads.filter((r) => r.from !== n.id && r.to !== n.id),
                          }))
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {ed.mode === 'roads' && (
              <Section title={`Vías (${map.roads.length})`}>
                <p className="text-xs text-slate-500">
                  Pulsa un nodo y después otro para conectarlos. {ed.pendingNode ? 'Elige el nodo final…' : ''}
                </p>
                <input
                  value={ed.draft.name}
                  placeholder="Nombre de la vía (opcional)"
                  onChange={(e) => ed.setDraft({ ...ed.draft, name: e.target.value })}
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-white/15 dark:bg-ink-800"
                />
                <select
                  aria-label="Tipo de vía"
                  value={ed.draft.roadType}
                  onChange={(e) => {
                    const t = ROAD_TYPES.find((r) => r.value === e.target.value)!
                    ed.setDraft({ ...ed.draft, roadType: t.value, speedLimit: t.speed })
                  }}
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-white/15 dark:bg-ink-800"
                >
                  {ROAD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label} ({t.speed} km/h)
                    </option>
                  ))}
                </select>
                <Toggle label="Sentido único" checked={ed.draft.oneWay} onChange={(oneWay) => ed.setDraft({ ...ed.draft, oneWay })} />
                <ul className="space-y-1 text-xs">
                  {map.roads.map((r) => (
                    <li key={r.id} className="flex items-center justify-between rounded-lg bg-slate-900/5 px-2 py-1 dark:bg-white/5">
                      <span className="truncate">
                        {r.name || 'Sin nombre'} · {r.oneWay ? '→' : '↔'} · {r.speedLimit} km/h
                      </span>
                      <IconButton label="Eliminar vía" size="sm" onClick={() => update((m) => ({ ...m, roads: m.roads.filter((x) => x.id !== r.id) }))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {ed.mode === 'route' && (
              <Section title="Ruta A* en tu mapa">
                <p className="text-xs text-slate-500">Pulsa el nodo de origen y luego el de destino.</p>
                {ed.route && !ed.route.ok && <p role="alert" className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{ed.route.message}</p>}
                {ed.route?.ok && (
                  <div className="space-y-2">
                    <p className="text-lg font-bold">
                      {formatDistance(ed.route.distance)} · {formatDuration(ed.route.duration)}
                    </p>
                    <ol className="space-y-1">
                      {ed.instructions.map((ins, i) => (
                        <li key={i} className="flex items-center gap-2 text-xs">
                          <ManeuverIcon type={ins.type} className="h-4 w-4 shrink-0" />
                          {ins.text}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </Section>
            )}

            <Section title="Exportar">
              <Toggle label="Incluir la imagen en el JSON" checked={includeImage} onChange={setIncludeImage} />
              <Button
                size="sm"
                icon={<FileJson className="h-3.5 w-3.5" />}
                onClick={() => downloadJson(exportCustomMap(map, includeImage), `${map.name || 'mapa'}.atlas.json`)}
              >
                Exportar a JSON
              </Button>
            </Section>
          </>
        )}

        {ed.saved.length > 0 && (
          <Section title="Guardados en este navegador">
            <ul className="space-y-1 text-sm">
              {ed.saved.map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <button type="button" className="min-w-0 flex-1 truncate text-left hover:text-accent" onClick={() => ed.setMap(m)}>
                    {m.name} <span className="text-xs text-slate-400">· {m.nodes.length} nodos</span>
                  </button>
                  <IconButton
                    label={`Borrar ${m.name}`}
                    size="sm"
                    onClick={async () => {
                      await deleteCustomMap(m.id)
                      ed.setSaved(await listCustomMaps())
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <p className="text-[11px] text-slate-400">
          Limitaciones: la calibración asume una proyección plana local (válida para zonas de pocos km); las vías se dibujan como
          tramos rectos entre nodos.
        </p>
      </aside>

      <main className="relative order-1 min-h-[45vh] flex-1 md:order-2">
        {map.image ? (
          <CustomMapCanvas
            map={map}
            mode={ed.mode}
            pendingNode={ed.pendingNode}
            pendingRef={ed.pendingRef}
            routeEnds={ed.routeEnds}
            route={ed.route}
            onImageClick={ed.clickImage}
            onNodeClick={ed.clickNode}
          />
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              onImage(e.dataTransfer.files[0])
            }}
            className="absolute inset-4 grid place-items-center rounded-3xl border-2 border-dashed border-slate-300 text-center text-slate-500 hover:border-accent hover:text-accent dark:border-white/15"
          >
            <span>
              <Download className="mx-auto mb-2 h-8 w-8 rotate-180" />
              <span className="block font-medium">Arrastra una imagen PNG, JPG o WebP</span>
              <span className="text-xs">o pulsa para seleccionarla · no se envía a ningún servidor</span>
            </span>
          </button>
        )}
      </main>
    </div>
  )
}
