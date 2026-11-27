import { useSyncExternalStore } from 'react'
import type { CameraPose } from '@/features/map/camera'

/**
 * Pose actual de la cámara de navegación (cambia en cada fotograma: no va en un store de
 * React). La lee el controlador de la cámara; los componentes que la muestran (brújula)
 * se suscriben con un valor redondeado para no pintarse 60 veces por segundo.
 */
type Listener = () => void
const listeners = new Set<Listener>()

export const cameraState = {
  pose: { bearing: 0, tilt: 0 } as CameraPose,
  /** Pose elegida a mano en la vista libre (girar/inclinar). */
  freePose: { bearing: 0, tilt: 0 } as CameraPose,
  /** Rumbo mostrado de la flecha (suavizado), en grados. */
  heading: 0,
  /** Último instante de interacción manual con el mapa (vista libre). */
  lastInteraction: 0,
}

let roundedBearing = 0
export function publishPose(pose: CameraPose) {
  cameraState.pose = pose
  const r = Math.round(pose.bearing / 3) * 3
  if (r !== roundedBearing) {
    roundedBearing = r
    listeners.forEach((l) => l())
  }
}

/** Rumbo de la cámara redondeado a 3° (para la brújula). */
export function useCameraBearing(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => roundedBearing,
    () => 0,
  )
}

/** Pide al controlador que gire/incline la vista libre (botones de la interfaz). */
type Command = (pose: CameraPose) => CameraPose
let commandHandler: ((c: Command) => void) | null = null
export const setCameraCommandHandler = (h: typeof commandHandler) => {
  commandHandler = h
}
export const adjustFreePose = (c: Command) => commandHandler?.(c)
