// Cloth that hangs and moves: skirts, dresses and coat tails are simulated every frame (position-based dynamics)
// instead of being fixed shapes. The waistband and anything above the hips follow her body exactly; below that the
// cloth falls under gravity, keeps its length (so a flared hem gathers into real folds), bends a little stiffly,
// slides off her legs, lags behind as she sways and stirs in a faint breeze. Units: dm, in the body's rest frame.
import * as THREE from 'three';

export interface Shell { y0: number; dy: number; nb: number; NA: number; cx: Float32Array; cz: Float32Array; r: Float32Array; top: number; hem: number;
  /** the hem's height round her (16 directions, angle 0 = front) and the centre it's measured from */ hemA: Float32Array; hx: number; hz: number }

interface Capsule { a: number; b: number; r: number; r2?: number }   // bone indices (head of a to head of b); radius at a and at b (tapered)

export class Drape {
  readonly mesh: THREE.Mesh;
  private readonly rest: Float32Array;      // the garment's designed shape (rest frame)
  private readonly pin: Float32Array;       // 1 held by the body .. 0 free
  private readonly si: Uint16Array | Uint8Array | Float32Array; private readonly sw: Float32Array;
  private readonly x: Float32Array; private readonly xp: Float32Array; private readonly tgt: Float32Array;
  private readonly cons: Float32Array;      // a, b, rest length, stiffness
  private readonly caps: Capsule[];
  private readonly mats: THREE.Matrix4[] = [];
  private readonly capPts: THREE.Vector3[] = [];
  private readonly memory: number; private readonly floor: number;
  private t = 0; private started = false; private readonly inv = new THREE.Matrix4();

