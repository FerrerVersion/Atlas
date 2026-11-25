/**
 * Proveedores de teselas ráster intercambiables. Para añadir uno nuevo basta con
 * registrarlo aquí y referenciar su id desde un tema. Ninguno requiere clave API.
 */
export type TileProviderId =
  | 'osm'
  | 'esri-street'
  | 'esri-light-gray'
  | 'esri-light-gray-labels'
  | 'esri-dark-gray'
  | 'esri-dark-gray-labels'
  | 'esri-imagery'
  | 'opentopomap'

export interface TileProvider {
  id: TileProviderId
  name: string
  url: string
  attribution: string
  subdomains?: string
  maxNativeZoom: number
  /** Política de uso resumida (documentada en el README). */
  policy: string
}

const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'
const ESRI_CANVAS_ATTR = 'Teselas &copy; <a href="https://www.esri.com" target="_blank" rel="noreferrer">Esri</a> &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors'
const ESRI_POLICY = 'Esri ArcGIS Online basemaps: uso con atribución según los términos de Esri (no requiere clave para uso ligero).'

const esri = (id: TileProviderId, path: string, name: string, attribution: string, maxNativeZoom: number): TileProvider => ({
  id,
  name,
  url: `${ESRI}/${path}/MapServer/tile/{z}/{y}/{x}`,
  attribution,
  maxNativeZoom,
  policy: ESRI_POLICY,
})

/*
 * Nota: los basemaps de CARTO pasaron a exigir clave API, por eso no se usan.
 * Todos los proveedores siguientes funcionan sin clave.
 */
export const TILE_PROVIDERS: Record<TileProviderId, TileProvider> = {
  osm: {
    id: 'osm',
    name: 'OpenStreetMap estándar',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: OSM_ATTR,
    maxNativeZoom: 19,
    policy: 'OSMF Tile Usage Policy: uso ligero, atribución obligatoria, sin descargas masivas.',
  },
  'esri-street': esri('esri-street', 'World_Street_Map', 'Esri World Street Map', ESRI_CANVAS_ATTR, 19),
  'esri-light-gray': esri('esri-light-gray', 'Canvas/World_Light_Gray_Base', 'Esri Light Gray Canvas', ESRI_CANVAS_ATTR, 16),
  'esri-light-gray-labels': esri('esri-light-gray-labels', 'Canvas/World_Light_Gray_Reference', 'Esri Light Gray (etiquetas)', ESRI_CANVAS_ATTR, 16),
  'esri-dark-gray': esri('esri-dark-gray', 'Canvas/World_Dark_Gray_Base', 'Esri Dark Gray Canvas', ESRI_CANVAS_ATTR, 16),
  'esri-dark-gray-labels': esri('esri-dark-gray-labels', 'Canvas/World_Dark_Gray_Reference', 'Esri Dark Gray (etiquetas)', ESRI_CANVAS_ATTR, 16),
  'esri-imagery': esri(
    'esri-imagery',
    'World_Imagery',
    'Esri World Imagery',
    'Imágenes &copy; <a href="https://www.esri.com" target="_blank" rel="noreferrer">Esri</a>, Maxar, Earthstar Geographics, GIS User Community',
    19,
  ),
  opentopomap: {
    id: 'opentopomap',
    name: 'OpenTopoMap',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: `${OSM_ATTR}, SRTM | Estilo: &copy; <a href="https://opentopomap.org" target="_blank" rel="noreferrer">OpenTopoMap</a> (CC-BY-SA)`,
    subdomains: 'abc',
    maxNativeZoom: 17,
    policy: 'OpenTopoMap: CC-BY-SA, servidor comunitario, uso moderado.',
  },
}
