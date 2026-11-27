import { useEffect } from 'react'

type LockableOrientation = ScreenOrientation & { lock?: (o: 'landscape') => Promise<void>; unlock?: () => void }

/**
 * Al activar el Modo Rally en un dispositivo táctil se pide pantalla completa y orientación
 * horizontal. Muchos navegadores no lo permiten (iOS Safari, o Android fuera de pantalla
 * completa): entonces no pasa nada y la interfaz pide girar el teléfono. Al salir se
 * deshace solo lo que se hizo. En el ordenador no se toca nada.
 */
export function useLandscapeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof window === 'undefined' || !window.matchMedia('(pointer: coarse)').matches) return
    let locked = false
    let enteredFullscreen = false
    let cancelled = false
    const orientation = screen.orientation as LockableOrientation | undefined
    ;(async () => {
      try {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
          enteredFullscreen = true
        }
      } catch {
        /* sin permiso o no disponible: seguimos sin pantalla completa */
      }
      if (cancelled) return
      try {
        await orientation?.lock?.('landscape')
        locked = true
      } catch {
        /* el navegador no deja bloquear la orientación: se muestra el aviso de girar */
      }
    })()
    return () => {
      cancelled = true
      if (locked) orientation?.unlock?.()
      if (enteredFullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => undefined)
    }
  }, [active])
}
