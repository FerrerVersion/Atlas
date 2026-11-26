import L from 'leaflet'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isBackgroundPaused, setBackgroundPaused, whenBackgroundAllowed } from '@/features/osm/backgroundGate'
import {
  compactWays,
  expandWays,
  REGION_RADIUS_M,
  regionalQuery,
  regionCells,
  toRegionalWays,
} from '@/features/osm/regionalRoads'
import { chunkSamples, corridorQuery, sampleRoute } from '@/features/osm/routeCorridor'
import {
  capBulk,
  latToTileY,
  lngToTileX,
  MAX_BULK_TILES,
  REGION_ZOOMS,
  themeTileUrls,
  tilesInBBox,
  tileUrl,
} from '@/features/map/tilePrefetch'
import { corridorTiles } from '@/hooks/useRouteCorridor'
import { regionCenterFor } from '@/hooks/useRegionalPreload'
import type { MultiRoute } from '@/features/routing/routeTypes'
import { bboxAround } from '@/utils/geometry'
import { haversine, polylineLength, type LatLngTuple } from '@/utils/distance'

afterEach(() => {
  setBackgroundPaused(false)
  vi.unstubAllGlobals()
})

/** Línea recta hacia el este desde València, de `km` kilómetros. */
const lineEast = (km: number): LatLngTuple[] =>
  Array.from({ length: km * 10 + 1 }, (_, i) => [39.47, -0.38 + (i * 100) / (111_320 * Math.cos((39.47 * Math.PI) / 180))])

describe('zona regional de 200 km', () => {
  it('cubre el círculo con celdas fijas, de la más cercana a la más lejana', () => {
    const cells = regionCells(39.47, -0.38)
    expect(cells[0].distance).toBe(0) // la celda donde está el usuario va primero
    for (let i = 1; i < cells.length; i++) expect(cells[i].distance).toBeGreaterThanOrEqual(cells[i - 1].distance)
    expect(cells.every((c) => c.distance <= REGION_RADIUS_M)).toBe(true)
    // Cualquier punto a 190 km queda dentro de alguna celda.
    for (const deg of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const r = (deg * Math.PI) / 180
      const lat = 39.47 + (190_000 * Math.cos(r)) / 111_320
      const lng = -0.38 + (190_000 * Math.sin(r)) / (111_320 * Math.cos((39.47 * Math.PI) / 180))
      expect(cells.some((c) => lat >= c.bbox.south && lat <= c.bbox.north && lng >= c.bbox.west && lng <= c.bbox.east)).toBe(true)
    }
    // Celdas alineadas: moverse un poco reutiliza las mismas (y su caché).
    const keys = new Set(regionCells(39.5, -0.35).map((c) => c.key))
    expect(cells.filter((c) => keys.has(c.key)).length).toBeGreaterThan(cells.length * 0.8)
  })

  it('pide solo autopistas y autovías, sin etiquetas que no se dibujan', () => {
    const q = regionalQuery({ south: 39, west: -1, north: 40, east: 0 })
    expect(q).toContain('motorway|motorway_link|trunk|trunk_link')
    expect(q).not.toContain('primary')
    expect(q).toContain('convert way')
  })

  it('entiende las dos formas de geometría de Overpass y las compacta sin perder precisión', () => {
    const ways = toRegionalWays([
      { type: 'way', id: '7', tags: { highway: 'motorway' }, geometry: { type: 'LineString', coordinates: [[-0.4463049, 39.5448366], [-0.4451031, 39.5459905]] } },
      { type: 'way', id: 8, tags: { highway: 'trunk' }, geometry: [{ lat: 39.1, lon: -0.5 }, { lat: 39.2, lon: -0.6 }] },
      { type: 'way', id: 9, tags: {}, geometry: [{ lat: 39.1, lon: -0.5 }, { lat: 39.2, lon: -0.6 }] },
      { type: 'way', id: 10, tags: { highway: 'trunk' }, geometry: [{ lat: 39.1, lon: -0.5 }] },
    ])
    expect(ways.map((w) => w.id)).toEqual([7, 8])
    expect(ways[0].geometry[0]).toEqual([39.5448366, -0.4463049]) // [lat, lng]
    const back = expandWays(compactWays(ways))
    expect(back.map((w) => [w.id, w.highway])).toEqual([[7, 'motorway'], [8, 'trunk']])
    for (let i = 0; i < ways.length; i++) {
      ways[i].geometry.forEach(([lat, lng], j) => {
        expect(haversine(lat, lng, back[i].geometry[j][0], back[i].geometry[j][1])).toBeLessThan(1.5)
      })
    }
  })

  it('solo cambia de centro al alejarse más de 50 km (las lecturas del GPS no relanzan nada)', () => {
    const a = regionCenterFor({ lat: 39.47, lng: -0.38 })
    expect(regionCenterFor({ lat: 39.48, lng: -0.37 })).toBe(a)
    expect(regionCenterFor({ lat: 39.8, lng: -0.38 })).toBe(a) // ~37 km
    expect(regionCenterFor({ lat: 40.1, lng: -0.38 })).not.toBe(a) // ~70 km
  })
})

