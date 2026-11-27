import { Navigation2, Rotate3d, RotateCcw, RotateCw } from 'lucide-react'
import { IconButton } from '@/components/ui/Button'
import { NAV_TILT } from '@/features/map/camera'
import { adjustFreePose, useCameraBearing } from '@/features/navigation/cameraState'
import { useAppStore } from '@/store/useAppStore'
import { useNavStore } from '@/store/useNavStore'

/**
 * Controles de la cámara durante la navegación:
 *  - brújula: alterna vista de navegación (rumbo arriba, inclinada) ↔ vista norte;
 *    en la vista libre, orienta el mapa al norte;
 *  - en la vista libre: girar e inclinar a mano (además de los gestos).
 */
export function CameraControls() {
  const view = useAppStore((s) => s.navPrefs.cameraView)
  const following = useNavStore((s) => s.navigation.following)
  const bearing = useCameraBearing()
  const headingUp = view !== 'north'

  const compassLabel = !following
    ? 'Orientar el mapa al norte'
    : headingUp
      ? 'Cambiar a vista norte'
      : 'Cambiar a vista de navegación'
  const onCompass = () => {
    if (!following) adjustFreePose((p) => ({ ...p, bearing: 0 }))
    else useAppStore.getState().setNavPrefs({ cameraView: headingUp ? 'north' : 'heading' })
  }

  return (
    <div className="glass flex flex-col gap-0.5 rounded-2xl p-1" data-testid="camera-controls">
      <IconButton label={compassLabel} active={following && headingUp} onClick={onCompass}>
        {/* La aguja señala el norte real en la pantalla. */}
        <span className="grid" style={{ transform: `rotate(${-bearing}deg)` }} data-testid="compass-needle">
          <Navigation2 className="h-5 w-5" />
        </span>
      </IconButton>
      {!following && (
        <>
          <IconButton label="Girar el mapa a la izquierda" onClick={() => adjustFreePose((p) => ({ ...p, bearing: p.bearing + 30 }))}>
            <RotateCcw className="h-5 w-5" />
          </IconButton>
          <IconButton label="Girar el mapa a la derecha" onClick={() => adjustFreePose((p) => ({ ...p, bearing: p.bearing - 30 }))}>
            <RotateCw className="h-5 w-5" />
          </IconButton>
          <IconButton
            label="Inclinar o aplanar el mapa"
            onClick={() => adjustFreePose((p) => ({ ...p, tilt: p.tilt > 5 ? 0 : NAV_TILT }))}
          >
            <Rotate3d className="h-5 w-5" />
          </IconButton>
        </>
      )}
    </div>
  )
}
