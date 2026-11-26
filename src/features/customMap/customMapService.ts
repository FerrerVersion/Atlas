import { addNode, addRoad, createGraph, toRoadType } from '@/features/routing/graph'
import type { RoadGraph, RoadType } from '@/features/routing/routeTypes'
import { cacheDelete, cacheGet, cacheKeys, cacheSet } from '@/utils/storage'
import type { CustomMap, CustomNode, CustomRoad, ReferencePoint } from './customMapTypes'
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

/* ------------------------------ Límites de importación ------------------------------ */

/** Tamaño máximo de un archivo JSON importado. */
export const MAX_JSON_BYTES = 30 * 1024 * 1024
/** Tamaño máximo de una imagen de mapa (archivo). */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024
/** Lado máximo y megapíxeles máximos de la imagen (memoria del navegador). */
export const MAX_IMAGE_SIDE = 8192
export const MAX_IMAGE_PIXELS = 40_000_000
export const MAX_NODES = 5_000
export const MAX_ROADS = 20_000
export const MAX_REFERENCES = 50
const MAX_NAME = 120
/** Solo imágenes incrustadas en el propio archivo: nunca URLs externas. */
const DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const text = (v: unknown, fallback = '') => (typeof v === 'string' ? v.trim().slice(0, MAX_NAME) : fallback)
const validRoadType = (v: unknown): v is RoadType => typeof v === 'string' && (v === 'custom' || toRoadType(v) !== null)

function imageSizeOk(w: unknown, h: unknown) {
  return num(w) && num(h) && w > 0 && h > 0 && w <= MAX_IMAGE_SIDE && h <= MAX_IMAGE_SIDE && w * h <= MAX_IMAGE_PIXELS
}

/**
 * Lee un mapa exportado por Atlas validando TODO su contenido: tipos, límites de
 * tamaño, referencias geográficas posibles y que la imagen esté incrustada (data:)
 * y no sea una dirección externa que el navegador fuese a descargar.
 */
export function importCustomMap(json: unknown): CustomMap {
  if (!isObj(json) || json.format !== 'atlas-custom-map') throw new Error('El archivo no es un mapa personalizado de Atlas.')
  const d = json
  const damaged = (detail: string) => new Error(`El mapa está dañado: ${detail}`)

  const rawNodes = d.nodes ?? []
  const rawRoads = d.roads ?? []
  if (!Array.isArray(rawNodes) || !Array.isArray(rawRoads)) throw damaged('hay nodos o vías con datos no válidos.')
  if (rawNodes.length > MAX_NODES || rawRoads.length > MAX_ROADS) {
    throw new Error(`El mapa es demasiado grande (máximo ${MAX_NODES} nodos y ${MAX_ROADS} vías).`)
  }

  const nodes: CustomNode[] = []
  const ids = new Set<string>()
  for (const n of rawNodes) {
    if (!isObj(n) || typeof n.id !== 'string' || !n.id || n.id.length > 100 || ids.has(n.id) || !num(n.x) || !num(n.y)) {
      throw damaged('hay nodos o vías con datos no válidos.')
    }
    ids.add(n.id)
    nodes.push({ id: n.id, name: text(n.name), x: n.x, y: n.y })
  }

  const roads: CustomRoad[] = []
  for (const r of rawRoads) {
    if (
      !isObj(r) || typeof r.from !== 'string' || typeof r.to !== 'string' || !ids.has(r.from) || !ids.has(r.to) ||
      r.from === r.to || !num(r.speedLimit) || r.speedLimit <= 0 || r.speedLimit > 200
    ) {
      throw damaged('hay nodos o vías con datos no válidos.')
    }
    roads.push({
      id: typeof r.id === 'string' && r.id ? r.id.slice(0, 100) : `r_${roads.length}`,
      from: r.from,
      to: r.to,
      name: text(r.name),
      roadType: validRoadType(r.roadType) ? r.roadType : 'custom',
      oneWay: r.oneWay === true,
      speedLimit: r.speedLimit,
    })
  }

  const calibration = isObj(d.calibration) ? d.calibration : {}
  const rawRefs = Array.isArray(calibration.references) ? calibration.references : []
  if (rawRefs.length > MAX_REFERENCES) throw damaged('tiene demasiados puntos de referencia.')
  const references: ReferencePoint[] = rawRefs.map((p, i) => {
    if (!isObj(p) || !num(p.x) || !num(p.y) || !num(p.lat) || !num(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) {
      throw damaged('hay puntos de referencia con coordenadas imposibles.')
    }
    return { id: typeof p.id === 'string' && p.id ? p.id.slice(0, 100) : `ref_${i}`, x: p.x, y: p.y, lat: p.lat, lng: p.lng }
  })

  let image: CustomMap['image'] = null
  if (d.image !== null && d.image !== undefined) {
    if (!isObj(d.image) || !imageSizeOk(d.image.width, d.image.height)) throw damaged('la imagen no tiene un tamaño válido.')
    const dataUrl = d.image.dataUrl
    if (dataUrl !== undefined && dataUrl !== null) {
      if (typeof dataUrl !== 'string' || !DATA_URL.test(dataUrl)) {
        throw new Error('La imagen del mapa no es válida: solo se admiten imágenes PNG, JPG o WebP incluidas en el propio archivo.')
      }
      if (dataUrl.length > Math.ceil(MAX_IMAGE_BYTES * 1.37)) throw new Error('La imagen del mapa es demasiado grande (máx. 15 MB).')
      image = { dataUrl, width: d.image.width as number, height: d.image.height as number, fileName: text(d.image.fileName, 'imagen') }
    }
  }

  return {
    ...emptyCustomMap(),
    name: text(d.name, 'Mapa importado') || 'Mapa importado',
    image,
    references,
    manualScale: num(d.manualScale) && d.manualScale > 0 && d.manualScale <= 10_000 ? d.manualScale : 1,
    manualRotationDeg: num(d.manualRotationDeg) ? d.manualRotationDeg : 0,
    nodes,
    roads,
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
    if (file.size > MAX_IMAGE_BYTES) {
      reject(new Error('La imagen es demasiado grande (máx. 15 MB).'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    reader.onload = () => {
      const dataUrl = reader.result as string
      const img = new Image()
      img.onload = () => {
        if (!imageSizeOk(img.naturalWidth, img.naturalHeight)) {
          reject(new Error(`La imagen es demasiado grande (máx. ${MAX_IMAGE_SIDE} px por lado y 40 megapíxeles).`))
          return
        }
        resolve({ dataUrl, width: img.naturalWidth, height: img.naturalHeight, fileName: file.name })
      }
      img.onerror = () => reject(new Error('La imagen está dañada.'))
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  })
}