  constructor(geo: THREE.BufferGeometry, material: THREE.Material, private readonly bones: THREE.Bone[], private readonly skeleton: THREE.Skeleton,
    private readonly bindMatrix: THREE.Matrix4, private readonly holder: THREE.Object3D, caps: Capsule[], o: { stiff?: number; memory?: number; floor?: number } = {}) {
    this.memory = o.memory ?? 0.004; this.floor = o.floor ?? -1e9;
    this.rest = Float32Array.from((geo.attributes.clothRest as THREE.BufferAttribute).array as Float32Array);
    this.pin = (geo.attributes.clothPin as THREE.BufferAttribute).array as Float32Array;
    this.si = (geo.attributes.skinIndex as THREE.BufferAttribute).array as Uint16Array;
    this.sw = (geo.attributes.skinWeight as THREE.BufferAttribute).array as Float32Array;
    const n = this.rest.length / 3;
    this.x = Float32Array.from(this.rest); this.xp = Float32Array.from(this.rest); this.tgt = Float32Array.from(this.rest);
    // the simulated mesh: plain (not skinned), positions written every frame; the offset is already in the shape
    const g = geo.clone();
    g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight');
    g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(this.rest), 3));
    g.setAttribute('clothOff', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.computeVertexNormals();
    (material as THREE.Material & { defines?: Record<string, unknown> }).defines = { ...((material as THREE.Material & { defines?: Record<string, unknown> }).defines ?? {}), CLOTH_SIM: '' };
    this.mesh = new THREE.Mesh(g, material); this.mesh.frustumCulled = false;
    // constraints: every edge keeps its length (stretch), and the far corners across each edge keep theirs
    // (bending: the stiffer it is, the bigger and softer the folds)
    const idx = geo.index!.array, seen = new Set<number>(), C: number[] = [], key = (a: number, b: number) => Math.min(a, b) * n + Math.max(a, b);
    const L = (a: number, b: number) => Math.hypot(this.rest[a * 3] - this.rest[b * 3], this.rest[a * 3 + 1] - this.rest[b * 3 + 1], this.rest[a * 3 + 2] - this.rest[b * 3 + 2]);
    const opp = new Map<number, number>();
    for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) {
      const a = idx[t + e], b = idx[t + (e + 1) % 3], c = idx[t + (e + 2) % 3], k = key(a, b);
      if (!seen.has(k)) { seen.add(k); if (this.pin[a] < 1 || this.pin[b] < 1) C.push(a, b, L(a, b), 1); }
      const o2 = opp.get(k);
      if (o2 === undefined) opp.set(k, c);
      else if (this.pin[c] < 1 || this.pin[o2] < 1) C.push(c, o2, L(c, o2), o.stiff ?? 0.25);
    }
    this.cons = Float32Array.from(C);
    this.caps = caps;
    for (let i = 0; i < bones.length; i++) this.mats.push(new THREE.Matrix4());
    for (let i = 0; i < caps.length * 2; i++) this.capPts.push(new THREE.Vector3());
  }

  /** Advance one frame (call after posing the skeleton). */
  step(dt = 1 / 60, iterations = 6) {
    const { bones, skeleton, x, xp, tgt, rest, pin, si, sw } = this, n = rest.length / 3;
    // each bone's full transform in the garment's space (bind space -> posed bind space)
    // (like a skinned mesh: bind pose -> bones -> back into the holder's current space)
    const inv = this.inv.copy(this.holder.matrixWorld).invert();
    for (let b = 0; b < bones.length; b++) this.mats[b].multiplyMatrices(bones[b].matrixWorld, skeleton.boneInverses[b]).premultiply(inv).multiply(this.bindMatrix);
    // where the body wants each point (her pose), by its skin weights
    for (let v = 0; v < n; v++) {
      const px = rest[v * 3], py = rest[v * 3 + 1], pz = rest[v * 3 + 2];
      let ox = 0, oy = 0, oz = 0;
      for (let q = 0; q < 4; q++) {
        const w = sw[v * 4 + q]; if (!w) continue;
        const e = this.mats[si[v * 4 + q]].elements;
        ox += w * (e[0] * px + e[4] * py + e[8] * pz + e[12]); oy += w * (e[1] * px + e[5] * py + e[9] * pz + e[13]); oz += w * (e[2] * px + e[6] * py + e[10] * pz + e[14]);
      }
      tgt[v * 3] = ox; tgt[v * 3 + 1] = oy; tgt[v * 3 + 2] = oz;
    }
    if (!this.started) { x.set(tgt); xp.set(tgt); this.started = true; }
    // her legs and hips as capsules, from the posed bones
    for (let c = 0; c < this.caps.length; c++) {
      for (const [j, bi] of [[0, this.caps[c].a], [1, this.caps[c].b]] as const) {
        this.capPts[c * 2 + j].setFromMatrixPosition(bones[bi].matrixWorld).applyMatrix4(inv);
      }
    }
    // move: inertia (damped), gravity, a faint breeze, and a gentle pull back towards the designed shape
    this.t += dt;
    const g = 98 * dt * dt, wind = Math.sin(this.t * 0.7) * Math.sin(this.t * 0.23 + 1) * 0.00035, damp = 0.985;
    for (let v = 0; v < n; v++) {
      const o = v * 3, a = pin[v];
      if (a >= 0.999) { xp[o] = x[o] = tgt[o]; xp[o + 1] = x[o + 1] = tgt[o + 1]; xp[o + 2] = x[o + 2] = tgt[o + 2]; continue; }
      const vx = (x[o] - xp[o]) * damp, vy = (x[o + 1] - xp[o + 1]) * damp, vz = (x[o + 2] - xp[o + 2]) * damp;
      xp[o] = x[o]; xp[o + 1] = x[o + 1]; xp[o + 2] = x[o + 2];
      const mem = this.memory + 0.3 * a * a;   // free cloth barely remembers its shape; near the waist it holds it
      x[o] += vx + (tgt[o] - x[o]) * mem + wind * (1 - a);
      x[o + 1] += vy - g * (1 - a) + (tgt[o + 1] - x[o + 1]) * mem;
      x[o + 2] += vz + (tgt[o + 2] - x[o + 2]) * mem + wind * 0.6 * (1 - a);
    }
    const C = this.cons;
    for (let it = 0; it < iterations; it++) {
      for (let c = 0; c < C.length; c += 4) {
        const a = C[c] * 3, b = C[c + 1] * 3, wa = 1 - pin[C[c]], wb = 1 - pin[C[c + 1]], ws = wa + wb;
        if (ws <= 0) continue;
        const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2], d = Math.hypot(dx, dy, dz) || 1e-6;
        const f = (d - C[c + 2]) / d * C[c + 3] / ws;
        x[a] += dx * f * wa; x[a + 1] += dy * f * wa; x[a + 2] += dz * f * wa;
        x[b] -= dx * f * wb; x[b + 1] -= dy * f * wb; x[b + 2] -= dz * f * wb;
      }
      this.collide();
    }
    for (let v = 0; v < n; v++) if (x[v * 3 + 1] < this.floor) x[v * 3 + 1] = this.floor;   // never through the floor
    // pinned points sit exactly on the body
    for (let v = 0; v < n; v++) {
      const a = pin[v]; if (a <= 0) continue;
      const o = v * 3; x[o] += (tgt[o] - x[o]) * a; x[o + 1] += (tgt[o + 1] - x[o + 1]) * a; x[o + 2] += (tgt[o + 2] - x[o + 2]) * a;
    }
    const pa = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    (pa.array as Float32Array).set(x); pa.needsUpdate = true;
  }
  /** After this frame's steps (and layering): refresh the shading. */
  finish() { this.mesh.geometry.computeVertexNormals(); }

  /** Keep the cloth outside her legs and hips. */
  private collide() {
    const { x, pin } = this, n = x.length / 3;
    for (let c = 0; c < this.caps.length; c++) {
      const A = this.capPts[c * 2], B = this.capPts[c * 2 + 1], r = Math.max(this.caps[c].r, this.caps[c].r2 ?? 0), ra = this.caps[c].r, rb = this.caps[c].r2 ?? ra;
      const abx = B.x - A.x, aby = B.y - A.y, abz = B.z - A.z, ll = abx * abx + aby * aby + abz * abz || 1;
      const ylo = Math.min(A.y, B.y) - r, yhi = Math.max(A.y, B.y) + r;
      for (let v = 0; v < n; v++) {
        if (pin[v] >= 0.999) continue;
        const o = v * 3, py = x[o + 1]; if (py < ylo || py > yhi) continue;
        const px = x[o] - A.x, pyy = py - A.y, pz = x[o + 2] - A.z;
        const t = Math.max(0, Math.min(1, (px * abx + pyy * aby + pz * abz) / ll));
        const qx = px - abx * t, qy = pyy - aby * t, qz = pz - abz * t, d = Math.hypot(qx, qy, qz), rt = ra + (rb - ra) * t;
        if (d >= rt || d < 1e-6) continue;
        const k = (rt - d) / d; x[o] += qx * k; x[o + 1] += qy * k; x[o + 2] += qz * k;
      }
    }
  }

  /**
   * Layers: this garment's outline round her (radius by height and by angle), so cloth worn under it can be kept
   * inside it, a fabric's thickness in (a dress under a trench coat stays under the coat).
   */
  shell(): Shell {
    const { x } = this, n = x.length / 3, dy = 0.12, NA = 32;
    let y0 = Infinity, y1 = -Infinity;
    for (let v = 0; v < n; v++) { y0 = Math.min(y0, x[v * 3 + 1]); y1 = Math.max(y1, x[v * 3 + 1]); }
    const nb = Math.max(1, Math.ceil((y1 - y0) / dy) + 1), cx = new Float32Array(nb), cz = new Float32Array(nb), cn = new Float32Array(nb);
    for (let v = 0; v < n; v++) { const b = Math.floor((x[v * 3 + 1] - y0) / dy); cx[b] += x[v * 3]; cz[b] += x[v * 3 + 2]; cn[b]++; }
    for (let b = 0; b < nb; b++) if (cn[b]) { cx[b] /= cn[b]; cz[b] /= cn[b]; }
    const r = new Float32Array(nb * NA), rn = new Float32Array(nb * NA);
    for (let v = 0; v < n; v++) {
      const b = Math.floor((x[v * 3 + 1] - y0) / dy), dx = x[v * 3] - cx[b], dz = x[v * 3 + 2] - cz[b];
      const a = Math.floor(((Math.atan2(dx, dz) / (Math.PI * 2)) + 1) % 1 * NA) % NA, i = b * NA + a;
      r[i] = Math.max(r[i], Math.hypot(dx, dz)); rn[i]++;   // the outside of the cloth (the hem's inner turn is smaller)
    }
    for (let i = 0; i < r.length; i++) if (!rn[i]) r[i] = -1;
    // fill empty angle bins from their neighbours, so there are no gaps to poke through
    for (let b = 0; b < nb; b++) for (let pass = 0; pass < 3; pass++) for (let a = 0; a < NA; a++) { const i = b * NA + a; if (r[i] > 0) continue; const l = r[b * NA + (a + NA - 1) % NA], rr = r[b * NA + (a + 1) % NA]; if (l > 0 || rr > 0) r[i] = Math.max(l, rr); }
    // the coat's hem: the height most of its bottom edge hangs at (its lowest points are a ragged edge)
    const ys: number[] = []; for (let v = 0; v < n; v += 3) ys.push(x[v * 3 + 1]); ys.sort((a2, b2) => a2 - b2);
    // and its height in each direction round her (where the hem rises, e.g. at the open front, it's higher)
    // (measured from the middle of the coat a little above its hem, not its few lowest points, which hang off-centre)
    // the middle of its outline (bounding box) over the bottom stretch of the coat: vertex averages lean towards
    // wherever the cloth is densest, which put the "middle" out in front of her
    const hm0 = ys[Math.floor(ys.length * 0.04)] ?? y0;
    let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
    for (let v = 0; v < n; v++) { const y = x[v * 3 + 1]; if (y < hm0 || y > hm0 + 1.5) continue; bx0 = Math.min(bx0, x[v * 3]); bx1 = Math.max(bx1, x[v * 3]); bz0 = Math.min(bz0, x[v * 3 + 2]); bz1 = Math.max(bz1, x[v * 3 + 2]); }
    const hx = isFinite(bx0) ? (bx0 + bx1) / 2 : cx[0], hz = isFinite(bz0) ? (bz0 + bz1) / 2 : cz[0], H = 16, hemA = new Float32Array(H).fill(Infinity);
    for (let v = 0; v < n; v++) {
      const a = Math.floor(((Math.atan2(x[v * 3] - hx, x[v * 3 + 2] - hz) / (Math.PI * 2)) + 1) % 1 * H) % H;
      hemA[a] = Math.min(hemA[a], x[v * 3 + 1]);
    }
    const hm = ys[Math.floor(ys.length * 0.04)] ?? y0;
    for (let a = 0; a < H; a++) if (!isFinite(hemA[a])) hemA[a] = hm;
    { const c = hemA.slice(); for (let a = 0; a < H; a++) hemA[a] = Math.max(c[a], (c[(a + H - 1) % H] + c[(a + 1) % H]) / 2); }   // the higher of each and its neighbours' mean
    return { y0, dy, nb, NA, cx, cz, r, top: y1, hem: hm, hemA, hx, hz };
  }
  /** Keep this cloth inside a garment worn over it (from its shell), `gap` in from it. */
  keepInside(sh: Shell, gap = 0.06) {
    const { x, xp, pin } = this, n = x.length / 3;
    for (let v = 0; v < n; v++) {
      if (pin[v] >= 0.999) continue;
      const o = v * 3, b = Math.floor((x[o + 1] - sh.y0) / sh.dy);
      if (b < 0 || b >= sh.nb || x[o + 1] > sh.top - 0.3) continue;
      const dx = x[o] - sh.cx[b], dz = x[o + 2] - sh.cz[b], d = Math.hypot(dx, dz);
      const a = Math.floor(((Math.atan2(dx, dz) / (Math.PI * 2)) + 1) % 1 * sh.NA) % sh.NA, R = sh.r[b * sh.NA + a];
      if (R <= 0 || d <= R - gap || d < 1e-5) continue;
      const k = (R - gap) / d, nx = sh.cx[b] + dx * k, nz = sh.cz[b] + dz * k;
      xp[o] += nx - x[o]; xp[o + 2] += nz - x[o + 2];   // move without a kick
      x[o] = nx; x[o + 2] = nz;
    }
    const pa = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    (pa.array as Float32Array).set(x); pa.needsUpdate = true;
  }

  /** Don't draw this cloth between these heights (hidden under a coat); pass nothing to draw it all. */
  hideBetween(lo = 1e9, hi = 1e9, sh?: Shell) {
    const ud = (this.mesh.material as THREE.Material).userData, u = ud.hide as { value: THREE.Vector2 } | undefined;
    u?.value.set(lo, hi);
    const ha = ud.hideA as { value: number[] } | undefined, hc = ud.hideC as { value: THREE.Vector2 } | undefined;
    if (ha && hc) { if (sh) { for (let i = 0; i < 16; i++) ha.value[i] = sh.hemA[i] - 0.02; hc.value.set(sh.hx, sh.hz); } else ha.value.fill(-1e9); }
  }

  dispose() { this.mesh.geometry.dispose(); }
}

