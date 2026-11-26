import { useMemo } from 'react'
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { iconSvg, poiIcon, userIcon } from '@/features/map/mapUtils'
import { getTheme } from '@/features/themes/themeRegistry'

/** Los marcadores generan su HTML dentro del render de React (useMemo). */
function Probe({ name }: { name: string }) {
  const svg = useMemo(() => iconSvg(name), [name])
  return <div data-testid="probe" dangerouslySetInnerHTML={{ __html: svg }} />
}

describe('iconos de los marcadores', () => {
  it('generan SVG también cuando se piden durante el render de React', () => {
    const { getByTestId } = render(<Probe name="Fuel" />)
    expect(getByTestId('probe').innerHTML).toMatch(/^<svg[^>]*>.*<path/s)
  })

  it('los marcadores de POI y de navegación llevan su icono', () => {
    const poi = poiIcon(getTheme('classic'), 'gas_station', false).options.html as string
    const nav = userIcon(true, 90).options.html as string
    expect(poi).toContain('<svg')
    expect(nav).toContain('<svg')
    expect(nav).toContain('rotate(45deg)')
  })

  it('un nombre desconocido usa el icono genérico', () => {
    expect(iconSvg('NoExiste')).toBe(iconSvg('MapPin'))
  })
})
