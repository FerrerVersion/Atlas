import { useEffect, useMemo, useState } from 'react'
import { findRoute } from '@/features/routing/astar'
import { generateInstructions } from '@/features/routing/routeInstructions'
import type { RoadType, RouteResult } from '@/features/routing/routeTypes'
import {
  activeTransform, buildCustomGraph, emptyCustomMap, isGeoCalibrated, listCustomMaps, saveCustomMap,
} from '@/features/customMap/customMapService'
import type { CustomMap, ReferencePoint } from '@/features/customMap/customMapTypes'

export type EditorMode = 'calibrate' | 'nodes' | 'roads' | 'route'

export interface RoadDraft {
  name: string
  roadType: RoadType
  oneWay: boolean
  speedLimit: number
}

let seq = 0
const uid = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`

/** Estado y lógica del editor de mapas propios (separado de la vista). */
export function useCustomMapEditor() {
  const [map, setMap] = useState<CustomMap>(emptyCustomMap)
  const [mode, setMode] = useState<EditorMode>('calibrate')
  const [pendingNode, setPendingNode] = useState<string | null>(null)
  const [pendingRef, setPendingRef] = useState<{ x: number; y: number } | null>(null)
  const [routeEnds, setRouteEnds] = useState<string[]>([])
  const [draft, setDraft] = useState<RoadDraft>({ name: '', roadType: 'residential', oneWay: false, speedLimit: 50 })
  const [saved, setSaved] = useState<CustomMap[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    listCustomMaps().then(setSaved)
  }, [])

  // Autoguardado local.
  useEffect(() => {
    if (!map.image && map.nodes.length === 0) return
    const t = setTimeout(
      () =>
        saveCustomMap(map)
          .then(() => {
            setSaveError(null)
            return listCustomMaps().then(setSaved)
          })
          .catch((e: Error) => setSaveError(e.message)),
      600,
    )
    return () => clearTimeout(t)
  }, [map])

  const update = (fn: (m: CustomMap) => CustomMap) => setMap((m) => fn(m))

  const graph = useMemo(() => buildCustomGraph(map), [map])
  const transform = useMemo(() => activeTransform(map), [map])
  const calibrated = isGeoCalibrated(map)

  const route: RouteResult | null = useMemo(() => {
    if (routeEnds.length !== 2) return null
    return findRoute(graph, routeEnds[0], routeEnds[1])
  }, [graph, routeEnds])

  const instructions = useMemo(
    () => (route?.ok && route.edges.length ? generateInstructions(graph, route.edges) : []),
    [graph, route],
  )

  const clickImage = (x: number, y: number) => {
    if (mode === 'calibrate') setPendingRef({ x, y })
    if (mode === 'nodes') {
      const id = uid('cn_')
      update((m) => ({ ...m, nodes: [...m.nodes, { id, name: '', x, y }] }))
    }
  }

  const clickNode = (id: string) => {
    if (mode === 'roads') {
      if (!pendingNode) return setPendingNode(id)
      if (pendingNode === id) return setPendingNode(null)
      const from = pendingNode
      update((m) => ({ ...m, roads: [...m.roads, { id: uid('cr_'), from, to: id, ...draft }] }))
      setPendingNode(id) // permite encadenar tramos
    }
    if (mode === 'route') setRouteEnds((ends) => (ends.length >= 2 ? [id] : [...ends, id]))
  }

  /** Borra un nodo, sus vías y cualquier selección que lo use (ruta o vía a medias). */
  const removeNode = (id: string) => {
    update((m) => ({
      ...m,
      nodes: m.nodes.filter((x) => x.id !== id),
      roads: m.roads.filter((r) => r.from !== id && r.to !== id),
    }))
    setPendingNode((p) => (p === id ? null : p))
    setRouteEnds((ends) => (ends.includes(id) ? [] : ends))
  }

  const addReference = (lat: number, lng: number) => {
    if (!pendingRef) return
    const ref: ReferencePoint = { id: uid('ref_'), ...pendingRef, lat, lng }
    update((m) => ({ ...m, references: [...m.references, ref] }))
    setPendingRef(null)
  }

  return {
    map, setMap, update, mode, setMode: (m: EditorMode) => {
      setMode(m)
      setPendingNode(null)
      setPendingRef(null)
    },
    pendingNode, pendingRef, setPendingRef, routeEnds, setRouteEnds, draft, setDraft, saved, setSaved, saveError,
    graph, transform, calibrated, route, instructions, clickImage, clickNode, addReference, removeNode,
  }
}
