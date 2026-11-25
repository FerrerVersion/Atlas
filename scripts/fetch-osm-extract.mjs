#!/usr/bin/env node
/**
 * Descarga un extracto REAL de OpenStreetMap (vía Overpass API) y lo guarda
 * en src/data como dataset de demostración offline.
 *
 * Datos © OpenStreetMap contributors, licencia ODbL 1.0.
 *
 * Uso:
 *   node scripts/fetch-osm-extract.mjs                 # Buñol (por defecto)
 *   node scripts/fetch-osm-extract.mjs "Nombre" s,w,n,e
 *
 * Hace solo DOS peticiones (carreteras + POIs) para respetar la política de uso.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ENDPOINT = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter'
const name = process.argv[2] ?? 'Buñol'
const bbox = (process.argv[3] ?? '39.4105,-0.8010,39.4265,-0.7800').split(',').map(Number)
const [s, w, n, e] = bbox
const b = `${s},${w},${n},${e}`

async function overpass(query, attempt = 1) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'atlas-nav-demo-extract/1.0',
    },
    body: new URLSearchParams({ data: query }),
  })
  if (!res.ok) {
    if (attempt < 4 && [429, 502, 503, 504].includes(res.status)) {
      console.log(`Overpass HTTP ${res.status}, reintento ${attempt} en ${attempt * 5}s…`)
      await new Promise((r) => setTimeout(r, attempt * 5000))
      return overpass(query, attempt + 1)
    }
    throw new Error(`Overpass HTTP ${res.status}`)
  }
  return res.json()
}

const KEEP_WAY_TAGS = ['highway', 'name', 'ref', 'oneway', 'maxspeed', 'junction', 'bridge', 'tunnel', 'access']
const KEEP_POI_TAGS = [
  'name', 'amenity', 'shop', 'tourism', 'historic', 'aeroway', 'harbour', 'leisure',
  'addr:street', 'addr:housenumber', 'addr:city', 'addr:postcode', 'place', 'brand', 'opening_hours',
]

function pick(tags, keys) {
  const out = {}
  for (const k of keys) if (tags?.[k] !== undefined) out[k] = tags[k]
  return out
}

const roadsQuery = `[out:json][timeout:60];way[highway](${b});out body geom;`
const poisQuery = `[out:json][timeout:60];(
  nwr[amenity~"^(fuel|restaurant|cafe|fast_food|parking|hospital|clinic|police|pharmacy)$"](${b});
  nwr[shop](${b});
  nwr[tourism~"^(attraction|museum|viewpoint|hotel)$"](${b});
  nwr[historic](${b});
  node[place~"^(neighbourhood|suburb|quarter)$"](${b});
);out center tags;`

console.log(`Descargando extracto OSM de ${name} [${b}] desde ${ENDPOINT}`)
const roads = await overpass(roadsQuery)
await new Promise((r) => setTimeout(r, 2000))
const pois = await overpass(poisQuery)

const ways = roads.elements
  .filter((el) => el.type === 'way' && Array.isArray(el.geometry))
  .map((el) => ({
    type: 'way',
    id: el.id,
    nodes: el.nodes,
    geometry: el.geometry.map((p) => ({ lat: +p.lat.toFixed(7), lon: +p.lon.toFixed(7) })),
    tags: pick(el.tags, KEEP_WAY_TAGS),
  }))

const poiElements = pois.elements
  .map((el) => {
    const lat = el.lat ?? el.center?.lat
    const lon = el.lon ?? el.center?.lon
    if (lat === undefined || lon === undefined) return null
    return { type: el.type, id: el.id, lat: +lat.toFixed(7), lon: +lon.toFixed(7), tags: pick(el.tags, KEEP_POI_TAGS) }
  })
  .filter(Boolean)

const meta = {
  name,
  bbox: { south: s, west: w, north: n, east: e },
  center: { lat: (s + n) / 2, lng: (w + e) / 2 },
  source: 'OpenStreetMap (Overpass API)',
  license: 'ODbL 1.0 — © OpenStreetMap contributors',
  osmTimestamp: roads.osm3s?.timestamp_osm_base ?? null,
  downloadedAt: new Date().toISOString(),
}

const dataDir = resolve(import.meta.dirname, '../src/data')
writeFileSync(resolve(dataDir, 'demoCity.json'), JSON.stringify(meta, null, 2) + '\n')
writeFileSync(resolve(dataDir, 'demoRoads.json'), JSON.stringify({ meta, elements: ways }) + '\n')
writeFileSync(resolve(dataDir, 'demoPOIs.json'), JSON.stringify({ meta, elements: poiElements }) + '\n')
console.log(`OK: ${ways.length} vías, ${poiElements.length} POIs`)
