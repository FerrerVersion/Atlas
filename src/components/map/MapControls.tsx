import { Crosshair, Download, LocateFixed, Maximize2, Minus, Plus } from 'lucide-react'
import { IconButton } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Controls'
import { useMapInstance } from '@/features/map/mapInstance'
import { useGeolocation } from '@/hooks/useGeolocation'
import { loadRoadsForBBox } from '@/hooks/useRoadAutoLoader'
import { useAppStore } from '@/store/useAppStore'
import { useNavStore } from '@/store/useNavStore'
import { MapThemeSelector } from './MapThemeSelector'

/** Controles flotantes: zoom, ubicación, recentrar, ajustar ruta, cargar calles y estilos. */
export function MapControls({ compact = false }: { compact?: boolean }) {
  const map = useMapInstance()
  const { locate } = useGeolocation()
  const selected = useAppStore((s) => s.selectedPlace)
  const route = useAppStore((s) => s.route)
  const roadsStatus = useAppStore((s) => s.roadsStatus)
  const locationStatus = useNavStore((s) => s.locationStatus)

  const loadRoads = async () => {
    if (!map) return
    const { setRoadsStatus, notify } = useAppStore.getState()
    if (map.getZoom() < 13) {
      notify('Acércate un poco más (zoom ≥ 13) para cargar las calles de la zona.')
      return
    }
    const b = map.getBounds()
    setRoadsStatus('loading')
    try {
      const n = await loadRoadsForBBox({ south: b.getSouth(), north: b.getNorth(), west: b.getWest(), east: b.getEast() })
      setRoadsStatus('idle')
      notify(n > 0 ? `${n} vías reales de OSM cargadas.` : 'Las calles de esta zona ya estaban cargadas.', 'success')
    } catch (e) {
      setRoadsStatus('error')
      notify((e as Error).message, 'error')
    }
  }

  const group = 'glass flex flex-col gap-0.5 rounded-2xl p-1'
  return (
    <div className="pointer-events-auto flex flex-col items-end gap-2">
      <div className={group}>
        <MapThemeSelector />
      </div>
      <div className={group}>
        <IconButton label="Acercar" onClick={() => map?.zoomIn()}>
          <Plus className="h-5 w-5" />
        </IconButton>
        <IconButton label="Alejar" onClick={() => map?.zoomOut()}>
          <Minus className="h-5 w-5" />
        </IconButton>
      </div>
      {/* En navegación móvil se ocultan para no tapar la barra inferior. */}
      {!compact && (
      <div className={group}>
        <IconButton
          label="Mi ubicación"
          active={locationStatus === 'active'}
          aria-busy={locationStatus === 'pending'}
          onClick={() => locate({ fly: true })}
        >
          {locationStatus === 'pending' ? <Spinner /> : <LocateFixed className="h-5 w-5" />}
        </IconButton>
        <IconButton
          label="Volver a la ubicación seleccionada"
          disabled={!selected}
          onClick={() => selected && useAppStore.getState().flyTo(selected.lat, selected.lng, undefined, selected.bbox)}
        >
          <Crosshair className="h-5 w-5" />
        </IconButton>
        <IconButton label="Ajustar a la ruta" disabled={!route} onClick={() => useAppStore.getState().requestFitRoute()}>
          <Maximize2 className="h-5 w-5" />
        </IconButton>
        <IconButton label="Cargar calles reales de esta zona" onClick={loadRoads} disabled={roadsStatus === 'loading'}>
          {roadsStatus === 'loading' ? <Spinner /> : <Download className="h-5 w-5" />}
        </IconButton>
      </div>
      )}
    </div>
  )
}
