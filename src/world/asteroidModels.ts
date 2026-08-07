import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import {
  BufferGeometry,
  Float32BufferAttribute,
  MeshStandardMaterial,
  Sphere,
  Vector3,
  type Mesh,
  type Object3D,
  type Texture,
} from 'three'
import metallicPackUrl from '@/assets/models/props/asteroids_pack_metallic.glb?url'
import spaceRocksUrl from '@/assets/models/props/space_rocks.glb?url'
import type { AsteroidTextureParams } from '@/world/asteroidMaterial'

export const NORMAL_ROCK_URL = metallicPackUrl
export const SHARD_ROCK_URL = spaceRocksUrl

/** Keep the belt variety without paying for every pack mesh. */
export const NORMAL_SHAPE_BUDGET = 4
/** space_rocks.glb is one merged pack — keep a few islands as individual shards. */
export const SHARD_SHAPE_BUDGET = 3
/** Drop dust chips when splitting the pack into islands. */
const MIN_SHARD_ISLAND_TRIS = 400

export type RockSurfaceMaps = {
  map: Texture | null
  normalMap: Texture | null
  roughnessMap: Texture | null
  metalnessMap: Texture | null
  roughness: number
  metalness: number
}

/** AABB half-extents of a unit-sphere-normalized rock mesh (each axis ≤ ~1). */
export type RockHalfExtents = { x: number; y: number; z: number }

export type AsteroidShapeSet = {
  /** Unit-sphere geometries for ore / ice / alloy rocks. */
  normalGeometries: BufferGeometry[]
  /** Unit-sphere geometries for night-omen / shard rocks. */
  shardGeometries: BufferGeometry[]
  /** Concatenated list — index matches Rock.shapeIndex. */
  geometries: BufferGeometry[]
  /**
   * Per-geometry AABB half-extents after unit-sphere normalize.
   * Collision axes = instance scale × these (not max-axis spheres).
   */
  halfExtents: RockHalfExtents[]
  normalShapeCount: number
  shardShapeCount: number
  normalMaps: RockSurfaceMaps
  shardMaps: RockSurfaceMaps
}

const _size = new Vector3()
const _center = new Vector3()
const _sphere = new Sphere()

function firstMeshMaterial(root: Object3D): MeshStandardMaterial | null {
  let found: MeshStandardMaterial | null = null
  root.traverse((child) => {
    if (found) return
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    if (mat && (mat as MeshStandardMaterial).isMeshStandardMaterial) {
      found = mat as MeshStandardMaterial
    }
  })
  return found
}

function extractSurfaceMaps(root: Object3D): RockSurfaceMaps {
  const mat = firstMeshMaterial(root)
  if (!mat) {
    return {
      map: null,
      normalMap: null,
      roughnessMap: null,
      metalnessMap: null,
      roughness: 0.92,
      metalness: 0.08,
    }
  }
  return {
    map: mat.map ?? null,
    normalMap: mat.normalMap ?? null,
    roughnessMap: mat.roughnessMap ?? null,
    metalnessMap: mat.metalnessMap ?? null,
    roughness: mat.roughness ?? 0.92,
    metalness: mat.metalness ?? 0.08,
  }
}

function vertCount(geo: BufferGeometry) {
  return geo.attributes.position?.count ?? 0
}

function triCount(geo: BufferGeometry) {
  const index = geo.getIndex()
  if (index) return index.count / 3
  return vertCount(geo) / 3
}

/** Center + scale so bounding sphere radius ≈ 1. */
function normalizeUnitSphere(geo: BufferGeometry) {
  geo.deleteAttribute('tangent')
  geo.computeBoundingSphere()
  const sphere = geo.boundingSphere
  if (sphere && sphere.radius > 1e-6) {
    _center.copy(sphere.center)
    const inv = 1 / sphere.radius
    geo.translate(-_center.x, -_center.y, -_center.z)
    geo.scale(inv, inv, inv)
  } else {
    geo.computeBoundingBox()
    const box = geo.boundingBox
    if (box) {
      box.getCenter(_center)
      box.getSize(_size)
      const radius = Math.max(_size.x, _size.y, _size.z) * 0.5 || 1
      const inv = 1 / radius
      geo.translate(-_center.x, -_center.y, -_center.z)
      geo.scale(inv, inv, inv)
    }
  }
  geo.computeBoundingSphere()
  if (geo.boundingSphere) {
    geo.boundingSphere.radius = Math.max(geo.boundingSphere.radius, 1)
  } else {
    geo.boundingSphere = _sphere.set(new Vector3(), 1).clone()
  }
}

