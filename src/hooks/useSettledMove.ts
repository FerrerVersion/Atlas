import { useEffect, useRef, useState } from 'react'
import { useMapEvent } from 'react-leaflet'

/**
 * Contador que avanza cuando el mapa se DETIENE (fin de movimiento + pausa corta).
 * Durante la navegación el mapa se desplaza en cada fotograma: así las capas costosas
 * (etiquetas, nodos) no se recalculan 60 veces por segundo.
 */
export function useSettledMove(delay = 180) {
  const [tick, setTick] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useMapEvent('moveend', () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setTick((t) => t + 1), delay)
  })
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  return tick
}
