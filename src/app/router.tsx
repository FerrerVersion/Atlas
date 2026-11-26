import { createBrowserRouter } from 'react-router'
import { LazyCustomMapPage } from '@/components/customMap/LazyCustomMapPage'
import { AppShell } from '@/components/layout/AppShell'

// El mapa se abre siempre: la ubicación es opcional (se pide al pulsar «Mi ubicación»).
export const router = createBrowserRouter([
  { path: '/', element: <AppShell /> },
  { path: '/custom', element: <LazyCustomMapPage /> },
  { path: '*', element: <AppShell /> },
], {
  // La web publicada vive en una subcarpeta (p. ej. /Atlas/ en GitHub Pages).
  basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
})
