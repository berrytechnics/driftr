import { useRef } from 'react'
import { button, folder, useControls } from 'leva'
import type { AdminWarpId } from '@/dev/adminTypes'
import {
  ALT_STAR_NAME,
  STAR_NAME,
  SYSTEM_IDS,
  type SystemId,
} from '@/game/systemConfig'
import { SIPHON_REPAIR_SHARD_COST } from '@/lore/easterEggs'

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
  /** Revive every dormant Vesper siphon (powers the gate). */
  onRepairAllSiphons: () => void
  /** Wipe siphon repair progress (gate goes dark again). */
  onClearSiphonRepairs: () => void
}

/**
 * Leva folder for sky hops, cheats, lore flags, and warps.
 * Mounted via CheatPanel when the player enables cheats from pause.
 */
export function AdminPanel(props: AdminPanelProps) {
  const propsRef = useRef(props)
  propsRef.current = props

  const skyPairLabel =
    props.systemId === SYSTEM_IDS.sol
      ? `Hop → ${ALT_STAR_NAME}`
      : props.systemId === SYSTEM_IDS.gateVoid
        ? `Hop → ${STAR_NAME}`
        : `Hop → ${STAR_NAME}`

  const voidHopLabel =
    props.systemId === SYSTEM_IDS.gateVoid
      ? `Hop → ${ALT_STAR_NAME} (gate)`
      : 'Hop → gate void'

  useControls(
    'Admin',
    {
      sky: folder(
        {
          [skyPairLabel]: button(() => {
            const p = propsRef.current
            if (p.systemId === SYSTEM_IDS.gateVoid) {
              p.onTransport(SYSTEM_IDS.sol)
              return
            }
            p.onTransport(
              p.systemId === SYSTEM_IDS.sol
                ? SYSTEM_IDS.nyxAlt
                : SYSTEM_IDS.sol,
            )
          }),
          [voidHopLabel]: button(() => {
            const p = propsRef.current
            p.onTransport(
              p.systemId === SYSTEM_IDS.gateVoid
                ? SYSTEM_IDS.nyxAlt
                : SYSTEM_IDS.gateVoid,
            )
          }),
        },
        { collapsed: false },
      ),
      cheats: folder(
        {
          'Credits +1000': button(() => propsRef.current.onAddCredits(1000)),
          'Nyx dust +1': button(() => propsRef.current.onAddDust(1)),
          [`Nyx dust +${SIPHON_REPAIR_SHARD_COST}`]: button(() =>
            propsRef.current.onAddDust(SIPHON_REPAIR_SHARD_COST),
          ),
          'Heal hull': button(() => propsRef.current.onHeal()),
          'Unlock outfits': button(() => propsRef.current.onUnlockOutfits()),
          'Fill tubes': button(() => propsRef.current.onFillTubes()),
          'Fill cargo': button(() => propsRef.current.onFillCargo()),
        },
        { collapsed: false },
      ),
      siphon: folder(
        {
          'Repair all siphons': button(() =>
            propsRef.current.onRepairAllSiphons(),
          ),
          'Clear siphon repairs': button(() =>
            propsRef.current.onClearSiphonRepairs(),
          ),
          'Warp · siphon ring': button(() =>
            propsRef.current.onWarp('siphon'),
          ),
          'Warp · misplanted gate': button(() =>
            propsRef.current.onWarp('gate'),
          ),
        },
        { collapsed: false },
      ),
      lore: folder(
        {
          'Unlock all lore': button(() => propsRef.current.onUnlockLore()),
          'Clear lore flags': button(() => propsRef.current.onClearLore()),
        },
        { collapsed: true },
      ),
      warp: folder(
        {
          'Warp · near sun': button(() => propsRef.current.onWarp('sun')),
          'Warp · inner': button(() => propsRef.current.onWarp('inner')),
          'Warp · belt': button(() => propsRef.current.onWarp('belt')),
          'Warp · outer': button(() => propsRef.current.onWarp('outer')),
          'Warp · apo / far': button(() => propsRef.current.onWarp('apo')),
        },
        { collapsed: true },
      ),
    },
    { collapsed: false, order: -1 },
    [skyPairLabel, voidHopLabel],
  )

  return null
}
