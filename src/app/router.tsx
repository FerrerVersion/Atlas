import { createBrowserRouter } from 'react-router'
import { LazyCustomMapPage } from '@/components/customMap/LazyCustomMapPage'
import { AppShell } from '@/components/layout/AppShell'
import { LocationGate } from '@/components/layout/LocationGate'

const gatedShell = (
  <LocationGate>
    <AppShell />
  </LocationGate>
)

export const router = createBrowserRouter([
  { path: '/', element: gatedShell },
  { path: '/custom', element: <LazyCustomMapPage /> },
  { path: '*', element: gatedShell },
], {
  // La web publicada vive en una subcarpeta (p. ej. /Atlas/ en GitHub Pages).
  basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
})
