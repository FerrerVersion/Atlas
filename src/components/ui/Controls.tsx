import { textOn } from '@/utils/color'
import type { ReactNode } from 'react'

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-slate-600 dark:text-slate-400">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`focus-ring relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${
          checked ? 'bg-accent' : 'bg-slate-300 dark:bg-white/15'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </label>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; icon?: ReactNode }[]
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-slate-900/5 p-1 dark:bg-white/6">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
            value === o.value
              ? 'bg-white text-slate-900 shadow-sm dark:bg-white/15 dark:text-white'
              : 'text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Chip({
  active,
  onClick,
  children,
  color,
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  color?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      // Con color propio (p. ej. la categoría), el texto se elige para que se lea sobre él.
      style={active && color ? { backgroundColor: color, borderColor: color, color: textOn(color) } : undefined}
      className={`focus-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition ${
        active
          ? 'border-accent bg-accent text-on-accent'
          : 'border-slate-200 bg-white/70 text-slate-700 hover:border-slate-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:border-white/25'
      }`}
    >
      {children}
    </button>
  )
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Cargando"
      className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
    />
  )
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="panel-title">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

export function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center dark:border-white/10">
      <span className="text-slate-400">{icon}</span>
      <p className="text-sm font-medium">{title}</p>
      {text && <p className="text-xs text-slate-600 dark:text-slate-400">{text}</p>}
    </div>
  )
}