/** Local AABB half-size after unit-sphere normalize (for fitted ellipsoid colliders). */
export function halfExtentsFromUnitGeo(geo: BufferGeometry): RockHalfExtents {
  geo.computeBoundingBox()
  const box = geo.boundingBox
  if (!box) return { x: 1, y: 1, z: 1 }
  box.getSize(_size)
  // Floor avoids zero-thickness slabs nuking collision; keep well below 1.
  return {
    x: Math.max(_size.x * 0.5, 0.08),
    y: Math.max(_size.y * 0.5, 0.08),
    z: Math.max(_size.z * 0.5, 0.08),
  }
}

/**
 * Split a merged rock pack into whole rocks.
 * UV seams duplicate verts, so weld by position before connectivity —
 * otherwise each shell fragment becomes its own island.
 */
function splitGeometryIslands(source: BufferGeometry): BufferGeometry[] {
  const index = source.getIndex()
  if (!index) return [source.clone()]

  const pos = source.getAttribute('position')
  if (!pos) return [source.clone()]

  const vCount = pos.count
  source.computeBoundingBox()
  const box = source.boundingBox
  const diag = box ? box.getSize(_size).length() : 1
  const weldScale = 1 / Math.max(diag * 1e-5, 1e-8)

  // Position weld — reunite verts cracked only by UV / hard edges
  const keyToCanon = new Map<string, number>()
  const weldOf = new Int32Array(vCount)
  for (let i = 0; i < vCount; i++) {
    const kx = Math.round(pos.getX(i) * weldScale)
    const ky = Math.round(pos.getY(i) * weldScale)
    const kz = Math.round(pos.getZ(i) * weldScale)
    const key = `${kx},${ky},${kz}`
    let canon = keyToCanon.get(key)
    if (canon === undefined) {
      canon = i
      keyToCanon.set(key, canon)
    }
    weldOf[i] = canon
  }

  const parent = new Int32Array(vCount)
  for (let i = 0; i < vCount; i++) parent[i] = i

  const find = (a: number) => {
    let x = a
    while (parent[x] !== x) x = parent[x]
    let y = a
    while (y !== x) {
      const p = parent[y]
      parent[y] = x
      y = p
    }
    return x
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  for (let i = 0; i < index.count; i += 3) {
    const a = weldOf[index.getX(i)]
    const b = weldOf[index.getX(i + 1)]
    const c = weldOf[index.getX(i + 2)]
    union(a, b)
    union(b, c)
  }

  const trisByRoot = new Map<number, number[]>()
  for (let i = 0; i < index.count; i += 3) {
    const root = find(weldOf[index.getX(i)])
    let list = trisByRoot.get(root)
    if (!list) {
      list = []
      trisByRoot.set(root, list)
    }
    list.push(i)
  }

  const attrNames = Object.keys(source.attributes)
  const islands: BufferGeometry[] = []

  for (const triStarts of trisByRoot.values()) {
    const oldToNew = new Map<number, number>()
    const arrays: Record<string, number[]> = {}
    for (const name of attrNames) arrays[name] = []
    const newIndex: number[] = []

    for (const start of triStarts) {
      for (let k = 0; k < 3; k++) {
        const old = index.getX(start + k)
        let neu = oldToNew.get(old)
        if (neu === undefined) {
          neu = oldToNew.size
          oldToNew.set(old, neu)
          for (const name of attrNames) {
            const attr = source.getAttribute(name)
            const itemSize = attr.itemSize
            for (let c = 0; c < itemSize; c++) {
              arrays[name].push(attr.getComponent(old, c))
            }
          }
        }
        newIndex.push(neu)
      }
    }

    const g = new BufferGeometry()
    for (const name of attrNames) {
      const itemSize = source.getAttribute(name).itemSize
      g.setAttribute(
        name,
        new Float32BufferAttribute(new Float32Array(arrays[name]), itemSize),
      )
    }
    g.setIndex(newIndex)
    islands.push(g)
  }

  return islands
}

/**
 * World-space clone of each mesh, centered and scaled so the bounding
 * sphere radius is ~1 (hitRadius ≈ max axis scale still holds).
 */
export function extractUnitRockGeometries(root: Object3D): BufferGeometry[] {
  root.updateMatrixWorld(true)
  const geometries: BufferGeometry[] = []

  root.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh || !mesh.geometry) return

    const geo = mesh.geometry.clone()
    geo.applyMatrix4(mesh.matrixWorld)
    normalizeUnitSphere(geo)
    geometries.push(geo)
  })

  return geometries
}

