import type { RoadType } from '@/features/routing/routeTypes'

export interface ReferencePoint {
  id: string
  /** Píxel de la imagen (origen arriba a la izquierda). */
  x: number
  y: number
  lat: number
  lng: number
}

/** Transformación afín píxel → metros (E, N) respecto a un origen geográfico. */
export interface AffineTransform {
  /** E = a·x + b·y + c ;  N = d·x + e·y + f */
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
  originLat: number
  originLng: number
  /** Métricas derivadas para mostrar al usuario. */
  metersPerPixel: number
  rotationDeg: number
  /** Error medio cuadrático de ajuste (m) si hay ≥ 3 puntos. */
  rmse: number
}

export interface CustomNode {
  id: string
  name: string
  x: number
  y: number
}

export interface CustomRoad {
  id: string
  from: string
  to: string
  name: string
  roadType: RoadType
  oneWay: boolean
  speedLimit: number
}

export interface CustomMap {
  id: string
  name: string
  /** Mapa ficticio/propio: aquí los nombres los define el usuario. */
  fictional: true
  image: { dataUrl: string; width: number; height: number; fileName: string } | null
  references: ReferencePoint[]
  /** Escala manual (m/píxel) si no hay calibración geográfica. */
  manualScale: number
  manualRotationDeg: number
  nodes: CustomNode[]
  roads: CustomRoad[]
  updatedAt: number
}
