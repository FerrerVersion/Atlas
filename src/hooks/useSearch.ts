import { useEffect, useMemo, useState } from 'react'
import type { Place } from '@/features/geocoding/geocodingService'
import { hasCachedRemote, searchInstant, searchPlaces } from '@/features/search/searchService'
import { isAbortError } from '@/utils/http'
import { useAppStore } from '@/store/useAppStore'

/** Espera antes de consultar al servidor mientras se escribe. */
const DEBOUNCE_MS = 180

/**
 * Búsqueda en dos fases:
 *  1. Al instante (sin red): coordenadas, categorías, favoritos/historial y calles/POIs ya cargados.
 *  2. Tras un antirrebote corto, el servidor (Photon; Nominatim con Enter). Se cancelan
 *     las peticiones obsoletas y se cachean las respuestas.
 */
export function useSearch(query: string, submitNonce = 0) {
  const [remote, setRemote] = useState<{ key: string; places: Place[] } | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const q = query.trim()
  const key = `${q}|${submitNonce}`

  const opts = () => {
    const { lastView, pois, favorites, history } = useAppStore.getState()
    return { near: { lat: lastView.lat, lng: lastView.lng }, pois, saved: [...favorites, ...history] }
  }
  // Fase 1: cálculo síncrono y barato en cada tecla.
  const instant = useMemo(() => (q.length >= 2 ? searchInstant(q, opts()) : []), [q])

  useEffect(() => {
    if (q.length < 2) return
    const controller = new AbortController()
    const submit = submitNonce > 0
    const o = opts()
    // Si la respuesta ya está en caché no hace falta esperar al antirrebote.
    const delay = submit || hasCachedRemote(q, o.near) ? 0 : DEBOUNCE_MS
    const t = setTimeout(async () => {
      setStatus('loading')
      setError(null)
      try {
        const found = await searchPlaces(q, { ...o, signal: controller.signal, submit })
        setRemote({ key: `${q}|${submitNonce}`, places: found })
        setStatus('idle')
      } catch (e) {
        if (isAbortError(e)) return
        setStatus('error')
        setError('El servicio de búsqueda no responde. Revisa la conexión e inténtalo de nuevo.')
      }
    }, delay)
    return () => {
      clearTimeout(t)
      controller.abort()
    }
  }, [q, submitNonce])

  if (q.length < 2) return { results: [] as Place[], status: 'idle' as const, error: null }
  const results = remote?.key === key ? remote.places : instant
  // Si el servidor falla pero hay resultados locales, se muestran sin bloquear.
  return { results, status, error: results.length > 0 ? null : error }
}
