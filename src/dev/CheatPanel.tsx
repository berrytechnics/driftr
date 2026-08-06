import { Leva } from 'leva-runtime'
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
}

/**
 * Player-optional cheat / admin overlay. Imports real leva via `leva-runtime`
 * so production still stubs world-tuning `useControls` from `'leva'`.
 */
export function CheatPanel(props: CheatPanelProps) {
  return (
    <>
      <Leva
        collapsed={false}
        oneLineLabels
        titleBar={{ title: 'DRIFTR · Cheats' }}
      />
      <AdminPanel {...props} />
    </>
  )
}
