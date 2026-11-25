import { useEffect, useRef, useState } from 'react'
import { Layers, X } from 'lucide-react'
import { ThemeGallery } from '@/components/themes/ThemeGallery'
import { IconButton } from '@/components/ui/Button'

/** Botón flotante con selector rápido de estilos. */
export function MapThemeSelector() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <IconButton label="Cambiar estilo del mapa" active={open} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Layers className="h-5 w-5" />
      </IconButton>
      {open && (
        <div className="glass-strong absolute top-0 right-12 z-[1100] w-[min(22rem,calc(100vw-5rem))] animate-fade-in rounded-2xl p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Estilo del mapa</h2>
            <IconButton label="Cerrar" size="sm" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
          <div className="scroll-thin max-h-[60vh] overflow-y-auto pr-1">
            <ThemeGallery compact />
          </div>
        </div>
      )}
    </div>
  )
}
