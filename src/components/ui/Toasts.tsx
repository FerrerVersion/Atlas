import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'

export function Toasts() {
  const toasts = useAppStore((s) => s.toasts)
  const dismiss = useAppStore((s) => s.dismissToast)
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-28 z-[1200] flex flex-col items-center gap-2 px-4 md:bottom-6 md:left-auto md:right-20 md:items-end"
    >
      {toasts.map((t) => {
        const Icon = t.kind === 'error' ? CircleAlert : t.kind === 'success' ? CircleCheck : Info
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="glass-strong pointer-events-auto flex max-w-sm animate-slide-up items-start gap-3 rounded-2xl px-4 py-3 text-sm"
          >
            <Icon
              className={`mt-0.5 h-4 w-4 shrink-0 ${
                t.kind === 'error' ? 'text-rose-500' : t.kind === 'success' ? 'text-emerald-500' : 'text-accent'
              }`}
            />
            <span className="flex-1">{t.text}</span>
            <button type="button" aria-label="Cerrar aviso" onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
