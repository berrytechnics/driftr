import { button, folder, useControls } from 'leva-runtime'
import { ALT_STAR_NAME, STAR_NAME, SYSTEM_IDS, type SystemId } from '@/game/systemConfig'
import type { AdminWarpId } from '@/dev/adminTypes'

type AdminPanelProps = {
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
 * Leva folder for sky hops, cheats, lore flags, and warps.
 * Mounted via CheatPanel when the player enables cheats from pause.
 */
export function AdminPanel({
  systemId,
  onTransport,
  onAddCredits,
  onAddDust,
  onHeal,
  onUnlockOutfits,
  onFillTubes,
  onFillCargo,
  onUnlockLore,
  onClearLore,
  onWarp,
}: AdminPanelProps) {
  const transportLabel =
    systemId === SYSTEM_IDS.sol
      ? `Hop → ${ALT_STAR_NAME}`
      : `Hop → ${STAR_NAME}`

  useControls(
    'Admin',
    {
      sky: folder(
        {
          [transportLabel]: button(() => {
            onTransport(
              systemId === SYSTEM_IDS.sol
                ? SYSTEM_IDS.nyxAlt
                : SYSTEM_IDS.sol,
            )
          }),
        },
        { collapsed: false },
      ),
      cheats: folder(
        {
          'Credits +1000': button(() => onAddCredits(1000)),
          'Nyx dust +1': button(() => onAddDust(1)),
          'Heal hull': button(() => onHeal()),
          'Unlock outfits': button(() => onUnlockOutfits()),
          'Fill tubes': button(() => onFillTubes()),
          'Fill cargo': button(() => onFillCargo()),
        },
        { collapsed: false },
      ),
      lore: folder(
        {
          'Unlock all lore': button(() => onUnlockLore()),
          'Clear lore flags': button(() => onClearLore()),
        },
        { collapsed: true },
      ),
      warp: folder(
        {
          'Warp · near sun': button(() => onWarp('sun')),
          'Warp · inner': button(() => onWarp('inner')),
          'Warp · belt': button(() => onWarp('belt')),
          'Warp · outer': button(() => onWarp('outer')),
          'Warp · apo / far': button(() => onWarp('apo')),
        },
        { collapsed: true },
      ),
    },
    [
      transportLabel,
      systemId,
      onTransport,
      onAddCredits,
      onAddDust,
      onHeal,
      onUnlockOutfits,
      onFillTubes,
      onFillCargo,
      onUnlockLore,
      onClearLore,
      onWarp,
    ],
  )

  return null
}
