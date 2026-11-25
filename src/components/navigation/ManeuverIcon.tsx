import {
  ArrowUp, ArrowUpLeft, ArrowUpRight, CornerUpLeft, CornerUpRight, Flag, MapPin, MoveDownLeft, MoveDownRight,
  Navigation, RefreshCw, RotateCcw, Route, type LucideProps,
} from 'lucide-react'
import type { ManeuverType } from '@/features/routing/routeTypes'

const MAP: Record<ManeuverType, typeof ArrowUp> = {
  depart: Navigation,
  continue: ArrowUp,
  'slight-left': ArrowUpLeft,
  'slight-right': ArrowUpRight,
  left: CornerUpLeft,
  right: CornerUpRight,
  'sharp-left': MoveDownLeft,
  'sharp-right': MoveDownRight,
  uturn: RotateCcw,
  roundabout: RefreshCw,
  'merge-highway': Route,
  'exit-highway': ArrowUpRight,
  waypoint: MapPin,
  arrive: Flag,
}

export function ManeuverIcon({ type, ...props }: { type: ManeuverType } & LucideProps) {
  const Icon = MAP[type] ?? ArrowUp
  return <Icon {...props} />
}
