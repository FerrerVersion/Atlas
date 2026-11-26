import { useRef, useState } from 'react'
import { SearchBar } from '@/components/search/SearchBar'
import { useAppStore } from '@/store/useAppStore'
import { PanelContent, PanelTabs } from './PanelContent'

/**
 * Móvil: buscador superior y panel inferior deslizable (arrastrar el asa o
 * pulsarla). Pestañas al alcance del pulgar.
 */
export function MobileNavigation() {
  const expanded = useAppStore((s) => s.sheetExpanded)
  const setExpanded = useAppStore((s) => s.setSheetExpanded)
  const [drag, setDrag] = useState<number | null>(null)
  const start = useRef<{ y: number; expanded: boolean } | null>(null)
  // Tras arrastrar el asa llega un «click»: se ignora para no alternar el panel.
  const dragged = useRef(false)

  const collapsedH = 132
  const expandedVh = 68
  const height = drag ?? (expanded ? `${expandedVh}vh` : `${collapsedH}px`)

  return (
    <>
      <div className="pointer-events-auto absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[1000]">
        <div className="glass rounded-2xl p-1.5">
          <SearchBar size="md" />
        </div>
      </div>
      <section
        aria-label="Panel"
        className="glass-strong pointer-events-auto absolute inset-x-0 bottom-0 z-[900] flex flex-col rounded-t-3xl pb-[env(safe-area-inset-bottom)] transition-[height] duration-300 ease-out"
        style={{ height, transitionDuration: drag !== null ? '0ms' : undefined }}
      >
        <button
          type="button"
          aria-label={expanded ? 'Contraer panel' : 'Expandir panel'}
          aria-expanded={expanded}
          className="flex h-6 w-full shrink-0 touch-none items-center justify-center"
          onClick={() => {
            if (dragged.current) {
              dragged.current = false
              return
            }
            setExpanded(!expanded)
          }}
          onPointerDown={(e) => {
            start.current = { y: e.clientY, expanded }
            dragged.current = false
            ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (!start.current) return
            const base = start.current.expanded ? (window.innerHeight * expandedVh) / 100 : collapsedH
            const h = Math.max(collapsedH, Math.min(window.innerHeight * 0.92, base + (start.current.y - e.clientY)))
            if (Math.abs(start.current.y - e.clientY) > 6) {
              dragged.current = true
              setDrag(h)
            }
          }}
          onPointerUp={() => {
            if (drag !== null) setExpanded(drag > window.innerHeight * 0.35)
            setDrag(null)
            start.current = null
          }}
        >
          <span className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-white/20" />
        </button>
        <div className="shrink-0 px-2 pb-1">
          <PanelTabs variant="bottom" />
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-4 pt-2 pb-6">
          <PanelContent />
        </div>
      </section>
    </>
  )
}
