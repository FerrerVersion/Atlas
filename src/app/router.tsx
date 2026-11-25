import { createBrowserRouter } from 'react-router'
import { LazyCustomMapPage } from '@/components/customMap/LazyCustomMapPage'
import { AppShell } from '@/components/layout/AppShell'

export const router = createBrowserRouter([
  { path: '/', element: <AppShell /> },
  { path: '/custom', element: <LazyCustomMapPage /> },
  { path: '*', element: <AppShell /> },
])
