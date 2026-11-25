import {
  Anchor, Building2, Cross, Fuel, House, Landmark, LocateFixed, MapPin, Navigation, Plane, Route, Search,
  Shield, ShoppingBag, SquareParking, UtensilsCrossed, Warehouse, Wrench, type LucideIcon, type LucideProps,
} from 'lucide-react'

/** Registro explícito de iconos (evita importar toda la librería). */
export const ICONS: Record<string, LucideIcon> = {
  Anchor, Building2, Cross, Fuel, House, Landmark, LocateFixed, MapPin, Navigation, Plane, Route, Search,
  Shield, ShoppingBag, SquareParking, UtensilsCrossed, Warehouse, Wrench,
}

export function DynamicIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = ICONS[name] ?? MapPin
  return <Icon {...props} />
}
