import {
  Box3,
  DoubleSide,
  Matrix4,
  Ray,
  Vector3,
  type Mesh,
  type Object3D,
} from 'three'
import { MeshBVH, type HitPointInfo } from 'three-mesh-bvh'
import type { HazardField } from '@/ship/PlayerShip'

export type HullCollider = {
  mesh: Mesh
  bvh: MeshBVH
}

export type HullFilter = (mesh: Mesh) => boolean

const _local = new Vector3()
const _inv = new Matrix4()
const _from = new Vector3()
const _to = new Vector3()
const _dir = new Vector3()
const _scale = new Vector3()
const _rootPos = new Vector3()
const _meshCenter = new Vector3()
const _delta = new Vector3()
const _closest = new Vector3()
const _box = new Box3()
const _tmpBox = new Box3()
const _boxCenter = new Vector3()
const _boxHalf = new Vector3()
const _ray = new Ray()
const _hit: HitPointInfo = {
  point: new Vector3(),
  distance: 0,
  faceIndex: 0,
}

/**
 * Skip FX / open-throat meshes (portals, glows, translucent veils).
 * Opaque standard plating is included.
 */
export function isSolidHullMesh(mesh: Mesh): boolean {
  if (mesh.userData?.noCollision) return false
  if (mesh.userData?.collide === true) return true
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material]
  for (const material of materials) {
    if (!material) return false
    // Glows / portal energy / event horizons — alpha lives in the shader
    if ('isMeshBasicMaterial' in material && material.isMeshBasicMaterial) {
      return false
    }
    if ('isShaderMaterial' in material && material.isShaderMaterial) {
      return false
    }
    if ('transparent' in material && material.transparent) {
      const opacity = 'opacity' in material ? (material.opacity as number) : 1
      if (opacity < 0.85) return false
    }
  }
  return true
}

/** Build BVHs in mesh-local geometry space (shared geometry trees are fine). */
export function buildHullColliders(
  root: Object3D,
  filter: HullFilter = isSolidHullMesh,
): HullCollider[] {
  const hull: HullCollider[] = []
  root.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    if (!filter(mesh)) return
    const geom = mesh.geometry
    if (!geom.boundingSphere) geom.computeBoundingSphere()
    if (!geom.boundingBox) geom.computeBoundingBox()
    let bvh = geom.boundsTree as MeshBVH | undefined
    if (!bvh) {
      bvh = new MeshBVH(geom)
      geom.boundsTree = bvh
    }
    hull.push({ mesh, bvh })
  })
  return hull
}

/**
 * Radius from `root` origin that covers every hull mesh AABB, in root-local
 * units (so world radius ≈ local × max root scale).
 */
export function measureHullLocalRadius(
  root: Object3D,
  hull: HullCollider[],
): number {
  if (hull.length === 0) return 0
  root.updateWorldMatrix(true, true)
  _inv.copy(root.matrixWorld).invert()
  _box.makeEmpty()
  for (let i = 0; i < hull.length; i++) {
    const { mesh } = hull[i]!
    const geom = mesh.geometry
    if (!geom.boundingBox) geom.computeBoundingBox()
    if (!geom.boundingBox) continue
    _tmpBox.copy(geom.boundingBox).applyMatrix4(mesh.matrixWorld)
    _tmpBox.applyMatrix4(_inv)
    _box.union(_tmpBox)
  }
  if (_box.isEmpty()) return 0
  _box.getCenter(_boxCenter)
  _box.getSize(_boxHalf).multiplyScalar(0.5)
  let maxR = 0
  for (const sx of [-1, 1] as const) {
    for (const sy of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const d = Math.hypot(
          _boxCenter.x + sx * _boxHalf.x,
          _boxCenter.y + sy * _boxHalf.y,
          _boxCenter.z + sz * _boxHalf.z,
        )
        if (d > maxR) maxR = d
      }
    }
  }
  // Small slack for orbit / Center jitter between measure and query.
  return maxR * 1.08
}

function meshWorldScaleMax(mesh: Mesh): number {
  _scale.setFromMatrixScale(mesh.matrixWorld)
  return Math.max(_scale.x, _scale.y, _scale.z, 1e-6)
}

/** True if `point` is within `pad` (world units) of any hull triangle. */
export function nearHullSurface(
  hull: HullCollider[],
  point: Vector3,
  pad: number,
): boolean {
  for (let i = 0; i < hull.length; i++) {
    const { mesh, bvh } = hull[i]!
    const bs = mesh.geometry.boundingSphere
    if (bs) {
      _meshCenter.copy(bs.center).applyMatrix4(mesh.matrixWorld)
      const worldR = bs.radius * meshWorldScaleMax(mesh) + pad
      if (point.distanceToSquared(_meshCenter) > worldR * worldR) continue
    }
    _inv.copy(mesh.matrixWorld).invert()
    _local.copy(point).applyMatrix4(_inv)
    const localPad = pad / meshWorldScaleMax(mesh)
    const hit = bvh.closestPointToPoint(_local, _hit, 0, localPad)
    if (hit && hit.distance <= localPad) return true
  }
  return false
}

