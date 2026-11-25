import { Compass, Palette, Route, Settings, Star } from 'lucide-react'
import { ExplorePanel } from '@/components/explore/ExplorePanel'
import { RoutePanel } from '@/components/navigation/RoutePanel'
import { SavedPanel } from '@/components/saved/SavedPanel'
import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { ThemeGallery } from '@/components/themes/ThemeGallery'
import { useAppStore, type PanelTab } from '@/store/useAppStore'

export const TABS: { id: PanelTab; label: string; icon: typeof Compass }[] = [
  { id: 'explore', label: 'Explorar', icon: Compass },
  { id: 'route', label: 'Ruta', icon: Route },
  { id: 'styles', label: 'Estilos', icon: Palette },
  { id: 'saved', label: 'Guardado', icon: Star },
  { id: 'settings', label: 'Ajustes', icon: Settings },
]

export function PanelTabs({ variant = 'top' }: { variant?: 'top' | 'bottom' }) {
  const tab = useAppStore((s) => s.panelTab)
  const setTab = useAppStore((s) => s.setPanelTab)
  const hasRoute = useAppStore((s) => s.route !== null)
  return (
    <nav role="tablist" aria-label="Secciones" className={`flex ${variant === 'top' ? 'gap-1' : 'justify-around'}`}>
      {TABS.map((t) => {
        const active = tab === t.id
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls="panel-content"
            onClick={() => setTab(t.id)}
            className={`focus-ring relative flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-medium transition ${
              active ? 'text-accent' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
            } ${active && variant === 'top' ? 'bg-accent/10' : ''}`}
          >
            <t.icon className="h-5 w-5" />
            {t.label}
            {t.id === 'route' && hasRoute && <span className="absolute top-1 right-[30%] h-1.5 w-1.5 rounded-full bg-accent" />}
          </button>
        )
      })}
    </nav>
  )
}

export function PanelContent() {
  const tab = useAppStore((s) => s.panelTab)
  return (
    <div id="panel-content" role="tabpanel" className="animate-fade-in" key={tab}>
      {tab === 'explore' && <ExplorePanel />}
      {tab === 'route' && <RoutePanel />}
      {tab === 'styles' && <ThemeGallery />}
      {tab === 'saved' && <SavedPanel />}
      {tab === 'settings' && <SettingsPanel />}
    </div>
  )
}
