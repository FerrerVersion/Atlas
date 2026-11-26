import { useEffect, useMemo } from 'react'
import { CircleMarker, ImageOverlay, MapContainer, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { CustomMap } from '@/features/customMap/customMapTypes'
import type { RouteResult } from '@/features/routing/routeTypes'
import type { EditorMode } from './useCustomMapEditor'

/** En CRS.Simple: latLng = [alto − y, x] (la imagen tiene el origen arriba). */
const toLL = (h: number, x: number, y: number): L.LatLngTuple => [h - y, x]

function FitImage({ w, h }: { w: number; h: number }) {
  const map = useMap()
  useEffect(() => {
    map.fitBounds([
      [0, 0],
      [h, w],
    ])
  }, [map, w, h])
  return null
}

function ClickCapture({ h, onClick }: { h: number; onClick: (x: number, y: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lng, h - e.latlng.lat) })
  return null
}

interface Props {
  map: CustomMap
  mode: EditorMode
  pendingNode: string | null
  pendingRef: { x: number; y: number } | null
  routeEnds: string[]
  route: RouteResult | null
  onImageClick: (x: number, y: number) => void
  onNodeClick: (id: string) => void
}

export function CustomMapCanvas({ map, mode, pendingNode, pendingRef, routeEnds, route, onImageClick, onNodeClick }: Props) {
  const img = map.image!
  const h = img.height
  const nodeById = useMemo(() => new Map(map.nodes.map((n) => [n.id, n])), [map.nodes])
  const routeIds = new Set(route?.ok ? route.edges.map((e) => e.sourceId) : [])

  return (
    <MapContainer
      crs={L.CRS.Simple}
      minZoom={-5}
      maxZoom={4}
      zoomSnap={0.25}
      center={[h / 2, img.width / 2]}
      zoom={0}
      className={`h-full w-full bg-slate-200 dark:bg-ink-950 ${mode === 'route' ? '' : 'cursor-crosshair'}`}
      attributionControl={false}
    >
      <FitImage w={img.width} h={h} />
      <ImageOverlay url={img.dataUrl} bounds={[[0, 0], [h, img.width]]} />
      <ClickCapture h={h} onClick={onImageClick} />
      {map.roads.map((r) => {
        const a = nodeById.get(r.from)
        const b = nodeById.get(r.to)
        if (!a || !b) return null
        const onRoute = routeIds.has(r.id)
        return (
          <Polyline
            key={r.id}
            positions={[toLL(h, a.x, a.y), toLL(h, b.x, b.y)]}
            pathOptions={{
              color: onRoute ? '#22d3ee' : r.roadType === 'motorway' ? '#f59e0b' : '#e11d48',
              weight: onRoute ? 7 : r.roadType === 'motorway' ? 5 : 3.5,
              dashArray: r.oneWay ? '10 6' : undefined,
              opacity: 0.9,
            }}
          >
            <Tooltip sticky>
              {r.name || 'Sin nombre'} · {r.oneWay ? 'sentido único' : 'doble sentido'} · {r.speedLimit} km/h
            </Tooltip>
          </Polyline>
        )
      })}
      {map.nodes.map((n) => {
        const active = n.id === pendingNode || routeEnds.includes(n.id)
        return (
          <CircleMarker
            key={n.id}
            // Capa superior: las vías nunca deben tapar los nodos (clics).
            pane="markerPane"
            center={toLL(h, n.x, n.y)}
            radius={active ? 9 : 6}
            pathOptions={{ color: '#fff', weight: 2, fillColor: active ? '#22d3ee' : '#0f172a', fillOpacity: 1 }}
            bubblingMouseEvents={false}
            eventHandlers={{ click: () => onNodeClick(n.id) }}
          >
            {n.name && <Tooltip>{n.name}</Tooltip>}
          </CircleMarker>
        )
      })}
      {map.references.map((r, i) => (
        <CircleMarker
          key={r.id}
          center={toLL(h, r.x, r.y)}
          radius={8}
          pathOptions={{ color: '#a855f7', weight: 3, fillOpacity: 0.2 }}
          interactive={false}
        >
          <Tooltip permanent direction="right">
            R{i + 1}
          </Tooltip>
        </CircleMarker>
      ))}
      {pendingRef && (
        <CircleMarker center={toLL(h, pendingRef.x, pendingRef.y)} radius={10} pathOptions={{ color: '#a855f7', dashArray: '3 3' }} />
      )}
    </MapContainer>
  )
}
