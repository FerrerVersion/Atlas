import '@/styles/rally.css'
import { Eye, EyeOff, Moon, Palette, Pause, Play, Smartphone, Square, Sun, Volume2, VolumeX, X } from 'lucide-react'
import { curveShape } from '@/features/navigation/curveShape'
import { navigationState } from '@/features/navigation/navigationProgress'
import { noteDetail, noteLabel, rallyState, shortLabel, straightLabel, type PaceNote } from '@/features/navigation/pacenotes'
import { averageSpeed, currentSpeed, GPS_QUALITY_TEXT, gpsQuality, type GpsQuality } from '@/features/navigation/telemetry'
import { segmentSpeedKmh } from '@/hooks/useNavigationRunner'
import { useNow } from '@/hooks/useMediaQuery'
import { formatDistance, formatDuration } from '@/utils/distance'
import { useAppStore, type RallyTheme } from '@/store/useAppStore'
import { useNavStore } from '@/store/useNavStore'
import { useLandscapeLock } from './useLandscapeLock'

const THEMES: RallyTheme[] = ['red', 'yellow', 'blue', 'mono']
const THEME_NAMES: Record<RallyTheme, string> = { red: 'Rally Red', yellow: 'Rally Yellow', blue: 'Rally Blue', mono: 'Monochrome' }
/** A menos de esto se destaca la curva (texto «AHORA» + color: nunca solo el color). */
const NEAR_M = 80

/**
 * Modo Rally: copiloto digital a pantalla completa. Usa la misma ruta, el mismo avance, la
 * misma medición GPS y los mismos recálculos que la navegación normal; solo cambia cómo se
 * presentan (notas de copiloto generadas de la geometría real, ver pacenotes.ts).
 */
