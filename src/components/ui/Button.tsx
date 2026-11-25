import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-white shadow-[0_6px_20px_-8px_var(--ui-accent)] hover:brightness-110 active:brightness-95',
  secondary:
    'bg-slate-900/5 text-slate-800 hover:bg-slate-900/10 dark:bg-white/8 dark:text-slate-100 dark:hover:bg-white/14',
  ghost: 'text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/8',
  danger: 'bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 dark:text-rose-300',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md'
  icon?: ReactNode
}

export function Button({ variant = 'secondary', size = 'md', icon, className = '', children, ...rest }: ButtonProps) {
  const sz = size === 'sm' ? 'h-8 px-3 text-xs gap-1.5' : 'h-10 px-4 text-sm gap-2'
  return (
    <button
      type="button"
      className={`focus-ring inline-flex items-center justify-center rounded-xl font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${sz} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  active?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function IconButton({ label, active, size = 'md', className = '', children, ...rest }: IconButtonProps) {
  const sz = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-12 w-12' : 'h-10 w-10'
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`focus-ring grid shrink-0 place-items-center rounded-xl transition disabled:opacity-40 ${sz} ${
        active
          ? 'bg-accent text-white'
          : 'text-slate-700 hover:bg-slate-900/6 dark:text-slate-200 dark:hover:bg-white/10'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
