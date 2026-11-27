import { cameraState } from '@/features/navigation/cameraState'
import { useNavStore } from '@/store/useNavStore'

/** Tiempo sin tocar el mapa tras el que la vista libre vuelve a seguir al usuario. */
export const FREE_VIEW_RESUME_MS = 15_000

let resumeTimer: ReturnType<typeof setTimeout> | null = null

/** Interacción manual con el mapa: se deja de seguir (vista libre) conservando la pose. */
export function enterFreeView() {
  const nav = useNavStore.getState()
  cameraState.lastInteraction = performance.now()
  if (nav.navigation.following) {
    cameraState.freePose = { ...cameraState.pose }
    nav.setNavFlags({ following: false })
  }
  if (resumeTimer) clearTimeout(resumeTimer)
  resumeTimer = setTimeout(() => {
    const n = useNavStore.getState()
    if (n.navigation.active && !n.navigation.following) n.setNavFlags({ following: true })
  }, FREE_VIEW_RESUME_MS)
}

/** Vuelve a seguir al usuario (botón «Recentrar»). */
export function resumeFollowing() {
  if (resumeTimer) clearTimeout(resumeTimer)
  useNavStore.getState().setNavFlags({ following: true })
}