describe('teselas', () => {
  it('calcula la tesela de un punto como Leaflet (Valencia, z10)', () => {
    const p = L.CRS.EPSG3857.latLngToPoint(L.latLng(39.4699, -0.3763), 10).divideBy(256).floor()
    expect([lngToTileX(-0.3763, 10), latToTileY(39.4699, 10)]).toEqual([p.x, p.y])
  })

  it('usa el mismo subdominio que Leaflet y respeta el zoom nativo del proveedor', () => {
    expect(tileUrl({ provider: 'opentopomap' }, { x: 1, y: 1, z: 3 })).toBe('https://c.tile.opentopomap.org/3/1/1.png')
    expect(tileUrl({ provider: 'osm' }, { x: 510, y: 391, z: 10 })).toBe('https://tile.openstreetmap.org/10/510/391.png')
    const urls = themeTileUrls([{ provider: 'esri-dark-gray' }], [{ x: 0, y: 0, z: 17 }, { x: 0, y: 0, z: 10 }])
    expect(urls).toEqual(['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/10/0/0'])
  })

  it('la zona regional son unos cientos de teselas por capa, todas por debajo del zoom 13', () => {
    const box = bboxAround(39.47, -0.38, REGION_RADIUS_M)
    const tiles = REGION_ZOOMS.flatMap((z) => tilesInBBox(box, z))
    expect(tiles.length).toBeGreaterThan(150)
    expect(tiles.length).toBeLessThan(450)
    expect(Math.max(...tiles.map((t) => t.z))).toBeLessThan(13)
  })

  it('nunca precarga más de 250 teselas de zoom ≥ 13 (política de OSM)', () => {
    const many = Array.from({ length: 600 }, (_, i) => ({ x: i, y: 0, z: i % 2 ? 14 : 12 }))
    const capped = capBulk(many)
    expect(capped.filter((t) => t.z >= 13)).toHaveLength(MAX_BULK_TILES)
    expect(capped.filter((t) => t.z < 13)).toHaveLength(300)
  })
})

describe('corredor de 5 km alrededor de la ruta', () => {
  it('simplifica la ruta a un punto cada ~1,5 km y la parte en tramos que se solapan', () => {
    const route = lineEast(100)
    const samples = sampleRoute(route)
    expect(samples[0]).toBe(route[0])
    expect(samples.at(-1)).toBe(route.at(-1))
    expect(samples.length).toBeGreaterThan(60)
    expect(samples.length).toBeLessThan(72)
    const chunks = chunkSamples(samples)
    expect(chunks.length).toBe(3) // 100 km en tramos de 40 km
    for (let i = 1; i < chunks.length; i++) expect(chunks[i][0]).toBe(chunks[i - 1].at(-1)) // sin huecos
    expect(chunks.flat().length).toBe(samples.length + chunks.length - 1)
    // Una ruta corta es un solo tramo.
    expect(chunkSamples(sampleRoute(lineEast(3)))).toHaveLength(1)
  })

  it('consulta las vías a ≤ 5 km de la línea (sin calles residenciales)', () => {
    const q = corridorQuery([[39.47, -0.38], [39.48, -0.37]])
    expect(q).toContain('(around:5000,39.47000,-0.38000,39.48000,-0.37000)')
    expect(q).toContain('unclassified')
    expect(q).not.toContain('residential')
  })

  it('teselas a lo largo del trayecto al zoom de la ruta y uno más, con el límite de OSM', () => {
    const route = { geometry: lineEast(30) } as MultiRoute
    const tiles = corridorTiles(route, 12)
    expect(new Set(tiles.map((t) => t.z))).toEqual(new Set([12, 13]))
    expect(tiles.filter((t) => t.z >= 13).length).toBeLessThanOrEqual(MAX_BULK_TILES)
    // Una ruta muy larga a zoom alto también se recorta.
    expect(corridorTiles({ geometry: lineEast(200) } as MultiRoute, 14).length).toBe(MAX_BULK_TILES)
    expect(polylineLength(route.geometry)).toBeCloseTo(30_000, -2)
  })
})

