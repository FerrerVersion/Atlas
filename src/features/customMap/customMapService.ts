import { addNode, addRoad, createGraph } from '@/features/routing/graph'
import type { RoadGraph } from '@/features/routing/routeTypes'
import { cacheDelete, cacheGet, cacheKeys, cacheSet } from '@/utils/storage'
import type { CustomMap } from './customMapTypes'
import { manualTransform, pixelToGeo, solveCalibration } from './imageCalibration'

const PREFIX = 'custom-map:'

export function emptyCustomMap(): CustomMap {
  return {
    id: `cm_${Date.now().toString(36)}`,
    name: 'Mi mapa',
    fictional: true,
    image: null,
    references: [],
    manualScale: 1,
    manualRotationDeg: 0,
    nodes: [],
    roads: [],
    updatedAt: Date.now(),
  }
}

/** Transformación activa: calibración con referencias si hay ≥ 2, o escala manual. */
export function activeTransform(map: CustomMap) {
  return solveCalibration(map.references) ?? manualTransform(map.manualScale, map.manualRotationDeg)
}

export const isGeoCalibrated = (map: CustomMap) => map.references.length >= 2 && solveCalibration(map.references) !== null

/** Grafo del mapa propio: coordenadas transformadas → mismo motor A* que los mapas reales. */
export function buildCustomGraph(map: CustomMap): RoadGraph {
  const t = activeTransform(map)
  const g = createGraph()
  for (const n of map.nodes) {
    const geo = pixelToGeo(t, n.x, n.y)
    addNode(g, { id: n.id, name: n.name || undefined, lat: geo.lat, lng: geo.lng, type: 'intersection' })
  }
  for (const r of map.roads) {
    if (!g.nodes.has(r.from) || !g.nodes.has(r.to)) continue
    addRoad(g, {
      id: r.id,
      from: r.from,
      to: r.to,
      name: r.name || undefined,
      roadType: r.roadType,
      oneWay: r.oneWay,
      speedLimit: r.speedLimit,
      sourceId: r.id,
    })
  }
  return g
}

/* ------------------------- Persistencia local (IndexedDB) ------------------------- */

export async function saveCustomMap(map: CustomMap) {
  await cacheSet(PREFIX + map.id, { ...map, updatedAt: Date.now() })
}

export async function listCustomMaps(): Promise<CustomMap[]> {
  const keys = await cacheKeys(PREFIX)
  const maps = await Promise.all(keys.map((k) => cacheGet<CustomMap>(k)))
  return maps.filter((m): m is CustomMap => !!m).sort((a, b) => b.updatedAt - a.updatedAt)
}

export const deleteCustomMap = (id: string) => cacheDelete(PREFIX + id)

/* --------------------------------- Exportación --------------------------------- */

export function exportCustomMap(map: CustomMap, includeImage: boolean) {
  const t = activeTransform(map)
  const geoCalibrated = isGeoCalibrated(map)
  return {
    format: 'atlas-custom-map',
    version: 1,
    name: map.name,
    fictional: true,
    calibration: {
      mode: geoCalibrated ? 'geographic' : 'manual',
      references: map.references,
      transform: t,
    },
    image: map.image
      ? { width: map.image.width, height: map.image.height, fileName: map.image.fileName, dataUrl: includeImage ? map.image.dataUrl : undefined }
      : null,
    nodes: map.nodes.map((n) => ({ ...n, ...(geoCalibrated ? pixelToGeo(t, n.x, n.y) : {}) })),
    roads: map.roads,
    manualScale: map.manualScale,
    manualRotationDeg: map.manualRotationDeg,
  }
}

export function importCustomMap(json: unknown): CustomMap {
  const d = json as ReturnType<typeof exportCustomMap>
  if (!d || d.format !== 'atlas-custom-map') throw new Error('El archivo no es un mapa personalizado de Atlas.')
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
  const nodesOk = Array.isArray(d.nodes ?? []) && (d.nodes ?? []).every((n) => typeof n?.id === 'string' && num(n.x) && num(n.y))
  const ids = new Set((d.nodes ?? []).map((n) => n.id))
  const roadsOk =
    Array.isArray(d.roads ?? []) &&
    (d.roads ?? []).every((r) => ids.has(r?.from) && ids.has(r?.to) && num(r.speedLimit) && r.speedLimit > 0)
  if (!nodesOk || !roadsOk) throw new Error('El mapa está dañado: hay nodos o vías con datos no válidos.')
  return {
    ...emptyCustomMap(),
    name: d.name ?? 'Mapa importado',
    image: d.image?.dataUrl ? { ...d.image, dataUrl: d.image.dataUrl } : null,
    references: d.calibration?.references ?? [],
    manualScale: d.manualScale ?? 1,
    manualRotationDeg: d.manualRotationDeg ?? 0,
    nodes: (d.nodes ?? []).map(({ id, name, x, y }) => ({ id, name: typeof name === 'string' ? name : '', x, y })),
    roads: d.roads ?? [],
  }
}

export function downloadJson(data: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Lee la imagen localmente (FileReader). Nunca se sube a ningún servidor. */
export function readImageFile(file: File): Promise<NonNullable<CustomMap['image']>> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      reject(new Error('Formato no admitido. Usa PNG, JPG o WebP.'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    reader.onload = () => {
      const dataUrl = reader.result as string
      const img = new Image()
      img.onload = () => resolve({ dataUrl, width: img.naturalWidth, height: img.naturalHeight, fileName: file.name })
      img.onerror = () => reject(new Error('La imagen está dañada.'))
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  })
}
