import { LoaderCircle, LocateFixed, MapPinOff, ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { useLocationGate } from '@/hooks/useGeolocation'
import { useMapTheme } from '@/hooks/useUiTheme'

/**
 * Antes de nada, el usuario debe permitir la ubicación: el mapa, la precarga de la
 * zona y las rutas parten de dónde está. Si el navegador ya la tiene concedida, se
 * entra directamente sin mostrar nada.
 */
export function LocationGate({ children }: { children: ReactNode }) {
  const { state, request } = useLocationGate()
  const accent = useMapTheme().colors.accent

  if (state === 'granted') return <>{children}</>
  // Mientras se consulta el permiso (unos milisegundos) se mantiene la pantalla de carga.
  if (state === 'checking') return null

  return (
    <div
      className="flex h-full w-full items-center justify-center bg-slate-950 px-6 text-slate-100"
      style={{ backgroundImage: `radial-gradient(circle at 50% 35%, ${accent}33, transparent 60%)` }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="gate-title"
        className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900/80 p-7 text-center shadow-2xl backdrop-blur"
      >
        <div
          className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl"
          style={{ background: `${accent}22`, color: accent, boxShadow: `0 0 32px ${accent}55` }}
        >
          {state === 'denied' ? (
            <ShieldAlert className="h-8 w-8" />
          ) : state === 'unavailable' ? (
            <MapPinOff className="h-8 w-8" />
          ) : (
            <LocateFixed className="h-8 w-8" />
          )}
        </div>
        <h1 id="gate-title" className="text-xl font-semibold">
          {state === 'denied'
            ? 'La ubicación está bloqueada'
            : state === 'unavailable'
              ? 'Ubicación no disponible'
              : 'Permite tu ubicación'}
        </h1>

        {(state === 'ask' || state === 'pending') && (
          <>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Atlas necesita saber dónde estás para cargar el mapa de tu zona (200 km a tu alrededor) y calcular las
              rutas desde tu posición. La ubicación no sale de tu dispositivo.
            </p>
            <button
              type="button"
              onClick={request}
              disabled={state === 'pending'}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-70"
              style={{ background: accent }}
            >
              {state === 'pending' ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <LocateFixed className="h-5 w-5" />}
              {state === 'pending' ? 'Obteniendo tu ubicación…' : 'Permitir ubicación'}
            </button>
          </>
        )}

        {state === 'denied' && (
          <>
            <p role="alert" className="mt-3 text-sm leading-relaxed text-slate-300">
              El navegador ha denegado el permiso. Para usar Atlas, permítelo para esta web: pulsa el icono del candado (o
              «aA» en Safari) junto a la dirección, activa la ubicación y vuelve a intentarlo.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 w-full rounded-xl px-4 py-3 font-semibold text-slate-950 transition hover:brightness-110"
              style={{ background: accent }}
            >
              Reintentar
            </button>
          </>
        )}

        {state === 'unavailable' && (
          <p role="alert" className="mt-3 text-sm leading-relaxed text-slate-300">
            {window.isSecureContext
              ? 'Este navegador no permite obtener la ubicación. Prueba con otro navegador actualizado.'
              : 'La ubicación solo funciona con una conexión segura (https://). Abre la web con https o, en desarrollo, con `npm run dev:movil`.'}
          </p>
        )}
      </section>
    </div>
  )
}
