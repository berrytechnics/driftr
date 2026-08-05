import { useFrame, useThree } from '@react-three/fiber'
import type { RefObject } from 'react'
import { Vector3, type Group } from 'three'
import type { BanditCombatState, CombatHudState } from '@/combat/combatHud'

type CombatTrackerProps = {
  banditRef: RefObject<Group | null>
  banditCombatRef: RefObject<BanditCombatState>
  hudRef: RefObject<CombatHudState>
  /** Hide while paused / docked / menus */
  active: boolean
}

const _pos = new Vector3()
/** NDC margin — inside this box counts as on-screen (no chevron). */
const ON_SCREEN = 0.82
/** Pixel inset so the chevron sits fully on-screen at the rim. */
const EDGE_INSET_PX = 22

/**
 * Projects the engaged bandit to screen space and writes edge-chevron coords
 * for the DOM CombatChevron overlay.
 */
export function CombatTracker({
  banditRef,
  banditCombatRef,
  hudRef,
  active,
}: CombatTrackerProps) {
  const { camera, size } = useThree()

  useFrame(() => {
    const hud = hudRef.current
    const combat = banditCombatRef.current
    const bandit = banditRef.current

    if (!active || !combat.alive || !combat.engaged || !bandit) {
      hud.engaged = false
      hud.showChevron = false
      return
    }

    hud.engaged = true
    hud.hp = combat.hp
    hud.maxHp = combat.maxHp

    bandit.getWorldPosition(_pos)
    _pos.project(camera)

    let nx = _pos.x
    let ny = _pos.y
    const behind = _pos.z > 1

    if (behind) {
      nx = -nx
      ny = -ny
    }

    const onScreen =
      !behind && Math.abs(nx) < ON_SCREEN && Math.abs(ny) < ON_SCREEN

    if (onScreen) {
      hud.showChevron = false
      return
    }

    // Always land on the padded screen rectangle — never an interior point.
    if (Math.abs(nx) < 1e-6 && Math.abs(ny) < 1e-6) {
      nx = 0
      ny = -1
    }
    const halfW = Math.max(1, size.width * 0.5 - EDGE_INSET_PX)
    const halfH = Math.max(1, size.height * 0.5 - EDGE_INSET_PX)
    const tx = Math.abs(nx) > 1e-8 ? halfW / Math.abs(nx) : Number.POSITIVE_INFINITY
    const ty = Math.abs(ny) > 1e-8 ? halfH / Math.abs(ny) : Number.POSITIVE_INFINITY
    const t = Math.min(tx, ty)

    hud.showChevron = true
    hud.x = size.width * 0.5 + nx * t
    hud.y = size.height * 0.5 - ny * t
    // Screen Y is down; tip points toward the off-screen target
    hud.angle = Math.atan2(-ny, nx)
  })

  return null
}