describe('prioridad: mientras se calcula una ruta, lo demás espera', () => {
  it('las cargas de fondo esperan a que termine el cálculo', async () => {
    setBackgroundPaused(true)
    expect(isBackgroundPaused()).toBe(true)
    let resumed = false
    const p = whenBackgroundAllowed().then(() => (resumed = true))
    await Promise.resolve()
    expect(resumed).toBe(false)
    setBackgroundPaused(false)
    await p
    expect(resumed).toBe(true)
  })

  it('una consulta de fondo no empieza mientras hay una consulta normal en marcha ni durante una ruta', async () => {
    const { queryOverpass } = await import('@/features/osm/overpassService')
    const order: string[] = []
    let releaseNormal!: () => void
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const q = new URLSearchParams(String(init.body)).get('data')!
        order.push(q.includes('normal') ? 'normal' : 'fondo')
        if (q.includes('normal')) await new Promise<void>((r) => (releaseNormal = r))
        return Response.json({ elements: [] })
      }),
    )
    const normal = queryOverpass(`[out:json];way(normal${Math.random()});out;`)
    await vi.waitFor(() => expect(order).toEqual(['normal']))
    const fondo = queryOverpass(`[out:json];way(fondo${Math.random()});out;`, undefined, undefined, undefined, {
      background: true,
      cache: false,
    })
    await new Promise((r) => setTimeout(r, 900))
    expect(order).toEqual(['normal']) // sigue esperando
    setBackgroundPaused(true)
    releaseNormal()
    await normal
    await new Promise((r) => setTimeout(r, 900))
    expect(order).toEqual(['normal']) // en pausa por la ruta
    setBackgroundPaused(false)
    await fondo
    expect(order).toEqual(['normal', 'fondo'])
  })

  it('una consulta de fondo cancelada corta la descarga real', async () => {
    const { queryOverpass } = await import('@/features/osm/overpassService')
    let aborted = false
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) =>
            init.signal!.addEventListener('abort', () => {
              aborted = true
              reject(new DOMException('aborted', 'AbortError'))
            }),
          ),
      ),
    )
    const ctrl = new AbortController()
    const p = queryOverpass(`[out:json];way(c${Math.random()});out;`, ctrl.signal, undefined, undefined, {
      background: true,
      cache: false,
    })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    ctrl.abort()
    await expect(p).rejects.toThrow()
    expect(aborted).toBe(true)
  })
})

describe('el corredor de la ruta va antes que la zona de 200 km', () => {
  it('la zona espera mientras se carga el corredor y se le avisa para soltar su consulta', async () => {
    const { holdLowPriority, onBackgroundPause } = await import('@/features/osm/backgroundGate')
    let stopped = 0
    const off = onBackgroundPause(() => stopped++, true)
    const release = holdLowPriority()
    expect(stopped).toBe(1)
    let lowDone = false
    let normalDone = false
    const low = whenBackgroundAllowed(undefined, true).then(() => (lowDone = true))
    await whenBackgroundAllowed().then(() => (normalDone = true)) // el corredor sí puede
    await Promise.resolve()
    expect(normalDone).toBe(true)
    expect(lowDone).toBe(false)
    release()
    await low
    expect(lowDone).toBe(true)
    off()
  })
})