/**
 * Her legs and hips as capsules (from her own shape): thighs, shins and a hip capsule across the top of the thighs.
 * Radius = how far her skin sits from each bone, plus a little room for the clothes under the skirt.
 */
export function legCapsules(boneNames: string[], boneIndexOfVertex: (v: number) => number, nVerts: number, pos: Float32Array,
  joint: (name: string) => THREE.Vector3, margin = 0.06): Capsule[] {
  const I = (n: string) => boneNames.indexOf(n);
  const segs: [string, string, string[]][] = [];
  for (const s of ['L', 'R']) segs.push([`upperleg01.${s}`, `lowerleg01.${s}`, [`upperleg01.${s}`, `upperleg02.${s}`]], [`lowerleg01.${s}`, `foot.${s}`, [`lowerleg01.${s}`, `lowerleg02.${s}`]]);
  const out: Capsule[] = [];
  for (const [a, b, owners] of segs) {
    const A = joint(a), B = joint(b), own = new Set(owners.map(I)), ds: number[] = [];
    const ab = B.clone().sub(A), ll = ab.lengthSq() || 1, p = new THREE.Vector3(), ds2: number[] = [];
    for (let v = 0; v < nVerts; v += 2) {
      if (!own.has(boneIndexOfVertex(v))) continue;
      p.set(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]).sub(A);
      const t = Math.max(0, Math.min(1, p.dot(ab) / ll)), d = p.sub(ab.clone().multiplyScalar(t)).length();
      if (t < 0.35) ds.push(d); else if (t > 0.65) ds2.push(d);
    }
    const pct = (a2: number[]) => { a2.sort((x, y) => x - y); return (a2[Math.floor(a2.length * 0.82)] ?? 0.4) + margin; };
    out.push({ a: I(a), b: I(b), r: pct(ds), r2: pct(ds2) });
  }
  // hips: across the tops of both thighs
  const hipR = Math.min(out[0].r, out[2].r) * 0.95;
  out.push({ a: I('upperleg01.L'), b: I('upperleg01.R'), r: hipR });
  return out;
}
