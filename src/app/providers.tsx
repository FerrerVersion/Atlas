import { useEffect, type ReactNode } from 'react'
import { uiAccentFor } from '@/features/themes/uiAccent'
import { useMapTheme, useUiDark } from '@/hooks/useUiTheme'

/**
 * Aplica el modo claro/noche de la interfaz al documento y el color de acento de la
 * interfaz derivado del tema (con contraste suficiente para textos y botones).
 */
export function Providers({ children }: { children: ReactNode }) {
  const dark = useUiDark()
  const themeAccent = useMapTheme().colors.accent
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#070a12' : '#f1f5f9')
  }, [dark])
  useEffect(() => {
    const { accent, onAccent } = uiAccentFor(themeAccent, dark)
    const root = document.documentElement.style
    root.setProperty('--ui-accent', accent)
    root.setProperty('--ui-on-accent', onAccent)
  }, [themeAccent, dark])
  return <>{children}</>
}
