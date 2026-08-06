import { AdminPanel } from '@/dev/AdminPanel'
import type { AdminWarpId } from '@/dev/adminTypes'
import type { SystemId } from '@/game/systemConfig'

type CheatPanelProps = {
  systemId: SystemId
  onTransport: (target: SystemId) => void
  onAddCredits: (amount: number) => void
  onAddDust: (amount: number) => void
  onHeal: () => void
  onUnlockOutfits: () => void
  onFillTubes: () => void
  onFillCargo: () => void
  onUnlockLore: () => void
  onClearLore: () => void
  onWarp: (id: AdminWarpId) => void
  onRepairAllSiphons: () => void
  onClearSiphonRepairs: () => void
}

/** Registers Admin into the shared leva store while cheats are enabled. */
export function CheatPanel(props: CheatPanelProps) {
  return <AdminPanel {...props} />
}