/**
 * space_rocks is a single merged Sketchfab mesh of many rocks.
 * Split into islands and keep a few mid/large ones as shard shapes.
 */
function extractShardRockGeometries(
  root: Object3D,
  budget = SHARD_SHAPE_BUDGET,
): BufferGeometry[] {
  root.updateMatrixWorld(true)
  const islands: BufferGeometry[] = []

  root.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const geo = mesh.geometry.clone()
    geo.applyMatrix4(mesh.matrixWorld)
    const parts = splitGeometryIslands(geo)
    geo.dispose()
    for (const part of parts) islands.push(part)
  })

  const usable = islands.filter((g) => triCount(g) >= MIN_SHARD_ISLAND_TRIS)
  usable.sort((a, b) => triCount(b) - triCount(a))
  const chosen = usable.slice(0, budget)
  for (const g of islands) {
    if (!chosen.includes(g)) g.dispose()
  }
  for (const g of chosen) normalizeUnitSphere(g)

  // Fallback: whole pack as one shape if island split failed
  if (chosen.length === 0) {
    return extractUnitRockGeometries(root)
  }
  return chosen
}

/**
 * Lightweight PBR material for the belt.
 * Pack albedo/normal maps already carry detail — skip the old FBM overlay
 * (it was a major fragment cost at Sol density).
 */
export function createBeltRockMaterial(
  maps: RockSurfaceMaps,
  texture: AsteroidTextureParams,
  _opts?: { shardShade?: boolean },
) {
  const material = new MeshStandardMaterial({
    map: maps.map,
    // Normal maps read well up close; keep them (budget is instance count, not maps).
    normalMap: maps.normalMap,
    roughnessMap: maps.roughnessMap,
    metalnessMap: maps.metalnessMap,
    roughness: texture.roughness,
    metalness: texture.metalness,
    // Keep env reflections tiny — warm lightformers + metalness = sun halo crawl
    envMapIntensity: 0.03,
    flatShading: false,
    transparent: false,
    opacity: 1,
    depthWrite: true,
  })
  // Pack albedo may carry unused alpha — never let it ghost the belt.
  if (material.map) material.map.premultiplyAlpha = false
  return material
}

export function applyBeltRockTextureParams(
  material: MeshStandardMaterial,
  texture: AsteroidTextureParams,
  _opts?: { shardShade?: boolean; maps?: RockSurfaceMaps },
) {
  material.roughness = texture.roughness
  material.metalness = texture.metalness
}

/** Load both packs and build unit geometries + surface maps. */
export function useAsteroidShapeSet(): AsteroidShapeSet {
  const metallic = useGLTF(NORMAL_ROCK_URL, true, true)
  const rocks = useGLTF(SHARD_ROCK_URL, true, true)

  return useMemo(() => {
    const allNormal = extractUnitRockGeometries(metallic.scene)
    // Prefer cheaper silhouettes for the dense belt draw.
    allNormal.sort((a, b) => vertCount(a) - vertCount(b))
    const normalGeometries = allNormal.slice(0, NORMAL_SHAPE_BUDGET)
    for (let i = NORMAL_SHAPE_BUDGET; i < allNormal.length; i++) {
      allNormal[i].dispose()
    }

    const shardGeometries = extractShardRockGeometries(rocks.scene)
    if (normalGeometries.length === 0) {
      throw new Error('asteroids_pack_metallic.glb has no meshes')
    }
    if (shardGeometries.length === 0) {
      throw new Error('space_rocks.glb has no meshes')
    }
    const geometries = [...normalGeometries, ...shardGeometries]
    return {
      normalGeometries,
      shardGeometries,
      geometries,
      halfExtents: geometries.map(halfExtentsFromUnitGeo),
      normalShapeCount: normalGeometries.length,
      shardShapeCount: shardGeometries.length,
      normalMaps: extractSurfaceMaps(metallic.scene),
      shardMaps: extractSurfaceMaps(rocks.scene),
    }
  }, [metallic.scene, rocks.scene])
}

useGLTF.preload(NORMAL_ROCK_URL, true, true)
useGLTF.preload(SHARD_ROCK_URL, true, true)
