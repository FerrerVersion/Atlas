import { useState } from 'react'
import { Link } from 'react-router'
import { Database, ImagePlus, Monitor, Moon, Sun, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Section, Segmented, Toggle } from '@/components/ui/Controls'
import { loadDemoData } from '@/features/osm/demoData'
import { networkStore, useNetworkVersion } from '@/features/osm/networkStore'
import { OVERPASS_ENDPOINTS } from '@/features/osm/overpassService'
import { TILE_PROVIDERS } from '@/features/map/tileProviders'
import { geocoding } from '@/features/geocoding/geocodingService'
import { cacheClear } from '@/utils/storage'
import { useAppStore, type UiMode } from '@/store/useAppStore'

export function SettingsPanel() {
  const uiMode = useAppStore((s) => s.uiMode)
  const setUiMode = useAppStore((s) => s.setUiMode)
  const autoNight = useAppStore((s) => s.autoNightTheme)
  const showLabels = useAppStore((s) => s.showLabels)
  const autoLoad = useAppStore((s) => s.autoLoadRoads)
  const setPref = useAppStore((s) => s.setPref)
  const notify = useAppStore((s) => s.notify)
  useNetworkVersion()
  const [busy, setBusy] = useState(false)

  return (
    <div className="space-y-6">
      <Section title="Apariencia de la interfaz">
        <Segmented<UiMode>
          label="Modo de la interfaz"
          value={uiMode}
          onChange={setUiMode}
          options={[
            { value: 'light', label: 'Claro', icon: <Sun className="h-3.5 w-3.5" /> },
            { value: 'dark', label: 'Noche', icon: <Moon className="h-3.5 w-3.5" /> },
            { value: 'system', label: 'Auto', icon: <Monitor className="h-3.5 w-3.5" /> },
          ]}
        />
        <Toggle
          label="Mapa nocturno automático"
          description="Entre las 20:00 y las 7:00 usa «Oscuro Premium» si el estilo elegido es claro."
          checked={autoNight}
          onChange={(v) => setPref('autoNightTheme', v)}
        />
        <Toggle
          label="Mostrar etiquetas"
          description="Nombres de lugares y calles (en los estilos con etiquetas separadas)."
          checked={showLabels}
          onChange={(v) => setPref('showLabels', v)}
        />
      </Section>

      <Section title="Datos cartográficos">
        <Toggle
          label="Cargar calles automáticamente"
          description="Al acercarte (zoom ≥ 15) descarga la red viaria real de OSM vía Overpass."
          checked={autoLoad}
          onChange={(v) => setPref('autoLoadRoads', v)}
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          <Database className="mr-1 inline h-3.5 w-3.5" /> {networkStore.size.toLocaleString('es-ES')} vías OSM en memoria.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              const meta = await loadDemoData()
              setBusy(false)
              notify(`Datos offline de ${meta.name} cargados (extracto OSM real).`, 'success')
            }}
          >
            Cargar demo offline (Buñol)
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 className="h-3.5 w-3.5" />}
            onClick={async () => {
              await cacheClear('overpass:')
              networkStore.clear()
              notify('Caché de datos geográficos borrada.', 'success')
            }}
          >
            Vaciar caché
          </Button>
        </div>
      </Section>

      <Section title="Mapas personalizados">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Carga una imagen propia, calíbrala con puntos de referencia y dibuja tu red de carreteras. Todo se procesa en tu navegador.
        </p>
        <Link
          to="/custom"
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl bg-slate-900/5 px-3 text-xs font-medium hover:bg-slate-900/10 dark:bg-white/8"
        >
          <ImagePlus className="h-3.5 w-3.5" /> Abrir editor de mapas
        </Link>
      </Section>

      <Section title="Fuentes y licencias">
        <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
          <li>
            Datos: © <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>, ODbL 1.0.
          </li>
          <li>Geocodificación: {geocoding.autocompleteProvider.name} y {geocoding.searchProvider.name}.</li>
          <li>Red viaria y POIs: Overpass API ({OVERPASS_ENDPOINTS.map((u) => new URL(u).host).join(', ')}).</li>
          <li>
            Teselas: {[...new Set(Object.values(TILE_PROVIDERS).map((p) => p.name.split(' (')[0]))].join(', ')}.
          </li>
          <li>Los nombres geográficos se muestran tal y como figuran en OSM; nunca se generan.</li>
        </ul>
      </Section>
    </div>
  )
}
