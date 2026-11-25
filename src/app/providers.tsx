import { useEffect, type ReactNode } from 'react'
import { useUiDark } from '@/hooks/useUiTheme'

/** Aplica el modo claro/noche de la interfaz al documento. */
export function Providers({ children }: { children: ReactNode }) {
  const dark = useUiDark()
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#070a12' : '#f1f5f9')
  }, [dark])
  return <>{children}</>
}
