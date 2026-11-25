import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeGallery } from '@/components/themes/ThemeGallery'
import { RoutePanel } from '@/components/navigation/RoutePanel'
import { PlaceAutocomplete } from '@/components/search/PlaceAutocomplete'
import { useAppStore } from '@/store/useAppStore'

vi.mock('@/features/search/searchService', async (orig) => ({
  ...(await orig<typeof import('@/features/search/searchService')>()),
  searchPlaces: vi.fn(async () => [
    { id: 'p1', name: 'Buñol', kind: 'town', kindLabel: 'Municipio', address: 'La Hoya de Buñol, España', lat: 39.419, lng: -0.791, source: 'photon' },
    { id: 'p2', name: 'Calle de Buñol', kind: 'street', kindLabel: 'Calle', address: 'València', lat: 39.46, lng: -0.4, source: 'photon' },
  ]),
}))

describe('galería de temas', () => {
  it('activa un tema y lo persiste', async () => {
    render(<ThemeGallery />)
    const cyber = screen.getByRole('heading', { name: /Cyberpunk/ }).closest('article')!
    await userEvent.click(cyber.querySelector('button')!)
    expect(useAppStore.getState().themeId).toBe('cyberpunk')
    expect(localStorage.getItem('atlas-nav:prefs')).toContain('cyberpunk')
    expect(screen.getAllByRole('img', { name: /Vista previa/ }).length).toBeGreaterThanOrEqual(10)
  })
})

describe('autocompletado', () => {
  it('muestra resultados reales con tipo y dirección y permite elegirlos con teclado', async () => {
    const onPick = vi.fn()
    const { rerender } = render(<PlaceAutocomplete value="" onValueChange={() => {}} onPick={onPick} placeholder="x" ariaLabel="Buscar" />)
    rerender(<PlaceAutocomplete value="Buñol" onValueChange={() => {}} onPick={onPick} placeholder="x" ariaLabel="Buscar" />)
    const input = screen.getByRole('combobox', { name: 'Buscar' })
    await userEvent.click(input)
    expect(await screen.findByText('Buñol', {}, { timeout: 2000 })).toBeInTheDocument()
    expect(screen.getByText(/Municipio · La Hoya de Buñol/)).toBeInTheDocument()
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ name: 'Calle de Buñol' }))
  })
})

describe('panel de ruta', () => {
  it('muestra el error cuando no se puede calcular la ruta', () => {
    useAppStore.getState().setRoute(null, 'error', 'No hay datos de carreteras para esta zona.')
    render(<RoutePanel />)
    expect(screen.getByTestId('route-error')).toHaveTextContent('No hay datos de carreteras')
  })
})
