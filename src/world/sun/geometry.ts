import { BufferAttribute, BufferGeometry, Vector3 } from 'three'

function randomUnit(v: Vector3) {
  const z = Math.random() * 2 - 1
  const t = Math.random() * Math.PI * 2
  const r = Math.sqrt(Math.max(0, 1 - z * z))
  return v.set(r * Math.cos(t), r * Math.sin(t), z)
}

/** Outward noise ribbons (corona rays). */
export function createSunRaysGeometry(
  sunRadius: number,
  lineCount = 1024,
  lineLength = 8,
) {
  const totalVerts = lineCount * lineLength * 2
  const aPos = new Float32Array(totalVerts * 3)
  const aPos0 = new Float32Array(totalVerts * 3)
  const aWireRand = new Float32Array(totalVerts * 4)
  const indices = new Uint32Array(lineCount * (lineLength - 1) * 2 * 3)

  const base = new Vector3()
  const jitter = new Vector3()
  const held = new Vector3()

  let ip = 0
  let i0 = 0
  let ir = 0
  let ii = 0
  let d = Math.random()
  let p = Math.random()

  for (let v = 0; v < lineCount; v++) {
    if (Math.random() < 0.1 || v === 0) {
      randomUnit(held).normalize()
      d = Math.random()
      p = Math.random()
    }
    base.copy(held)
    randomUnit(jitter).multiplyScalar(0.025)
    base.add(jitter).normalize()
    const rands = [d, p, Math.random(), Math.random()]

    for (let m = 0; m < lineLength; m++) {
      const vertBase = 2 * (v * lineLength + m)
      for (let y = 0; y <= 1; y++) {
        aPos[ip++] = (m + 0.5) / lineLength
        aPos[ip++] = (v + 0.5) / lineCount
        aPos[ip++] = 2 * y - 1
        for (let t = 0; t < 4; t++) aWireRand[ir++] = rands[t]
        aPos0[i0++] = base.x * sunRadius
        aPos0[i0++] = base.y * sunRadius
        aPos0[i0++] = base.z * sunRadius
      }
      if (m < lineLength - 1) {
        const a = vertBase + 0
        const b = vertBase + 1
        const c = vertBase + 2
        const e = vertBase + 3
        indices[ii++] = a
        indices[ii++] = b
        indices[ii++] = c
        indices[ii++] = c
        indices[ii++] = b
        indices[ii++] = e
      }
    }
  }

  const geo = new BufferGeometry()
  geo.setAttribute('aPos', new BufferAttribute(aPos, 3))
  geo.setAttribute('aPos0', new BufferAttribute(aPos0, 3))
  geo.setAttribute('aWireRandom', new BufferAttribute(aWireRand, 4))
  geo.setIndex(new BufferAttribute(indices, 1))
  return geo
}

/** Arcing rim flares. */
export function createSunFlaresGeometry(
  sunRadius: number,
  lineCount = 768,
  lineLength = 12,
) {
  const aPos = new Float32Array(lineCount * lineLength * 2 * 3)
  const aPos0 = new Float32Array(lineCount * lineLength * 2 * 3)
  const aPos1 = new Float32Array(lineCount * lineLength * 2 * 3)
  const aWireRand = new Float32Array(lineCount * lineLength * 2 * 4)
  const indices = new Uint32Array(lineCount * (lineLength - 1) * 2 * 3)

  const held = new Vector3()
  const d = new Vector3()
  const f = new Vector3()
  const p = new Vector3()
  const g = new Vector3()

  let s = 0
  let l = 0
  let c = 0
  let h = 0
  let u = 0
  let m = Math.random()
  let _p = Math.random()

  for (let y = 0; y < lineCount; y++) {
    if (Math.random() < 0.025 || y === 0) {
      d.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize()
      held.copy(d)
      g.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
        .normalize()
        .multiplyScalar(0.4)
      held.add(g).normalize()
      m = Math.random()
      _p = Math.random()
    }
    f.copy(d)
    g.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
      .normalize()
      .multiplyScalar(0.02)
    f.add(g).normalize()
    p.copy(held)
    g.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
      .normalize()
      .multiplyScalar(0.075)
    p.add(g).normalize()
    const rands = [m, _p, Math.random(), Math.random()]

    for (let E = 0; E < lineLength; E++) {
      const base = 2 * (y * lineLength + E)
      for (let A = 0; A <= 1; A++) {
        aPos[s++] = (E + 0.5) / lineLength
        aPos[s++] = (y + 0.5) / lineCount
        aPos[s++] = 2 * A - 1
        for (let R = 0; R < 4; R++) aWireRand[l++] = rands[R]
        aPos0[c++] = f.x * sunRadius
        aPos0[c++] = f.y * sunRadius
        aPos0[c++] = f.z * sunRadius
        aPos1[h++] = p.x * sunRadius
        aPos1[h++] = p.y * sunRadius
        aPos1[h++] = p.z * sunRadius
      }
      if (E < lineLength - 1) {
        indices[u++] = base + 0
        indices[u++] = base + 1
        indices[u++] = base + 2
        indices[u++] = base + 2
        indices[u++] = base + 1
        indices[u++] = base + 3
      }
    }
  }

  const geo = new BufferGeometry()
  geo.setAttribute('aPos', new BufferAttribute(aPos, 3))
  geo.setAttribute('aPos0', new BufferAttribute(aPos0, 3))
  geo.setAttribute('aPos1', new BufferAttribute(aPos1, 3))
  geo.setAttribute('aWireRandom', new BufferAttribute(aWireRand, 4))
  geo.setIndex(new BufferAttribute(indices, 1))
  return geo
}
