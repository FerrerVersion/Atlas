import { lazy, Suspense } from 'react'

const CustomMapPage = lazy(() => import('./CustomMapPage'))

/** El editor se descarga solo al visitar /custom. */
export function LazyCustomMapPage() {
  return (
    <Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate-600 dark:text-slate-400">Cargando editor…</div>}>
      <CustomMapPage />
    </Suspense>
  )
}
