import { useEffect, useState } from 'react'
import type { Place } from '@/features/geocoding/geocodingService'
import { searchPlaces } from '@/features/search/searchService'
import { isAbortError } from '@/utils/http'
import { useAppStore } from '@/store/useAppStore'

/**
 * Autocompletado con antirrebote (350 ms), cancelación de peticiones obsoletas
 * y sesgo hacia el centro del mapa. `submitNonce` fuerza una búsqueda completa.
 */
export function useSearch(query: string, submitNonce = 0) {
  const [results, setResults] = useState<Place[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setStatus('idle')
      return
    }
    const controller = new AbortController()
    const submit = submitNonce > 0
    const t = setTimeout(
      async () => {
        setStatus('loading')
        setError(null)
        try {
          const { lastView, pois } = useAppStore.getState()
          const found = await searchPlaces(q, {
            near: { lat: lastView.lat, lng: lastView.lng },
            pois,
            signal: controller.signal,
            submit,
          })
          setResults(found)
          setStatus('idle')
        } catch (e) {
          if (isAbortError(e)) return
          setStatus('error')
          setError('El servicio de búsqueda no responde. Revisa la conexión e inténtalo de nuevo.')
        }
      },
      submit ? 0 : 350,
    )
    return () => {
      clearTimeout(t)
      controller.abort()
    }
  }, [query, submitNonce])

  return { results, status, error }
}
