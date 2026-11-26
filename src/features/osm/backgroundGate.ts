/**
 * Prioridad de las descargas:
 *  1. la ruta que se está calculando (todo lo demás se pausa);
 *  2. el corredor de 5 km alrededor de la ruta recién calculada;
 *  3. la zona de 200 km (prioridad baja: espera también mientras se carga el corredor).
 */
let paused = false
let lowHolds = 0
const waiters = new Set<() => void>()
const pauseListeners = new Set<{ fn: () => void; low: boolean }>()

const allowed = (low: boolean) => !paused && !(low && lowHolds > 0)

function wakeWaiters() {
  const list = [...waiters]
  waiters.clear()
  list.forEach((w) => w())
}

function notifyPause(lowOnly: boolean) {
  pauseListeners.forEach((l) => {
    if (!lowOnly || l.low) l.fn()
  })
}

/** Pausa (o reanuda) todas las descargas de fondo: se usa mientras se calcula una ruta. */
export function setBackgroundPaused(value: boolean) {
  if (paused === value) return
  paused = value
  if (paused) notifyPause(false)
  else wakeWaiters()
}

export const isBackgroundPaused = () => paused

/** Detiene solo las descargas de prioridad baja (zona regional) hasta llamar a la función devuelta. */
export function holdLowPriority(): () => void {
  lowHolds++
  notifyPause(true)
  let released = false
  return () => {
    if (released) return
    released = true
    lowHolds--
    wakeWaiters()
  }
}

/** Avisa cuando la descarga debe detenerse (para cancelar la consulta en curso). */
export function onBackgroundPause(fn: () => void, low = false) {
  const entry = { fn, low }
  pauseListeners.add(entry)
  return () => {
    pauseListeners.delete(entry)
  }
}

/** Espera a que la descarga esté permitida (resuelve al momento si lo está). */
export async function whenBackgroundAllowed(signal?: AbortSignal, low = false): Promise<void> {
  while (!allowed(low)) {
    await new Promise<void>((resolve, reject) => {
      const done = () => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }
      const onAbort = () => {
        waiters.delete(done)
        reject(signal!.reason ?? new DOMException('Aborted', 'AbortError'))
      }
      signal?.throwIfAborted()
      signal?.addEventListener('abort', onAbort, { once: true })
      waiters.add(done)
    })
  }
}
