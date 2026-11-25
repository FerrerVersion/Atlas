import { Check, Moon, Sparkles } from 'lucide-react'
import { CATEGORY_LABELS, THEMES } from '@/features/themes/themeRegistry'
import type { ThemeCategory } from '@/features/themes/themeTypes'
import { useMapTheme } from '@/hooks/useUiTheme'
import { useAppStore } from '@/store/useAppStore'
import { ThemePreview } from './ThemePreview'

const ORDER: ThemeCategory[] = ['classic', 'realistic', 'dark', 'futuristic', 'creative']

/** Galería completa de estilos con nombre, descripción, vista previa y botón de activación. */
export function ThemeGallery({ compact = false, onPick }: { compact?: boolean; onPick?: () => void }) {
  const themeId = useAppStore((s) => s.themeId)
  const setTheme = useAppStore((s) => s.setTheme)
  const autoNight = useAppStore((s) => s.autoNightTheme)
  const effective = useMapTheme()

  if (compact) {
    return (
      <div className="grid grid-cols-3 gap-2" role="listbox" aria-label="Estilos de mapa">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="option"
            aria-selected={t.id === themeId}
            onClick={() => {
              setTheme(t.id)
              onPick?.()
            }}
            className={`focus-ring group overflow-hidden rounded-xl border text-left transition ${
              t.id === themeId ? 'border-accent ring-2 ring-accent/40' : 'border-slate-200 hover:border-slate-400 dark:border-white/10'
            }`}
          >
            <ThemePreview theme={t} className="block aspect-[16/10] w-full" />
            <span className="block truncate px-2 py-1 text-[11px] font-medium">{t.name}</span>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {autoNight && effective.id !== themeId && (
        <p className="flex items-center gap-2 rounded-xl bg-indigo-500/10 px-3 py-2 text-xs text-indigo-700 dark:text-indigo-300">
          <Moon className="h-4 w-4" /> Modo noche automático activo: se muestra «{effective.name}».
        </p>
      )}
      {ORDER.map((cat) => {
        const list = THEMES.filter((t) => t.category === cat)
        if (!list.length) return null
        return (
          <section key={cat} className="space-y-2">
            <h3 className="panel-title">{CATEGORY_LABELS[cat]}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-1">
              {list.map((t) => {
                const active = t.id === themeId
                return (
                  <article
                    key={t.id}
                    className={`flex gap-3 rounded-2xl border p-2 transition ${
                      active ? 'border-accent bg-accent/5' : 'border-slate-200 dark:border-white/10'
                    }`}
                  >
                    <ThemePreview theme={t} className="h-20 w-32 shrink-0 rounded-xl" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                        {t.name}
                        {t.effects.animations && <Sparkles className="h-3.5 w-3.5 text-amber-500" aria-label="Con animaciones" />}
                      </h4>
                      <p className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{t.description}</p>
                      <button
                        type="button"
                        onClick={() => setTheme(t.id)}
                        aria-pressed={active}
                        className={`focus-ring mt-auto inline-flex h-7 w-fit items-center gap-1 rounded-lg px-2.5 text-xs font-medium transition ${
                          active ? 'bg-accent text-white' : 'bg-slate-900/5 hover:bg-slate-900/10 dark:bg-white/10 dark:hover:bg-white/15'
                        }`}
                      >
                        {active ? (
                          <>
                            <Check className="h-3.5 w-3.5" /> Activo
                          </>
                        ) : (
                          'Activar'
                        )}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )
      })}
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Cambiar de estilo no altera la búsqueda, la ruta, las paradas ni los nombres: solo la apariencia.
      </p>
    </div>
  )
}