export function RallyHUD() {
  const nav = useNavStore((s) => s.navigation)
  const live = useNavStore((s) => s.live)
  const route = useAppStore((s) => s.route)
  const routeStatus = useAppStore((s) => s.routeStatus)
  const prefs = useAppStore((s) => s.navPrefs.rally)
  const voice = useAppStore((s) => s.navPrefs.voice)
  const now = useNow(1000)
  useLandscapeLock(nav.rally)
  if (!nav.active || !nav.rally || !route) return null

  const st = rallyState(route, nav.progress)
  const navSt = navigationState(route, nav.progress)
  const speed = currentSpeed(live, now, { active: nav.simulating, kmh: segmentSpeedKmh(route, nav.progress) })
  const avg = nav.simulating ? null : averageSpeed(live, now)
  const quality = gpsQuality(live, now, nav.simulating)
  // Desviado o recalculando: las notas de la ruta vieja ya no valen; no se muestran.
  const rerouting = !nav.simulating && (live.status === 'off-route' || routeStatus === 'loading')
  const eta = new Date(now + navSt.remainingTime * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

  const setPrefs = (p: Partial<typeof prefs>) => useAppStore.getState().setNavPrefs({ rally: { ...prefs, ...p } })
  const flags = useNavStore.getState().setNavFlags
  const cur = st.current
  const near = !!cur && (st.inside || st.distance <= NEAR_M)

  return (
    <div
      className={`rally ${prefs.night ? 'is-night' : ''} ${prefs.clean ? 'is-clean' : ''}`}
      data-theme={prefs.theme}
      data-testid="rally"
      role="region"
      aria-label="Modo Rally"
    >
      <header className="rally-top">
        <span className="rally-brand rally-tech">
          <i aria-hidden="true" /> RALLY MODE
        </span>
        <div className="rally-status">
          <GpsIndicator quality={quality} />
          <span className="optional rally-tech">{formatDistance(navSt.remainingDistance)}</span>
          <span className="rally-tech">{eta}</span>
        </div>
        <div className="rally-buttons">
          <button type="button" className="rally-btn" aria-label={nav.simulating ? 'Pausar simulación' : 'Simular recorrido'} onClick={() => flags({ simulating: !nav.simulating, following: true })}>
            {nav.simulating ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          <button type="button" className="rally-btn" aria-pressed={prefs.clean} aria-label="Pantalla limpia" onClick={() => setPrefs({ clean: !prefs.clean })}>
            {prefs.clean ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
          <button
            type="button"
            className="rally-btn"
            aria-label={`Color: ${THEME_NAMES[prefs.theme]}. Cambiar`}
            title={THEME_NAMES[prefs.theme]}
            onClick={() => setPrefs({ theme: THEMES[(THEMES.indexOf(prefs.theme) + 1) % THEMES.length] })}
          >
            <Palette className="h-5 w-5" />
          </button>
          <button type="button" className="rally-btn" aria-pressed={prefs.night} aria-label="Modo nocturno" onClick={() => setPrefs({ night: !prefs.night })}>
            {prefs.night ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </button>
          <button type="button" className="rally-btn" aria-label={voice ? 'Silenciar voz' : 'Activar voz'} onClick={() => useAppStore.getState().setNavPrefs({ voice: !voice })}>
            {voice ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>
          <button type="button" className="rally-btn" aria-label="Salir del modo rally" onClick={() => flags({ rally: false })}>
            <X className="h-5 w-5" />
          </button>
          <button type="button" className="rally-btn is-exit" aria-label="Salir de la navegación" onClick={() => useNavStore.getState().stopNavigation()}>
            <Square className="h-5 w-5" />
          </button>
        </div>
      </header>

      <p className="rally-rotate" role="note">
        <Smartphone className="h-4 w-4 rotate-90" aria-hidden="true" /> Gira el teléfono en horizontal para el modo rally completo
      </p>

      <div className="rally-body">
        <section className="rally-speed" aria-label="Velocidad">
          <span className="rally-label">Velocidad</span>
          <b className={`rally-speed-value rally-tech ${speed.kmh === null ? 'is-missing' : ''}`} data-testid="rally-speed">
            {speed.kmh ?? '—'}
          </b>
          <span className="rally-speed-unit rally-tech">km/h</span>
          <span className="rally-speed-note">
            {speed.kmh === null
              ? speed.reason === 'weak-signal'
                ? 'Señal GPS insuficiente'
                : 'Sin velocidad del GPS'
              : speed.source === 'simulation'
                ? 'Simulación'
                : avg !== null && !prefs.clean
                  ? `Media ${avg} km/h`
                  : 'GPS'}
          </span>
        </section>

        <section className="rally-current" data-near={near} aria-label="Próxima curva" aria-live="polite">
          {rerouting ? (
            <div className="rally-alert" data-testid="rally-rerouting">
              <b className="rally-tech">{live.wrongWay ? 'SENTIDO CONTRARIO' : 'FUERA DE RUTA'}</b>
              <span>Recalculando desde tu posición…</span>
            </div>
          ) : cur ? (
            <>
              {near && <span className="rally-now rally-tech">{st.inside ? 'AHORA' : 'PREPARA'}</span>}
              {st.distance > 200 && st.straightBefore > 150 && <span className="rally-straight rally-tech">{straightLabel(st.distance)}</span>}
              <CurveGlyph note={cur} />
              <b className="rally-note rally-tech" data-testid="rally-note">
                {noteLabel(cur)}
              </b>
              {cur.into && st.next ? (
                <span className="rally-into rally-tech">Y {shortLabel(st.next)}</span>
              ) : (
                <span className="rally-detail">
                  {noteDetail(cur)}
                  {cur.street && cur.kind !== 'curve' ? ` · ${cur.street}` : ''}
                </span>
              )}
              <b className="rally-distance rally-tech" data-testid="rally-distance">
                {st.inside ? '0 m' : formatDistance(st.distance)}
              </b>
              {/* Antes de la curva: cuánto falta para llegar; dentro: cuánto queda para completarla. */}
              <div
                className={`rally-bar ${st.inside ? 'is-inside' : ''}`}
                role="progressbar"
                aria-label={st.inside ? 'Maniobra completada' : 'Distancia hasta la curva'}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((st.inside ? st.completion : st.approach) * 100)}
                data-testid="rally-bar"
              >
                <i style={{ width: `${Math.round((st.inside ? 1 - st.completion : st.approach) * 100)}%` }} />
              </div>
            </>
          ) : (
            <b className="rally-note rally-tech">LLEGADA</b>
          )}
        </section>

        {!prefs.clean && (
          <section className="rally-side" aria-label="Siguiente curva e información">
            <span className="rally-label">Después</span>
            {st.next && !rerouting ? (
              <div className="rally-next" data-testid="rally-next">
                <CurveGlyph note={st.next} small />
                <div className="rally-next-text">
                  <b className="rally-tech">{shortLabel(st.next)}</b>
                  <span>
                    {noteDetail(st.next)}
                    {cur ? ` · a ${formatDistance(Math.max(0, st.next.start - Math.max(nav.progress, cur.start)))}` : ''}
                  </span>
                </div>
              </div>
            ) : (
              <div className="rally-next">
                <span className="rally-detail">{rerouting ? 'Esperando la nueva ruta' : 'Sin más maniobras'}</span>
              </div>
            )}
            {!rerouting && st.sequence.length > 1 && <Sequence notes={st.sequence} progress={nav.progress} />}
            <div className="rally-info">
              <div>
                <span className="rally-label">Restante</span>
                <b className="rally-tech">{formatDistance(navSt.remainingDistance)}</b>
              </div>
              <div>
                <span className="rally-label">Llegada</span>
                <b className="rally-tech">{eta}</b>
              </div>
              <div className="wide">
                <span className="rally-label">Vía</span>
                <b>{(cur?.kind !== 'curve' && cur?.street) || navSt.current.street || '—'}</b>
              </div>
              <div className="optional">
                <span className="rally-label">Tiempo</span>
                <b className="rally-tech">{formatDuration(navSt.remainingTime)}</b>
              </div>
              <div className="optional">
                <span className="rally-label">Total</span>
                <b className="rally-tech">{formatDistance(route.distance)}</b>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

/** Forma de la curva (ángulo real, radio visual según la clase) o símbolo de la maniobra. */
function CurveGlyph({ note, small = false }: { note: PaceNote; small?: boolean }) {
  const turning = note.kind === 'curve' || note.kind === 'junction' || ((note.kind === 'exit' || note.kind === 'road') && note.direction)
  const shape = turning ? curveShape(note.angle, note.curve) : null
  return (
    <svg className="rally-glyph" viewBox="0 0 100 100" aria-hidden="true">
      {shape ? (
        <>
          <path className="road" d={shape.path} />
          <path d={shape.path} />
          <polygon points={shape.head} />
        </>
      ) : note.kind === 'roundabout' ? (
        <>
          <path d="M50 92 L50 70" />
          <path d="M50 70 A18 18 0 1 1 64 41" style={{ strokeWidth: small ? 9 : 8 }} />
          <polygon points="74,30 70,48 58,38" />
          {!small && note.roundaboutExit && (
            <text x="50" y="57" textAnchor="middle" fontSize="16" fontFamily="Orbitron" fill="currentColor" style={{ fill: 'var(--rt)' }}>
              {note.roundaboutExit}
            </text>
          )}
        </>
      ) : note.kind === 'arrive' || note.kind === 'waypoint' ? (
        <>
          <path d="M34 90 L34 14" />
          <polygon points="38,14 78,26 38,40" />
        </>
      ) : note.kind === 'merge' ? (
        <>
          <path d="M58 92 L58 12" />
          <path d="M30 92 C30 66 58 62 58 44" />
          <polygon points="58,4 70,22 46,22" />
        </>
      ) : (
        <>
          <path d="M50 92 L50 22" />
          <polygon points="50,8 64,28 36,28" />
        </>
      )}
    </svg>
  )
}

/** Próximas maniobras con las rectas entre ellas (la actual destacada). */
function Sequence({ notes, progress }: { notes: PaceNote[]; progress: number }) {
  return (
    <div className="rally-seq rally-tech" aria-label="Secuencia de curvas" data-testid="rally-sequence">
      {notes.map((n, i) => {
        const prevEnd = i === 0 ? progress : notes[i - 1].end
        const gap = n.start - prevEnd
        return (
          <span key={`${n.start}-${i}`} style={{ display: 'contents' }}>
            {i > 0 && (notes[i - 1].into ? <span>›</span> : gap > 120 ? <span>{Math.round(gap / 50) * 50}</span> : <span>·</span>)}
            <b>{shortLabel(n)}</b>
          </span>
        )
      })}
    </div>
  )
}

const BARS: Record<GpsQuality, number> = { good: 3, fair: 2, weak: 1, none: 0, simulation: 3 }

/** Indicador de señal: barras + texto (no depende solo del color). */
function GpsIndicator({ quality }: { quality: GpsQuality }) {
  const n = BARS[quality]
  return (
    <span className="rally-gps" data-testid="rally-gps">
      <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 14 }}>
        {[6, 10, 14].map((h, i) => (
          <i key={h} className={i < n ? 'on' : ''} style={{ height: h }} />
        ))}
      </span>
      <span className={quality === 'simulation' ? '' : 'optional'}>{GPS_QUALITY_TEXT[quality]}</span>
    </span>
  )
}
