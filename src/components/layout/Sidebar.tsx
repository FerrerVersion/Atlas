import { SearchBar } from '@/components/search/SearchBar'
import { Brand } from './Brand'
import { PanelContent, PanelTabs } from './PanelContent'

/** Panel lateral de escritorio: buscador, secciones y contenido. */
export function Sidebar() {
  return (
    <aside className="glass pointer-events-auto absolute top-4 bottom-4 left-4 z-[900] flex w-[400px] flex-col overflow-hidden rounded-3xl">
      <header className="space-y-3 p-4 pb-3">
        <Brand />
        <SearchBar />
        <PanelTabs />
      </header>
      <div className="scroll-thin flex-1 overflow-y-auto px-4 pb-4">
        <PanelContent />
      </div>
    </aside>
  )
}
