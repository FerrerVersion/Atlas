import { MapPin, type LucideProps } from 'lucide-react'
import { ICONS } from '@/features/map/icons'

export function DynamicIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = ICONS[name] ?? MapPin
  return <Icon {...props} />
}
