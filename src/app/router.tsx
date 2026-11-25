import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'

const CustomMapPage = lazy(() => import('@/components/customMap/CustomMapPage'))

export const router = createBrowserRouter([
  { path: '/', element: <AppShell /> },
  {
    path: '/custom',
    element: (
      <Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate-500">Cargando editor…</div>}>
        <CustomMapPage />
      </Suspense>
    ),
  },
  { path: '*', element: <AppShell /> },
])
