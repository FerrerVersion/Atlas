import { useEffect, useState } from 'react'
import { getTheme, NIGHT_THEME_ID } from '@/features/themes/themeRegistry'
import type { MapTheme } from '@/features/themes/themeTypes'
import { useAppStore } from '@/store/useAppStore'

function useSystemDark() {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const fn = (e: MediaQueryListEvent) => setDark(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  return dark
}

export const isNightHour = (d = new Date()) => d.getHours() >= 20 || d.getHours() < 7

/** Modo de la interfaz (claro/oscuro), independiente del estilo del mapa. */
export function useUiDark() {
  const mode = useAppStore((s) => s.uiMode)
  const sys = useSystemDark()
  return mode === 'system' ? sys : mode === 'dark'
}

/** Tema de mapa efectivo (con el cambio automático nocturno opcional). */
export function useMapTheme(): MapTheme {
  const id = useAppStore((s) => s.themeId)
  const autoNight = useAppStore((s) => s.autoNightTheme)
  const [night, setNight] = useState(isNightHour)
  useEffect(() => {
    if (!autoNight) return
    const t = setInterval(() => setNight(isNightHour()), 60_000)
    return () => clearInterval(t)
  }, [autoNight])
  const theme = getTheme(id)
  if (autoNight && night && !theme.isDark) return getTheme(NIGHT_THEME_ID)
  return theme
}

export function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const fn = (e: MediaQueryListEvent) => setMatch(e.matches)
    mq.addEventListener('change', fn)
    setMatch(mq.matches)
    return () => mq.removeEventListener('change', fn)
  }, [query])
  return match
}
