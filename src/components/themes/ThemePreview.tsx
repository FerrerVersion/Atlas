import type { MapTheme } from '@/features/themes/themeTypes'

/**
 * Vista previa esquemática del tema (SVG generado con sus colores, trazos y
 * marcadores). Representa el estilo, no un lugar concreto.
 */
export function ThemePreview({ theme, className = '' }: { theme: MapTheme; className?: string }) {
  const c = theme.colors
  const ov = theme.overlay.classes
  const r = theme.route
  const glow = theme.effects.glow ? `url(#glow-${theme.id})` : undefined
  return (
    <svg viewBox="0 0 160 100" className={className} role="img" aria-label={`Vista previa del estilo ${theme.name}`}>
      <defs>
        <filter id={`glow-${theme.id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {theme.effects.grid && (
          <pattern id={`grid-${theme.id}`} width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M10 0H0V10" fill="none" stroke={c.labels} strokeOpacity="0.15" strokeWidth="0.5" />
          </pattern>
        )}
      </defs>
      <rect width="160" height="100" fill={c.background} />
      {theme.effects.grid && <rect width="160" height="100" fill={`url(#grid-${theme.id})`} />}
      <path d="M0 70 C30 60 45 85 80 78 S130 60 160 72 V100 H0Z" fill={c.water} />
      <path d="M100 8 h44 a6 6 0 0 1 6 6 v22 a6 6 0 0 1 -6 6 h-44 a6 6 0 0 1 -6 -6 v-22 a6 6 0 0 1 6 -6z" fill={c.parks} />
      {theme.detail !== 'low' &&
        [12, 28, 44, 60].map((x) => <rect key={x} x={x} y="12" width="11" height="9" rx="1.5" fill={c.buildings} />)}
      <g fill="none" strokeLinecap="round" filter={glow}>
        <path d="M0 40 H160" stroke={ov.local.width ? ov.local.color : c.roads} strokeWidth="2" strokeDasharray={ov.local.dash} />
        <path d="M70 0 V100" stroke={ov.minor.width ? ov.minor.color : c.roads} strokeWidth="2.5" strokeDasharray={ov.minor.dash} />
        <path d="M0 58 C40 50 90 30 160 24" stroke={ov.highway.casing ?? 'transparent'} strokeWidth="7" />
        <path d="M0 58 C40 50 90 30 160 24" stroke={ov.highway.width ? ov.highway.color : c.highways} strokeWidth="4.5" strokeDasharray={ov.highway.dash} />
        <path d="M18 88 L40 40 L70 36 L120 30" stroke={r.casing} strokeWidth="6" />
        <path
          d="M18 88 L40 40 L70 36 L120 30"
          stroke={r.color}
          strokeWidth="3.5"
          strokeDasharray={r.dash}
          filter={r.glow ? `url(#glow-${theme.id})` : undefined}
        />
      </g>
      {theme.overlay.showNodes &&
        [
          [40, 40],
          [70, 40],
          [70, 36],
        ].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2" fill={c.background} stroke={theme.overlay.nodeColor} />)}
      <circle cx="18" cy="88" r="4.5" fill={r.color} stroke="#fff" strokeWidth="1.5" />
      {theme.marker.shape === 'pixel' ? (
        <rect x="114" y="24" width="12" height="12" fill={theme.marker.color} stroke="#000" strokeWidth="2" />
      ) : theme.marker.shape === 'diamond' ? (
        <rect x="114" y="24" width="11" height="11" fill={theme.marker.color} stroke="#111" strokeWidth="1.5" transform="rotate(45 120 30)" />
      ) : (
        <circle cx="120" cy="30" r="6" fill={theme.marker.color} stroke="#fff" strokeWidth="1.5" filter={glow} />
      )}
      <text
        x="76"
        y="55"
        fill={c.labels}
        stroke={c.labelHalo}
        strokeWidth="2.5"
        paintOrder="stroke"
        style={{
          fontFamily: theme.typography.fontFamily,
          fontSize: Math.min(theme.typography.labelSize, 11) * 0.75,
          fontWeight: theme.typography.labelWeight,
          letterSpacing: theme.typography.letterSpacing,
          textTransform: theme.typography.uppercase ? 'uppercase' : undefined,
        }}
      >
        Aa · 123
      </text>
      {theme.effects.scanlines &&
        Array.from({ length: 25 }, (_, i) => (
          <rect key={i} y={i * 4} width="160" height="1" fill="#fff" opacity="0.06" />
        ))}
      {theme.effects.vignette && <rect width="160" height="100" fill="none" stroke="#000" strokeOpacity="0.18" strokeWidth="12" />}
    </svg>
  )
}
