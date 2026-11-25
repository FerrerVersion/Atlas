import type { AffineTransform, ReferencePoint } from './customMapTypes'

const M_PER_DEG = 111_320

function toLocalMeters(lat: number, lng: number, originLat: number, originLng: number) {
  return {
    E: (lng - originLng) * M_PER_DEG * Math.cos((originLat * Math.PI) / 180),
    N: (lat - originLat) * M_PER_DEG,
  }
}

function fromLocalMeters(E: number, N: number, originLat: number, originLng: number) {
  return {
    lat: originLat + N / M_PER_DEG,
    lng: originLng + E / (M_PER_DEG * Math.cos((originLat * Math.PI) / 180)),
  }
}

/** Resuelve un sistema 3×3 por Cramer. */
function solve3(m: number[][], v: number[]): number[] | null {
  const det = (a: number[][]) =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0])
  const D = det(m)
  if (Math.abs(D) < 1e-12) return null
  return [0, 1, 2].map((col) => det(m.map((row, i) => row.map((x, j) => (j === col ? v[i] : x)))) / D)
}

function finish(t: Omit<AffineTransform, 'metersPerPixel' | 'rotationDeg' | 'rmse'>, refs: ReferencePoint[]): AffineTransform {
  // Escala media de los ejes y rotación del eje X de la imagen respecto al este.
  const sx = Math.hypot(t.a, t.d)
  const sy = Math.hypot(t.b, t.e)
  const rotationDeg = (Math.atan2(t.d, t.a) * 180) / Math.PI
  let se = 0
  for (const r of refs) {
    const p = { E: t.a * r.x + t.b * r.y + t.c, N: t.d * r.x + t.e * r.y + t.f }
    const q = toLocalMeters(r.lat, r.lng, t.originLat, t.originLng)
    se += (p.E - q.E) ** 2 + (p.N - q.N) ** 2
  }
  return { ...t, metersPerPixel: (sx + sy) / 2, rotationDeg, rmse: refs.length ? Math.sqrt(se / refs.length) : 0 }
}

/**
 * Calcula la transformación imagen → geografía a partir de puntos de referencia.
 *  - 2 puntos: semejanza (escala uniforme + rotación + traslación).
 *  - ≥ 3 puntos: afín por mínimos cuadrados (admite escalas distintas por eje).
 * El eje Y de la imagen crece hacia abajo; el norte, hacia arriba.
 */
export function solveCalibration(refs: ReferencePoint[]): AffineTransform | null {
  if (refs.length < 2) return null
  const originLat = refs[0].lat
  const originLng = refs[0].lng
  const pts = refs.map((r) => ({ x: r.x, y: r.y, ...toLocalMeters(r.lat, r.lng, originLat, originLng) }))

  if (refs.length === 2) {
    const [p, q] = pts
    // Usamos y' = -y para trabajar con un sistema dextrógiro.
    const dx = q.x - p.x
    const dy = -(q.y - p.y)
    const dE = q.E - p.E
    const dN = q.N - p.N
    const len2 = dx * dx + dy * dy
    if (len2 === 0) return null
    // Número complejo s = (dE + i dN) / (dx + i dy)
    const sr = (dE * dx + dN * dy) / len2
    const si = (dN * dx - dE * dy) / len2
    // E = sr·x − si·y' ; N = si·x + sr·y'  con y' = −y
    const a = sr
    const b = si
    const d = si
    const e = -sr
    const c = p.E - (a * p.x + b * p.y)
    const f = p.N - (d * p.x + e * p.y)
    return finish({ a, b, c, d, e, f, originLat, originLng }, refs)
  }

  // Mínimos cuadrados: [x y 1]·[a b c]ᵀ = E (y análogo para N)
  const ata = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  const atE = [0, 0, 0]
  const atN = [0, 0, 0]
  for (const p of pts) {
    const row = [p.x, p.y, 1]
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) ata[i][j] += row[i] * row[j]
      atE[i] += row[i] * p.E
      atN[i] += row[i] * p.N
    }
  }
  const sE = solve3(ata, atE)
  const sN = solve3(ata, atN)
  if (!sE || !sN) return null
  return finish({ a: sE[0], b: sE[1], c: sE[2], d: sN[0], e: sN[1], f: sN[2], originLat, originLng }, refs)
}

/** Transformación manual (sin referencias geográficas): escala y rotación sobre un origen ficticio 0,0. */
export function manualTransform(metersPerPixel: number, rotationDeg: number): AffineTransform {
  const r = (rotationDeg * Math.PI) / 180
  const s = metersPerPixel
  return finish(
    { a: s * Math.cos(r), b: s * Math.sin(r), c: 0, d: s * Math.sin(r), e: -s * Math.cos(r), f: 0, originLat: 0, originLng: 0 },
    [],
  )
}

export function pixelToGeo(t: AffineTransform, x: number, y: number) {
  return fromLocalMeters(t.a * x + t.b * y + t.c, t.d * x + t.e * y + t.f, t.originLat, t.originLng)
}

export function geoToPixel(t: AffineTransform, lat: number, lng: number) {
  const { E, N } = toLocalMeters(lat, lng, t.originLat, t.originLng)
  const det = t.a * t.e - t.b * t.d
  const ex = E - t.c
  const ny = N - t.f
  return { x: (t.e * ex - t.b * ny) / det, y: (-t.d * ex + t.a * ny) / det }
}