/** Segment ∩ hull triangles (world space). */
export function segmentHitsHull(
  hull: HullCollider[],
  from: Vector3,
  to: Vector3,
): boolean {
  _dir.subVectors(to, from)
  if (_dir.lengthSq() < 1e-16) return false

  for (let i = 0; i < hull.length; i++) {
    const { mesh, bvh } = hull[i]!
    const bs = mesh.geometry.boundingSphere
    if (bs) {
      _meshCenter.copy(bs.center).applyMatrix4(mesh.matrixWorld)
      const worldR = bs.radius * meshWorldScaleMax(mesh)
      // Segment–sphere reject (conservative).
      _delta.copy(to).sub(from)
      const lenSq = _delta.lengthSq()
      let t = 0
      if (lenSq > 1e-16) {
        t = Math.max(
          0,
          Math.min(1, _closest.copy(_meshCenter).sub(from).dot(_delta) / lenSq),
        )
      }
      _closest.copy(from).addScaledVector(_delta, t)
      if (_closest.distanceToSquared(_meshCenter) > worldR * worldR) continue
    }
    _inv.copy(mesh.matrixWorld).invert()
    _from.copy(from).applyMatrix4(_inv)
    _to.copy(to).applyMatrix4(_inv)
    _dir.subVectors(_to, _from)
    const localLen = _dir.length()
    if (localLen < 1e-8) continue
    _dir.multiplyScalar(1 / localLen)
    _ray.origin.copy(_from)
    _ray.direction.copy(_dir)
    if (bvh.raycastFirst(_ray, DoubleSide, 0, localLen)) return true
  }
  return false
}

/**
 * Bind a HazardField that queries a live hull list under `getRoot`.
 * `active` can gate keyed / ghost pads.
 *
 * Far queries early-out on a root sphere (no child matrix walk / BVH).
 * Near queries sync the hull tree at most once per field per macrotask.
 */
export function createMeshHazardField(options: {
  getRoot: () => Object3D | null | undefined
  getHull: () => HullCollider[]
  /** Optional override; otherwise measured lazily from the hull AABBs. */
  getLocalRadius?: () => number
  active?: () => boolean
}): HazardField {
  const { getRoot, getHull, getLocalRadius, active } = options

  let measuredFor: HullCollider[] | null = null
  let measuredRadius = 0
  let childrenSynced = false
  let invalidateQueued = false

  const localRadius = (root: Object3D, hull: HullCollider[]) => {
    if (getLocalRadius) return getLocalRadius()
    if (measuredFor !== hull) {
      measuredRadius = measureHullLocalRadius(root, hull)
      measuredFor = hull
    }
    return measuredRadius
  }

  const queueInvalidate = () => {
    if (invalidateQueued) return
    invalidateQueued = true
    queueMicrotask(() => {
      childrenSynced = false
      invalidateQueued = false
    })
  }

  /** Root pose only — cheap enough for distant early-outs. */
  const syncRoot = (root: Object3D) => {
    root.updateWorldMatrix(true, false)
  }

  /** Full hull tree — once per field until the microtask flush. */
  const syncChildren = (root: Object3D) => {
    if (childrenSynced) return
    root.updateWorldMatrix(true, true)
    childrenSynced = true
    queueInvalidate()
  }

  const worldRadius = (root: Object3D, hull: HullCollider[], pad: number) => {
    _scale.setFromMatrixScale(root.matrixWorld)
    const s = Math.max(_scale.x, _scale.y, _scale.z, 1e-6)
    return localRadius(root, hull) * s + pad
  }

  const pointOutside = (
    root: Object3D,
    hull: HullCollider[],
    point: Vector3,
    pad: number,
  ) => {
    syncRoot(root)
    _rootPos.setFromMatrixPosition(root.matrixWorld)
    const r = worldRadius(root, hull, pad)
    return point.distanceToSquared(_rootPos) > r * r
  }

  const segmentOutside = (
    root: Object3D,
    hull: HullCollider[],
    from: Vector3,
    to: Vector3,
  ) => {
    syncRoot(root)
    _rootPos.setFromMatrixPosition(root.matrixWorld)
    const r = worldRadius(root, hull, 0)
    _dir.subVectors(to, from)
    const lenSq = _dir.lengthSq()
    let t = 0
    if (lenSq > 1e-16) {
      t = Math.max(
        0,
        Math.min(1, _delta.copy(_rootPos).sub(from).dot(_dir) / lenSq),
      )
    }
    _closest.copy(from).addScaledVector(_dir, t)
    return _closest.distanceToSquared(_rootPos) > r * r
  }

  return {
    test(point, pad) {
      if (active && !active()) return false
      const root = getRoot()
      const hull = getHull()
      if (!root || hull.length === 0) return false
      if (pointOutside(root, hull, point, pad)) return false
      syncChildren(root)
      return nearHullSurface(hull, point, pad)
    },
    impact(point, pad) {
      if (active && !active()) return false
      const root = getRoot()
      const hull = getHull()
      if (!root || hull.length === 0) return false
      if (pointOutside(root, hull, point, pad)) return false
      syncChildren(root)
      return nearHullSurface(hull, point, pad)
    },
    occludes(from, to) {
      if (active && !active()) return false
      const root = getRoot()
      const hull = getHull()
      if (!root || hull.length === 0) return false
      if (segmentOutside(root, hull, from, to)) return false
      syncChildren(root)
      return segmentHitsHull(hull, from, to)
    },
  }
}
