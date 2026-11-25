import { useId, useState, type ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { Spinner } from '@/components/ui/Controls'
import type { Place } from '@/features/geocoding/geocodingService'
import { useSearch } from '@/hooks/useSearch'
import { SearchResults } from './SearchResults'

interface Props {
  value: string
  onValueChange: (v: string) => void
  onPick: (p: Place) => void
  placeholder: string
  ariaLabel: string
  leading?: ReactNode
  size?: 'md' | 'lg'
  autoFocus?: boolean
  footer?: ReactNode
}

/** Campo de búsqueda con autocompletado accesible (combobox ARIA, teclado). */
export function PlaceAutocomplete({ value, onValueChange, onPick, placeholder, ariaLabel, leading, size = 'md', autoFocus, footer }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [navigated, setNavigated] = useState(false)
  const [submitNonce, setSubmitNonce] = useState(0)
  const { results, status, error } = useSearch(value, submitNonce)
  const listId = useId()

  const pick = (p: Place) => {
    setOpen(false)
    setSubmitNonce(0)
    onPick(p)
  }

  const showList = open && value.trim().length >= 2
  return (
    <div className="relative">
      <div
        className={`flex items-center gap-2 rounded-2xl border border-transparent bg-slate-900/5 px-3 transition focus-within:border-accent focus-within:bg-white dark:bg-white/6 dark:focus-within:bg-ink-800 ${
          size === 'lg' ? 'h-12' : 'h-10'
        }`}
      >
        {leading ?? <Search className="h-4 w-4 shrink-0 text-slate-400" />}
        <input
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
          autoFocus={autoFocus}
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            onValueChange(e.target.value)
            setOpen(true)
            setActive(0)
            setNavigated(false)
            setSubmitNonce(0)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setNavigated(true)
              setActive((a) => Math.min(a + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setNavigated(true)
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              // Enter elige la opción marcada con el teclado; si no, lanza una búsqueda
              // completa en Nominatim y un segundo Enter elige el primer resultado.
              if (results[active] && (navigated || (submitNonce > 0 && status === 'idle'))) pick(results[active])
              else {
                setSubmitNonce((n) => n + 1)
                setOpen(true)
              }
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
          className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400 ${size === 'lg' ? 'text-base' : 'text-sm'}`}
        />
        {status === 'loading' && <Spinner className="h-4 w-4 text-slate-400" />}
        {value && (
          <button
            type="button"
            aria-label="Borrar búsqueda"
            onClick={() => {
              onValueChange('')
              setSubmitNonce(0)
            }}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {showList && (
        <div className="glass-strong absolute inset-x-0 top-full z-[1100] mt-2 animate-fade-in overflow-hidden rounded-2xl">
          {error ? (
            <p className="px-4 py-3 text-sm text-rose-600 dark:text-rose-300">{error}</p>
          ) : results.length > 0 ? (
            <SearchResults id={listId} results={results} activeIndex={active} onPick={pick} onHover={setActive} />
          ) : status === 'idle' && value.trim().length >= 3 ? (
            <p className="px-4 py-3 text-sm text-slate-500">
              Sin resultados en OpenStreetMap. Pulsa Enter para una búsqueda completa.
            </p>
          ) : (
            <p className="px-4 py-3 text-sm text-slate-500">Escribe al menos 3 letras…</p>
          )}
          <div className="border-t border-slate-200/70 px-4 py-1.5 text-[10px] text-slate-400 dark:border-white/10">
            {footer ?? (submitNonce > 0 ? 'Resultados de Nominatim' : 'Autocompletado: Photon · Enter: Nominatim')} · © OpenStreetMap
          </div>
        </div>
      )}
    </div>
  )
}
