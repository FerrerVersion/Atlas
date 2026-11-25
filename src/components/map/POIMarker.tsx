import { useMemo } from 'react'
import { Marker, Tooltip } from 'react-leaflet'
import { poiIcon } from '@/features/map/mapUtils'
import { POI_CATEGORY_MAP, type POI } from '@/features/poi/poiTypes'
import { poiToPlace } from '@/features/search/searchService'
import type { MapTheme } from '@/features/themes/themeTypes'
import { useAppStore } from '@/store/useAppStore'

export function POIMarker({ poi, theme, selected }: { poi: POI; theme: MapTheme; selected: boolean }) {
  const icon = useMemo(() => poiIcon(theme, poi.category, selected), [theme, poi.category, selected])
  return (
    <Marker
      position={[poi.coordinates.lat, poi.coordinates.lng]}
      icon={icon}
      zIndexOffset={selected ? 1000 : 0}
      eventHandlers={{
        click: () => {
          const s = useAppStore.getState()
          s.selectPoi(poi.id)
          s.selectPlace(poiToPlace(poi), { fly: false, addToHistory: false })
          s.setPanelTab('explore')
        },
      }}
    >
      <Tooltip direction="top" offset={[0, -theme.poi.size / 2]}>
        {poi.name ?? `${POI_CATEGORY_MAP[poi.category].label} (sin nombre en OSM)`}
      </Tooltip>
    </Marker>
  )
}

export function POILayer({ theme }: { theme: MapTheme }) {
  const pois = useAppStore((s) => s.pois)
  const selected = useAppStore((s) => s.selectedPoiId)
  return (
    <>
      {pois.map((p) => (
        <POIMarker key={p.id} poi={p} theme={theme} selected={p.id === selected} />
      ))}
    </>
  )
}
