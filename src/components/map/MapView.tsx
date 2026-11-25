import { MapContainer } from 'react-leaflet'
import { themeCssVars, themeFxClasses } from '@/features/map/mapUtils'
import type { MapTheme } from '@/features/themes/themeTypes'
import { useAppStore } from '@/store/useAppStore'
import { MapContextPopup } from './MapContextPopup'
import { FitRouteController, MapSync, MapTargetController, NavigationFollow } from './MapControllers'
import { POILayer } from './POIMarker'
import { RoadLayer } from './RoadLayer'
import { RouteLayer } from './RouteLayer'
import { StreetLabels } from './StreetLabels'
import { ThemedTileLayers } from './ThemedTileLayers'
import { UserMarker } from './UserMarker'
import { WaypointMarkers } from './WaypointMarkers'

/**
 * Mapa interactivo. El tema solo afecta a la presentación: la vista, la ruta,
 * las paradas y los datos geográficos son independientes del estilo.
 */
export function MapView({ theme }: { theme: MapTheme }) {
  const initial = useAppStore.getState().lastView
  const showLabels = useAppStore((s) => s.showLabels)
  const fx = theme.effects

  return (
    <div className={`atlas-map ${themeFxClasses(theme)}`} style={themeCssVars(theme)} data-theme={theme.id}>
      <MapContainer
        center={[initial.lat, initial.lng]}
        zoom={initial.zoom}
        minZoom={3}
        maxZoom={19}
        zoomControl={false}
        worldCopyJump
        className="h-full w-full"
        attributionControl
      >
        <ThemedTileLayers theme={theme} showLabels={showLabels} />
        <RoadLayer theme={theme} />
        {showLabels && <StreetLabels theme={theme} />}
        <RouteLayer theme={theme} />
        <WaypointMarkers theme={theme} />
        <POILayer theme={theme} />
        <UserMarker />
        <MapContextPopup />
        <MapSync />
        <MapTargetController />
        <FitRouteController />
        <NavigationFollow />
      </MapContainer>
      {fx.grid && <div className="map-fx grid" />}
      {fx.paper && <div className="map-fx paper" />}
      {fx.scanlines && <div className="map-fx scanlines" />}
      {fx.vignette && <div className="map-fx vignette" />}
    </div>
  )
}
