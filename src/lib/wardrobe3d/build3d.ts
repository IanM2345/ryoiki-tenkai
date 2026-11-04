// Clothes and hair for the 3D body, generated to fit whatever shape she has.
// Clothes are cut from MakeHuman's helper shells (a full-body "tights" shell and a skirt), which
// follow every body morph; hair is built around the head. All in the T-pose rest frame, in
// decimetres (MakeHuman's unit), +x = her left, +y up, +z forward.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { slotOf, type Shape3D, type Slot3D } from './shapes3d';
import { garmentSpecs } from './garments3d';
import { wearables, type WearableKind } from './wearables3d';
import type { BodyModel } from './body3d';

export interface Marks {
  neckY: number; shoulderX: number; armpitY: number; elbowX: number; wristX: number; bustY: number; underbustY: number;
  waistY: number; hipY: number; crotchY: number; kneeY: number; ankleY: number; soleY: number;
  head: THREE.Vector3; headTop: number; headR: number; headFront: number; headBack: number; chinY: number;
  shoulderJ: THREE.Vector3; elbowJ: THREE.Vector3; wristJ: THREE.Vector3;
  /** the left foot: ankle joint z, back of the heel and tip of the toes (z), its centre (x) */
  ankleZ: number; heelZ: number; toeZ: number; footX: number;
  /** her eyes (left eye's centre) and the widest point of her head at ear height */
  eye: THREE.Vector3; earX: number;
}

export function marks(m: BodyModel, pos: Float32Array, surf: Float32Array): Marks {   // pos: original vertices (joints), surf: the smooth surface
  const J = (bone: string, end: 'head' | 'tail' = 'head') => { const b = m.bones[m.boneIndex(bone)]; return m.joint(pos, b[end]); };
  // head size from the head itself (skin above the head joint)
  const hc = J('head', 'head'), body = m.groups.body;
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < body.length; i++) {
    const o = m.rmap[body[i]] * 3;
    if (surf[o + 1] < hc[1]) continue;
    for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], surf[o + c]); hi[c] = Math.max(hi[c], surf[o + c]); }
  }
  const top = hi[1], centre = new THREE.Vector3(0, (lo[1] + hi[1]) / 2 + (hi[1] - lo[1]) * 0.08, (lo[2] + hi[2]) / 2 - (hi[2] - lo[2]) * 0.05);
  const maxR = Math.max(hi[0], (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2) * 0.98;
  const sp = J('spine02'), sp1 = J('spine01'), sp3 = J('spine03'), ul = J('upperleg02.L'), kn = J('lowerleg01.L'), an = J('foot.L');
  return {
    neckY: J('neck01')[1], shoulderX: J('upperarm01.L')[0], armpitY: J('upperarm01.L')[1] - 0.7, elbowX: J('lowerarm01.L')[0], wristX: J('wrist.L')[0],
    bustY: sp1[1] - 0.2, underbustY: sp[1] - 0.1, waistY: sp3[1] - 0.1, hipY: J('spine05')[1] - 0.3, crotchY: ul[1] + 0.2,
    kneeY: kn[1], ankleY: an[1], soleY: (() => { let y = 1e9; const b = m.groups.body; for (let i = 0; i < b.length; i++) y = Math.min(y, surf[m.rmap[b[i]] * 3 + 1]); return y; })(),
    head: centre, headTop: top, headR: maxR, headFront: hi[2], headBack: lo[2], chinY: lo[1],
    shoulderJ: new THREE.Vector3(...J('upperarm01.L')), elbowJ: new THREE.Vector3(...J('lowerarm01.L')), wristJ: new THREE.Vector3(...J('wrist.L')),
    ...(() => {   // eyes from the fitted eyeballs; ears = how wide her head is just below eye level
      const ep = m.eyes(pos), e = new THREE.Vector3(); let n = 0;
      for (let i = 0; i < ep.length; i += 3) if (ep[i] > 0) { e.x += ep[i]; e.y += ep[i + 1]; e.z += ep[i + 2]; n++; }
      e.multiplyScalar(1 / (n || 1));
      let ex = 0; for (let i = 0; i < body.length; i += 7) { const o = m.rmap[body[i]] * 3; if (Math.abs(surf[o + 1] - (e.y - 0.25)) < 0.12 && surf[o + 2] < e.z - 0.3) ex = Math.max(ex, Math.abs(surf[o])); }
      return { eye: e, earX: ex || 0.7 };
    })(),
    ankleZ: an[2], ...(() => {   // the left foot, from its skin below the ankle
      let z0 = 1e9, z1 = -1e9, xs = 0, n = 0; const b = m.groups.body;
      for (let i = 0; i < b.length; i += 3) { const o = m.rmap[b[i]] * 3; if (surf[o + 1] > an[1] - 0.15 || surf[o] <= 0) continue; z0 = Math.min(z0, surf[o + 2]); z1 = Math.max(z1, surf[o + 2]); xs += surf[o]; n++; }
      return { heelZ: z0, toeZ: z1, footX: n ? xs / n : 0.8 };
    })(),
  };
}

/** How much a point on the head is scalp (1) vs face/skin (0), with a soft hairline. */
export function scalpWeight(k: Marks, x: number, y: number, z: number): number {
  const depth = (k.headFront - k.headBack) * 0.78, H = k.headTop - k.chinY;
  const f = Math.min(1, (z - k.headBack) / depth);   // 0 back .. 1 forehead
  // the hairline: across the forehead, down past the temples to just in front of the ears, round behind them to the nape
  // (k.chinY is the bottom of the head above its joint, about nose level; the nape is well below it at the back)
  if (y < k.chinY - 0.75 || z > k.headFront - 0.25 && y < k.chinY + H * 0.6) return 0;   // below the nape, or the face
  const tx = Math.max(0, Math.min(1, (Math.abs(x) / k.headR - 0.45) / 0.35)), temple = tx * tx * (3 - 2 * tx) * H * 0.2;   // the hairline curves down at the temples
  const line = f > 0.75 ? k.chinY + H * (0.66 + (f - 0.75) * 0.3) - temple : f > 0.4 ? k.chinY + H * (0.33 + (f - 0.4) * 0.94) : k.chinY - 0.55 + (f / 0.4) * (H * 0.33 + 0.55);
  if (Math.abs(x) > k.headR * 0.82 && y < k.chinY + H * 0.52 && f > 0.38 && f < 0.78) return 0;   // the ears themselves
  return Math.max(0, Math.min(1, (y - line) / 0.12 + 0.5));
}

// ─── Garments ──────────────────────────────────────────────────────
/** arm: how far down the arm a sleeve reaches (0 = shoulder, 1 = elbow, 2 = wrist); measured along the arm, not sideways. */
export type Cut = {
  y0?: number; y1?: number; x1?: number; arm?: number; ease: number; flare?: number; dropFrom?: number; source: 'tights' | 'skirt'; smooth?: number;
  scoop?: number; x0?: number; z0?: number; pleats?: number;
  /** pleat count round the skirt (default 9) and whether they're crisp knife pleats rather than soft folds */
  pleatN?: number; sharp?: boolean;
  /** wide legs: free to hang and swing below this height */ hang?: number;
  /** any other edge, as a signed distance (<= 0 is inside): a V-neck, an open front, a shoe's opening, sandal straps */
  clip?: (x: number, y: number, z: number) => number;
  /** extra room at a point, on top of the ease: puff sleeves, wide legs, quilting, a pocket */
  bulge?: (x: number, y: number, z: number, nx: number, nz: number, armT: number) => number;
};
export interface PieceSpec { cuts: Cut[]; color: string; pattern?: string; color2?: string; rough?: number; sheen?: number; folds?: Folds; hem?: number; extra?: 'sneaker' | 'boot' | 'hood'; wear?: WearableKind; photo?: number; photoFront?: boolean;   // photo: which closet photo dresses it
  /** clearcoat (leather, satin shine) */ coat?: number;
  /** what it's made of (default: guessed, see fabricOf) */ fabric?: Fabric;
  /** printed-on details: seams, buttons, pockets, a zip (see DETAIL) */ detail?: Detail;
  /** solid parts: collar, lapels, belt, bow, roll neck */ extras?: Extra[];
  /** shoes: sole thickness, heel height (dm) and kind */ sole?: { h: number; heel?: number; post?: 'stiletto' | 'block'; laces?: boolean };
}
/** Details drawn on a garment in its shader, by flag; positions in dm on the body at rest. */
export const DETAIL = { sideSeam: 1, placket: 2, double: 4, zip: 8, quilt: 16, yoke: 32, chestPockets: 64, rib: 128, wrap: 256, boning: 512, cargo: 1024, backPockets: 2048, waistband: 4096 } as const;
export interface Detail {
  f: number; color?: string;
  /** buttons/placket/zip: top y, bottom y, spacing, x */ a?: [number, number, number, number];
  /** yoke y, chest-pocket top y, rib band top y, cargo pocket top y */ b?: [number, number, number, number];
  /** back-pocket top y, waistband y */ c?: [number, number, number, number];
}
export type Extra = { kind: 'collar' | 'lapels' | 'turtle' | 'puffcollar' | 'neckband' | 'belt' | 'bow'; off: number; breakY?: number; wide?: number; color?: string };

/**
 * Build one garment (several cut pieces of the shells) as skinned geometry sharing the body's skeleton.
 * Fabric doesn't follow every dip of the body, so each piece is smoothed (it bridges hollows, like cloth does),
 * kept at least a little off the skin, and given a folded-under hem so its edges have thickness.
 */
export function garmentGeometry(m: BodyModel, pos: Float32Array, nrm: Float32Array, cuts: Cut[], k?: Marks, hem = 0.035): THREE.BufferGeometry | null {
  const P: number[] = [], FP: number[] = [], OFF: number[] = [], DIR: number[] = [], UV: number[] = [], SI: number[] = [], SW: number[] = [], I: number[] = [], PIN: number[] = [];
  for (const c of cuts) {
    const src = m.groups[c.source];
    // distance down the arm (in arm units: 1 = elbow, 2 = wrist), for points out past the shoulder
    const armT = (x: number, y: number): number => {
      if (!k || x < k.shoulderJ.x - 0.15 || y < k.armpitY - 0.9 && x < k.elbowJ.x - 0.2) return -1;   // the hips aren't the arm
      const up = new THREE.Vector2(k.elbowJ.x - k.shoulderJ.x, k.elbowJ.y - k.shoulderJ.y), lo = new THREE.Vector2(k.wristJ.x - k.elbowJ.x, k.wristJ.y - k.elbowJ.y);
      const t1 = ((x - k.shoulderJ.x) * up.x + (y - k.shoulderJ.y) * up.y) / up.lengthSq();
      if (t1 <= 1) return t1;
      return 1 + ((x - k.elbowJ.x) * lo.x + (y - k.elbowJ.y) * lo.y) / lo.lengthSq();
    };
    // how far outside the cut a point is (<= 0 inside); the neckline scoops lower at the front
    const out = (x: number, y: number, z: number) => {
      const sx = x; x = Math.abs(x);
      const top = c.y1 === undefined ? Infinity : c.y1 - (c.scoop ?? 0) * Math.max(0, Math.min(1, (z - 0.1) / 0.9)) ** 1.5 * Math.max(0, 1 - (x / 0.75) ** 2);
      return Math.max(c.y0 === undefined ? -1 : c.y0 - y, top === Infinity ? -1 : y - top, c.x1 === undefined ? -1 : x - c.x1, c.x0 === undefined ? -1 : c.x0 - x, c.z0 === undefined ? -1 : (c.z0 - z) * 3, c.arm === undefined ? -1 : (armT(x, y) - c.arm) * 1.5, c.clip ? c.clip(sx, y, z) : -1,
        // sleeveless: leave out the web the shell stretches under a raised arm (it would stick out once the arm is down)
        k && c.arm !== undefined && c.arm < 0.1 && y > k.armpitY - 0.6 && y < k.armpitY + 0.6 ? x - (k.shoulderX - 0.42) : -1);
    };
    const inside = (v: number) => out(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]) <= 0;
    // the piece's triangles and vertices (one per surface vertex: no splits at the shell's UV seams)
    const map = new Map<number, number>(), sv: number[] = [], tris: number[] = [];
    for (let t = 0; t < src.length; t += 3) {
      const tri = [m.rmap[src[t]], m.rmap[src[t + 1]], m.rmap[src[t + 2]]];
      if (!tri.some(inside)) continue;
      for (const v of tri) { if (!map.has(v)) { map.set(v, sv.length); sv.push(v); } tris.push(map.get(v)!); }
    }
    const n = sv.length; if (!n) continue;
    const X = new Float32Array(n * 3), N0 = new Float32Array(n * 3), B0 = new Float32Array(n * 3), nearV = new Uint32Array(n);
    // arm or body: by the shell's own rig, but only out past the side of the chest (the shell rigs the web under a
    // raised arm to the arm, and cloth anchored there would swing out with it as a loose flap)
    const armBone = m.bones.map(bn => ARM.test(bn.name));
    const cls = sv.map(v => (armBone[m.skinIndex[v * 4]] && (!k || Math.abs(pos[v * 3]) > k.shoulderX - 0.2 || pos[v * 3 + 1] > k.armpitY + 0.35) ? 1 : 2));
    // vertices outside the cut move onto it, along the mesh edge towards their nearest inside neighbour, so the
    // hem is a clean line on the body
    const fo = sv.map(v => out(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2])), inn: number[][] = sv.map(() => []);
    for (let t = 0; t < tris.length; t += 3) for (let e = 0; e < 3; e++) for (let f = 0; f < 3; f++) if (e !== f && fo[tris[t + e]] > 0 && fo[tris[t + f]] <= 0) inn[tris[t + e]].push(tris[t + f]);
    sv.forEach((v, i) => {
      let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], nx = nrm[v * 3], ny = nrm[v * 3 + 1], nz = nrm[v * 3 + 2];
      if (fo[i] > 0 && inn[i].length) {
        let bx = 0, by = 0, bz = 0, bnx = 0, bny = 0, bnz = 0;
        for (const j of inn[i]) {
          const u = sv[j], t = fo[j] / (fo[j] - fo[i]);
          bx += pos[u * 3] + (x - pos[u * 3]) * t; by += pos[u * 3 + 1] + (y - pos[u * 3 + 1]) * t; bz += pos[u * 3 + 2] + (z - pos[u * 3 + 2]) * t;
          bnx += nrm[u * 3]; bny += nrm[u * 3 + 1]; bnz += nrm[u * 3 + 2];
        }
        const q = inn[i].length, l = Math.hypot(bnx + nx, bny + ny, bnz + nz) || 1;
        x = bx / q; y = by / q; z = bz / q; nx = (bnx + nx) / l; ny = (bny + ny) / l; nz = (bnz + nz) / l;
      }
      // the shells float a little off the skin (a lot at the shoulders): bring the point down onto the body's
      // surface, so the cloth is laid on her skin and moves exactly with it
      const b = nearestBody(m, pos, x, y, z, cls[i]), bnx = nrm[b * 3], bny = nrm[b * 3 + 1], bnz = nrm[b * 3 + 2];
      const h = (x - pos[b * 3]) * bnx + (y - pos[b * 3 + 1]) * bny + (z - pos[b * 3 + 2]) * bnz;
      x -= bnx * h; y -= bny * h; z -= bnz * h; nx = bnx; ny = bny; nz = bnz; nearV[i] = b;
      B0.set([x, y, z], i * 3); N0.set([nx, ny, nz], i * 3);
      const e = c.ease + (c.bulge ? c.bulge(x, y, z, nx, nz, armT(Math.abs(x), y)) : 0);
      x += nx * e; y += ny * e * 0.5; z += nz * e;
      if (c.flare && c.dropFrom !== undefined && y < c.dropFrom) {
        // the skirt swings out below the hips, falling in soft folds (more of them lower down)
        const ang = Math.atan2(x, z - 0.2), fall = c.dropFrom - y, ph = ang * (c.pleatN ?? 9) + (c.sharp ? 0 : Math.sin(ang * 3) * 1.5);
        const wv = c.sharp ? 1 - 2 * Math.abs(((ph / Math.PI / 2) % 1 + 1) % 1 - 0.5) * 2 : Math.sin(ph);   // sawtooth for knife pleats
        const wave = c.pleats ? 1 + c.pleats * wv * Math.min(1, fall / 2) : 1;
        const kk = fall * c.flare * wave, r0 = Math.hypot(x, z - 0.2) || 1;
        x += (x / r0) * kk; z += ((z - 0.2) / r0) * kk;
      }
      X.set([x, y, z], i * 3);
    });
    // neighbours and the open edges (the hems)
    const nb: Set<number>[] = Array.from({ length: n }, () => new Set()), edges = new Map<number, number>();
    for (let t = 0; t < tris.length; t += 3) for (let e = 0; e < 3; e++) {
      const a = tris[t + e], b = tris[t + (e + 1) % 3]; nb[a].add(b); nb[b].add(a);
      const key = Math.min(a, b) * n + Math.max(a, b); edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    const onEdge = new Uint8Array(n);
    for (const [key, cnt] of edges) if (cnt === 1) { onEdge[Math.floor(key / n)] = 1; onEdge[key % n] = 1; }
    // shrink-wrap: smooth the piece (it pulls taut across hollows) while the body keeps pushing it back out to
    // at least a fraction of the ease from the skin, so it rests on the high points like real fabric
    const it = c.smooth ?? 6, tmp = new Float32Array(n * 3), minOff = Math.max(0.025, c.ease * 0.6);
    const keepOut = () => {
      for (let i = 0; i < n; i++) {
        const d = (X[i * 3] - B0[i * 3]) * N0[i * 3] + (X[i * 3 + 1] - B0[i * 3 + 1]) * N0[i * 3 + 1] + (X[i * 3 + 2] - B0[i * 3 + 2]) * N0[i * 3 + 2];
        if (d < minOff) for (let q = 0; q < 3; q++) X[i * 3 + q] += N0[i * 3 + q] * (minOff - d);
      }
    };
    // under the arms the shell bridges arm and side in the rest pose; smoothing there would bunch up once the arms come down
    const sw = new Float32Array(n).fill(0.5);
    if (k) for (let i = 0; i < n; i++) {
      const ax = Math.abs(B0[i * 3]), ay = B0[i * 3 + 1];
      const near = Math.max(0, 1 - Math.hypot((ax - k.shoulderX) / 0.7, (ay - k.armpitY) / 0.7));
      // over the shoulders and up to the neck the fabric lies on the body (smoothing there flattens the slope into a box)
      const up = Math.max(0, Math.min(1, (ay - (k.armpitY - 0.3)) / 0.5));
      sw[i] = 0.5 * (1 - near) * (1 - 0.85 * up);
    }
    for (let s2 = 0; s2 < it; s2++) {
      for (let i = 0; i < n; i++) {
        let cx = 0, cy = 0, cz = 0, cnt = 0;
        for (const j of nb[i]) { if (onEdge[i] && !onEdge[j]) continue; cx += X[j * 3]; cy += X[j * 3 + 1]; cz += X[j * 3 + 2]; cnt++; }
        if (!cnt) { tmp.set(X.subarray(i * 3, i * 3 + 3), i * 3); continue; }
        const a = sw[i]; tmp[i * 3] = X[i * 3] + a * (cx / cnt - X[i * 3]); tmp[i * 3 + 1] = X[i * 3 + 1] + (onEdge[i] ? 0 : a * (cy / cnt - X[i * 3 + 1])); tmp[i * 3 + 2] = X[i * 3 + 2] + a * (cz / cnt - X[i * 3 + 2]);
      }
      X.set(tmp);
      if (s2 % 3 === 2) keepOut();
    }
    keepOut();
    // smoothing slid points along the body: anchor each one again to the skin that is now under it (its weights
    // and normal), so the posed cloth sits on the posed body
    for (let i = 0; i < n; i++) {
      const x = X[i * 3], y = X[i * 3 + 1], z = X[i * 3 + 2], b = nearestBody(m, pos, x, y, z, cls[i]);
      const bx = nrm[b * 3], by = nrm[b * 3 + 1], bz = nrm[b * 3 + 2], h = (x - pos[b * 3]) * bx + (y - pos[b * 3 + 1]) * by + (z - pos[b * 3 + 2]) * bz;
      // points far to the side of their skin point (the web under the raised arm) come in to it, or they'd float
      // where the arm was and stick out as a flap once it comes down
      let tx = x - bx * h - pos[b * 3], ty = y - by * h - pos[b * 3 + 1], tz = z - bz * h - pos[b * 3 + 2];
      const under = k ? Math.abs(Math.abs(x) - k.shoulderX) < 0.6 && y < k.armpitY + 0.2 && y > k.armpitY - 1.2 : false;
      const tl = Math.hypot(tx, ty, tz), lim = under ? 0.07 : Infinity, hmax = under ? c.ease + 0.04 : Infinity, hc = Math.min(h, hmax);
      if (tl > lim) { const f = lim / tl; tx *= f; ty *= f; tz *= f; }
      B0[i * 3] = pos[b * 3] + tx; B0[i * 3 + 1] = pos[b * 3 + 1] + ty; B0[i * 3 + 2] = pos[b * 3 + 2] + tz; N0[i * 3] = bx; N0[i * 3 + 1] = by; N0[i * 3 + 2] = bz; nearV[i] = b;
      if (tl > lim || hc < h) { X[i * 3] = B0[i * 3] + bx * hc; X[i * 3 + 1] = B0[i * 3 + 1] + by * hc; X[i * 3 + 2] = B0[i * 3 + 2] + bz * hc; }
    }
    const base = P.length / 3;
    const push = (x: number, y: number, z: number, v: number, i: number) => {
      // the distance off the skin is stored apart from the position and re-applied after skinning, along the
      // posed body normal, so the cloth keeps its thickness when she moves (instead of puffing up at the shoulders)
      // (capped: a swinging skirt keeps most of its distance in its shape, so shading passes that don't know about
      // this shift still line up with it)
      const d = Math.min(0.15, (x - B0[i * 3]) * N0[i * 3] + (y - B0[i * 3 + 1]) * N0[i * 3 + 1] + (z - B0[i * 3 + 2]) * N0[i * 3 + 2]);
      P.push(x - N0[i * 3] * d, y - N0[i * 3 + 1] * d, z - N0[i * 3 + 2] * d); OFF.push(d); DIR.push(N0[i * 3], N0[i * 3 + 1], N0[i * 3 + 2]);
      FP.push(x, y, z); UV.push(...clothUV(x, y, z, cls[i] === 1, c.source === 'tights' && !c.flare ? k : undefined, k));
      for (let q = 0; q < 4; q++) { SI.push(wts[i][q * 2]); SW.push(wts[i][q * 2 + 1]); }
      // how firmly it's held by the body (1) or free to hang and swing (0): skirts are free below the hips
      PIN.push(cls[i] === 1 ? 1 : c.hang !== undefined ? ss01(c.hang - 0.9, c.hang, B0[i * 3 + 1]) * 0.85 + 0.15 * ss01(k ? k.ankleY - 0.5 : -99, k ? k.ankleY + 0.3 : -98, B0[i * 3 + 1])
        : !c.flare || c.flare <= 0.1 || c.dropFrom === undefined ? 1 : ss01(c.dropFrom - 0.9, c.dropFrom + 0.05, B0[i * 3 + 1]));   // fitted skirts hug her, only loose ones hang
    };
    // skin weights: from the nearest body point, then smoothed over the cloth round the armpit, where sleeve and
    // side meet (the arm and the body move differently there, and a hard change would tear a flap out of the cloth)
    // trousers and skirts don't bend with the feet (in heels the feet point down): below the ankle they follow the shins
    const shoe = k ? (c.y1 ?? 99) < k.kneeY - 0.2 : false;
    const footB = m.bones.map(b => /^(foot|toe)/.test(b.name)), shin = { L: m.boneIndex('lowerleg02.L'), R: m.boneIndex('lowerleg02.R') };
    const wts = sv.map((_, i) => {
      const v = nearV[i], o: number[] = [];
      if (!shoe && footB[m.skinIndex[v * 4]]) return [B0[i * 3] > 0 ? shin.L : shin.R, 1, 0, 0, 0, 0, 0, 0];
      for (let q = 0; q < 4; q++) o.push(m.skinIndex[v * 4 + q], m.skinWeight[v * 4 + q]);
      return o;
    });
    if (k) {
      const zone = sv.map((_, i) => { const ax = Math.abs(B0[i * 3]), y = B0[i * 3 + 1]; return Math.max(0, 1 - Math.hypot((ax - (k.shoulderX - 0.15)) / 0.75, (y - (k.armpitY - 0.1)) / 0.7)); });
      let cur = wts.map(o => { const mp = new Map<number, number>(); for (let q = 0; q < 4; q++) if (o[q * 2 + 1] > 0) mp.set(o[q * 2], o[q * 2 + 1]); return mp; });
      for (let it = 0; it < 24; it++) {
        cur = cur.map((mp, i) => {
          if (zone[i] <= 0) return mp;
          const acc = new Map<number, number>(); let cnt = 0;
          for (const j of nb[i]) { cnt++; for (const [b, wv] of cur[j]) acc.set(b, (acc.get(b) ?? 0) + wv); }
          if (!cnt) return mp;
          const a = 0.6 * zone[i], out = new Map<number, number>();
          for (const [b, wv] of mp) out.set(b, wv * (1 - a));
          for (const [b, wv] of acc) out.set(b, (out.get(b) ?? 0) + wv / cnt * a);
          return out;
        });
      }
      cur.forEach((mp, i) => {
        const top = [...mp].sort((x, y) => y[1] - x[1]).slice(0, 4), sum = top.reduce((a2, t) => a2 + t[1], 0) || 1, o: number[] = [];
        for (let q = 0; q < 4; q++) o.push(top[q]?.[0] ?? 0, (top[q]?.[1] ?? 0) / sum);
        wts[i] = o;
      });
    }
    // skin weights from the nearest point of the body itself (the shells' own weights lag behind at the shoulders)
    const near = Array.from(nearV);
    for (let i = 0; i < n; i++) push(X[i * 3], X[i * 3 + 1], X[i * 3 + 2], near[i], i);
    // the shells web the armpit between arm and side (the arms are raised at rest); once the arms come down that
    // web would stick out as a flap, so the triangles that span arm and side under the arm are left out
    const armB = m.bones.map(b => /upperarm|lowerarm|shoulder01/.test(b.name));
    const keep = new Uint8Array(tris.length / 3).fill(1);
    if (k) for (let t = 0; t < tris.length; t += 3) {
      const tv = [tris[t], tris[t + 1], tris[t + 2]], arms = tv.filter(i => armB[m.skinIndex[nearV[i] * 4]]).length;
      if (arms === 0 || arms === 3) continue;
      const ax = Math.abs(B0[tv[0] * 3]), ay = B0[tv[0] * 3 + 1];
      if (ay < k.armpitY + 0.05 && ay > k.armpitY - 0.9 && Math.abs(ax - k.shoulderX) < 0.45) keep[t / 3] = 0;   // under the arm only
    }
    // drop small loose islands of cloth (left where cuts meet the web under the arm)
    {
      const comp = new Int32Array(n).fill(-1), size: number[] = [], adj: number[][] = Array.from({ length: n }, () => []);
      for (let t = 0; t < tris.length; t += 3) if (keep[t / 3]) for (let e = 0; e < 3; e++) adj[tris[t + e]].push(tris[t + (e + 1) % 3], tris[t + (e + 2) % 3]);
      for (let i = 0; i < n; i++) {
        if (comp[i] >= 0 || !adj[i].length) continue;
        const id = size.length, st = [i]; comp[i] = id; let cnt = 0;
        while (st.length) { const a = st.pop()!; cnt++; for (const b of adj[a]) if (comp[b] < 0) { comp[b] = id; st.push(b); } }
        size.push(cnt);
      }
      const biggest = Math.max(0, ...size);
      for (let t = 0; t < tris.length; t += 3) if (keep[t / 3] && size[comp[tris[t]]] < Math.max(30, biggest * 0.06)) keep[t / 3] = 0;
    }
    for (let t = 0; t < tris.length; t += 3) if (keep[t / 3]) I.push(base + tris[t], base + tris[t + 1], base + tris[t + 2]);
    // hems: the edge folds under, towards the body and back up inside
    if (hem > 0) {
      const inner = new Map<number, number>();
      const innerOf = (i: number) => {
        let r = inner.get(i);
        if (r === undefined) {
          r = P.length / 3; inner.set(i, r);
          // a real hem: the cloth turns at the edge and runs back up inside, a fabric's thickness in from the
          // outside (not a ledge sticking in towards her, which looked like a funnel from below)
          let ix = 0, iy = 0, iz = 0, cn = 0;
          for (const j of nb[i]) if (!onEdge[j]) { ix += X[j * 3] - X[i * 3]; iy += X[j * 3 + 1] - X[i * 3 + 1]; iz += X[j * 3 + 2] - X[i * 3 + 2]; cn++; }
          const il = Math.hypot(ix, iy, iz) || 1, th = Math.min(0.018, hem * 0.4);
          if (!cn) { ix = 0; iy = 1; iz = 0; }
          push(X[i * 3] + ix / il * hem - N0[i * 3] * th, X[i * 3 + 1] + iy / il * hem - N0[i * 3 + 1] * th, X[i * 3 + 2] + iz / il * hem - N0[i * 3 + 2] * th, near[i], i);
        }
        return r;
      };
      for (let t = 0; t < tris.length; t += 3) for (let e = 0; e < 3; e++) {
        const a = tris[t + e], b = tris[t + (e + 1) % 3];
        if (!keep[t / 3] || edges.get(Math.min(a, b) * n + Math.max(a, b)) !== 1) continue;
        // no fold-under at short-sleeve openings: squeezed by the lowered arm it pokes out under the arm
        if (c.arm !== undefined && c.arm < 1.5 && (cls[a] === 1 || cls[b] === 1)) continue;
        const ia = innerOf(a), ib = innerOf(b);
        I.push(base + b, base + a, ia, base + b, ia, ib);
      }
    }
  }
  if (!I.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(FP, 3));   // normals from the finished shape
  g.setIndex(I); g.computeVertexNormals();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('clothOff', new THREE.Float32BufferAttribute(OFF, 1)); g.setAttribute('clothDir', new THREE.Float32BufferAttribute(DIR, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
  g.setAttribute('clothRest', new THREE.Float32BufferAttribute(FP, 3));
  g.setAttribute('clothPin', new THREE.Float32BufferAttribute(PIN, 1));
  g.userData.drape = PIN.some(p => p < 0.99);
  g.userData.memory = cuts.some(c => c.sharp) ? 0.06 : 0.004;   // knife pleats keep their creases
  // the front of the garment, as seen from in front (where a photo of it is laid on)
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < FP.length / 3; i++) if (DIR[i * 3 + 2] > 0.2) { x0 = Math.min(x0, FP[i * 3]); x1 = Math.max(x1, FP[i * 3]); y0 = Math.min(y0, FP[i * 3 + 1]); y1 = Math.max(y1, FP[i * 3 + 1]); }
  g.userData.front = x1 > x0 ? [x0, y0, x1 - x0, y1 - y0] : [0, 0, 1, 1];
  { let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
    for (let i = 0; i < FP.length / 3; i++) if (DIR[i * 3 + 2] < -0.2) { a0 = Math.min(a0, FP[i * 3]); a1 = Math.max(a1, FP[i * 3]); b0 = Math.min(b0, FP[i * 3 + 1]); b1 = Math.max(b1, FP[i * 3 + 1]); }
    g.userData.back = a1 > a0 ? [a0, b0, a1 - a0, b1 - b0] : g.userData.front; }
  return g;
}

const ss01 = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Texture coordinates that wrap round her like real cloth: distance round the body (or round the leg or arm) by
 * distance along it, both in true size (1 unit = 2 dm), so a weave or a print keeps its scale on the sides too.
 */
function clothUV(x: number, y: number, z: number, arm: boolean, k: Marks | undefined, km = k): [number, number] {   // k: legs wrap round each leg (not for skirts)
  if (arm && km) {
    const k = km;   // round the arm and down it
    const ax = Math.abs(x), dx = k.wristJ.x - k.shoulderJ.x, dy = k.wristJ.y - k.shoulderJ.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const along = (ax - k.shoulderJ.x) * ux + (y - k.shoulderJ.y) * uy, side = -(ax - k.shoulderJ.x) * uy + (y - k.shoulderJ.y) * ux;
    const a = Math.atan2(side, z - k.shoulderJ.z) * 0.32;
    return [a * 0.5 + (x < 0 ? 7 : 3), along * 0.5];
  }
  const leg = k && y < k.crotchY ? Math.sign(x) * Math.max(0.45, k.footX) : 0, r = Math.max(0.3, Math.hypot(x - leg, z - 0.15));
  return [Math.atan2(x - leg, z - 0.15) * r * 0.5 + (leg > 0 ? 11 : leg < 0 ? 15 : 0), y * 0.5];
}

/**
 * Nearest body-skin surface vertex to a point (a coarse grid over the body, built once per shape). cls limits it to
 * arm skin (1) or the rest (2): a sleeve's underside must follow the arm even where her side is closer at rest.
 */
const ARM = /upperarm|lowerarm|shoulder01|wrist|finger|metacarpal/;
const grids = new WeakMap<Float32Array, { cell: number; map: Map<string, number[]> }>();
function nearestBody(m: BodyModel, pos: Float32Array, x: number, y: number, z: number, cls = 0): number {
  let G = grids.get(pos);
  if (!G) {
    G = { cell: 0.2, map: new Map() };
    const seen = new Uint8Array(m.ns), b = m.groups.body, arm = m.bones.map(bn => ARM.test(bn.name));
    for (let i = 0; i < b.length; i++) {
      const v = m.rmap[b[i]]; if (seen[v]) continue; seen[v] = 1;
      const cell = `${Math.floor(pos[v * 3] / G.cell)},${Math.floor(pos[v * 3 + 1] / G.cell)},${Math.floor(pos[v * 3 + 2] / G.cell)}`;
      for (const key of ['0:' + cell, (arm[m.skinIndex[v * 4]] ? '1:' : '2:') + cell]) (G.map.get(key) ?? G.map.set(key, []).get(key)!).push(v);
    }
    grids.set(pos, G);
  }
  const cx = Math.floor(x / G.cell), cy = Math.floor(y / G.cell), cz = Math.floor(z / G.cell);
  let best = -1, bd = Infinity;
  for (let r = 1; r <= 12 && best < 0; r++)
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let q = -r; q <= r; q++) {
      for (const v of G.map.get(`${cls}:${cx + i},${cy + j},${cz + q}`) ?? []) {
        const d = (pos[v * 3] - x) ** 2 + (pos[v * 3 + 1] - y) ** 2 + (pos[v * 3 + 2] - z) ** 2;
        if (d < bd) { bd = d; best = v; }
      }
    }
  return best < 0 ? (cls ? nearestBody(m, pos, x, y, z, 0) : 0) : best;
}

/** The test outfits. Each is a list of pieces; numbers come from her body landmarks. */
export function outfits(k: Marks): { id: string; name: string; pieces: PieceSpec[] }[] {
  // sneakers: a leather upper round the foot, on a thick rubber sole with laces (see accessories())
  const shoe = (color: string, sole = '#f4f1ea'): PieceSpec => ({ cuts: [{ y1: k.ankleY + 0.42, ease: 0.11, source: 'tights', smooth: 10 }], color, color2: sole, rough: 0.5, folds: 'leather', hem: 0.04, extra: 'sneaker' });
  return [
    { id: 'tee-jeans', name: 'T-shirt and jeans', pieces: [
      { cuts: [{ y0: k.crotchY + 0.75, y1: k.neckY - 0.2, scoop: 0.35, arm: 0.38, ease: 0.13, source: 'tights', smooth: 14 }], color: '#eeeae2', rough: 0.9, sheen: 0.6, folds: 'tee' },
      { cuts: [{ y0: k.ankleY + 0.15, y1: k.waistY - 0.35, ease: 0.07, source: 'tights', smooth: 30 }], color: '#3a5f8f', pattern: 'denim', rough: 0.85, folds: 'jeans', hem: 0.05 },
      shoe('#f6f6f6'),
    ] },
    { id: 'sundress', name: 'Sundress', pieces: [
      { cuts: [{ y0: k.waistY - 0.3, y1: k.armpitY + 0.15, scoop: 0.25, arm: -0.05, ease: 0.06, source: 'tights', smooth: 8 },
        { y0: k.armpitY - 0.2, y1: k.neckY + 0.6, x0: k.shoulderX * 0.42, x1: k.shoulderX * 0.6, arm: -0.05, ease: 0.04, source: 'tights', smooth: 2 },     // straps
        { y0: k.kneeY - 0.7, ease: 0.06, flare: 0.3, pleats: 0.45, dropFrom: k.hipY, source: 'skirt', smooth: 3 }], color: '#f6d35b', pattern: 'floral', color2: '#e86a2c', rough: 0.8, sheen: 0.5, folds: 'drape' },
      shoe('#c9a27e', '#8a5a36'),
    ] },
    { id: 'hoodie-leggings', name: 'Hoodie and leggings', pieces: [
      { cuts: [{ y0: k.crotchY + 0.55, y1: k.neckY + 0.05, arm: 1.92, ease: 0.22, source: 'tights', smooth: 14 }], color: '#9cc9ec', rough: 0.95, sheen: 0.8, folds: 'knit', hem: 0.06, extra: 'hood' },
      // the front pocket: a patch over the tummy, a little proud of the hoodie
      { cuts: [{ y0: k.crotchY + 0.85, y1: k.waistY - 0.05, x1: k.shoulderX * 0.62, z0: 0.35, ease: 0.27, source: 'tights', smooth: 14 }], color: '#93c1e4', rough: 0.95, sheen: 0.8, folds: 'knit', hem: 0.03 },
      { cuts: [{ y0: k.ankleY + 0.1, y1: k.waistY - 0.2, ease: 0.03, source: 'tights', smooth: 3 }], color: '#151515', rough: 0.6, sheen: 0.3, folds: 'tee', hem: 0.02 },
      shoe('#ffffff'),
    ] },
    { id: 'crop-skirt', name: 'Crop top and skirt', pieces: [
      { cuts: [{ y0: k.underbustY - 0.25, y1: k.neckY - 0.25, scoop: 0.3, arm: 0.12, ease: 0.06, source: 'tights', smooth: 6 }], color: '#111111', rough: 0.7, sheen: 0.4, folds: 'tee' },
      { cuts: [{ y0: k.kneeY + 1.2, ease: 0.07, flare: 0.2, pleats: 0.3, dropFrom: k.hipY, source: 'skirt', smooth: 4 }], color: '#2a3a6a', pattern: 'check', color2: '#f4f1ea', rough: 0.85, folds: 'drape' },
      shoe('#141414', '#141414'),
    ] },
  ];
}

/**
 * Her own clothes in 3D: each closet piece (by its 3D shape) as a generic garment, dressed in her photo.
 * Slots she isn't wearing anything in show her underwear (and bare feet).
 */
export function closetPieces(k: Marks, wear: { shape: Shape3D; color: string; color2?: string; pattern?: string; photo?: number }[], basics: string): PieceSpec[] {
  const SPEC = garmentSpecs(k);
  const out: PieceSpec[] = [];
  const slots = new Set(wear.map(w => slotOf(w.shape)));
  const under = underwear(k, basics);
  if (!slots.has('top') && !slots.has('dress')) out.push(under[0]);
  if (!slots.has('bottom') && !slots.has('dress')) out.push(under[1]);
  // under-layers first, so a jacket's ease is measured over the top beneath it
  const order: Slot3D[] = ['bottom', 'dress', 'top', 'outer', 'shoes', 'belt', 'neck', 'bag', 'ears', 'glasses', 'hat'];
  for (const w of [...wear].sort((a, b) => order.indexOf(slotOf(a.shape)) - order.indexOf(slotOf(b.shape)))) {
    for (const p of SPEC[w.shape] ?? SPEC.tee) {
      // shoes: color2 is the sole (a darker shade of the shoe unless it's a trainer); elsewhere the pattern's second colour
      const sl = slotOf(w.shape), shoes = sl === 'shoes', small = !['top', 'bottom', 'dress', 'outer', 'shoes'].includes(sl), col2 = shoes ? (p.color2 ?? shade(w.color, 0.55)) : w.color2 ?? p.color2;
      // a pattern only where she chose one (a photo has its own); denim and knit garments keep their weave
      const pattern = w.photo !== undefined ? undefined : w.pattern ?? p.pattern;
      out.push({ ...(p as PieceSpec), color: w.color, color2: col2, pattern, photo: small ? undefined : w.photo, photoFront: !shoes });
    }
  }
  return out;
}
const shade = (hex: string, k: number) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');

/** Plain underwear in her basics colour: a soft bandeau bra and briefs. */
export function underwear(k: Marks, color: string): PieceSpec[] {
  return [
    { cuts: [{ y0: k.underbustY - 0.2, y1: k.bustY + 0.42, x1: k.shoulderX * 0.78, ease: 0.025, source: 'tights', smooth: 10 }], color, rough: 0.6, sheen: 0.6, folds: 'tee', hem: 0.015 },
    { cuts: [{ y0: k.crotchY - 0.18, y1: k.waistY - 0.5, ease: 0.02, source: 'tights', smooth: 8 }], color, rough: 0.6, sheen: 0.6, folds: 'tee', hem: 0.015 },
  ];
}

// ─── Fold detail (normal maps; v runs up the body, 1 unit = 2 dm) ──────
export type Folds = 'tee' | 'jeans' | 'knit' | 'drape' | 'leather';
/** What a garment is made of: sets its weave (fine surface texture), roughness and sheen. */
export type Fabric = 'jersey' | 'denim' | 'twill' | 'knit' | 'satin' | 'leather' | 'nylon' | 'woven';
/** The fabric a piece is made of, from what it says it is (or a best guess from how it's set up). */
export function fabricOf(p: PieceSpec): Fabric {
  if (p.fabric) return p.fabric;
  if (p.pattern === 'denim') return 'denim';
  if (p.folds === 'knit' || p.pattern === 'knit') return 'knit';
  if (p.folds === 'leather') return 'leather';
  if ((p.sheen ?? 0) >= 1 && (p.coat ?? 0) > 0) return 'satin';
  if (p.extra === undefined && (p.detail?.f ?? 0) & DETAIL.quilt) return 'nylon';
  if (p.folds === 'jeans') return 'twill';
  if (p.folds === 'drape') return 'woven';
  return 'jersey';
}
/** How each fabric catches the light. */
export const FABRIC_LOOK: Record<Fabric, { rough: number; sheen: number; sheenRough: number; normal: number; spec?: number }> = {
  jersey: { rough: 0.9, sheen: 0.55, sheenRough: 0.6, normal: 0.55 }, denim: { rough: 0.95, sheen: 0.35, sheenRough: 0.75, normal: 0.85 },
  twill: { rough: 0.85, sheen: 0.35, sheenRough: 0.7, normal: 0.7 }, knit: { rough: 0.97, sheen: 0.9, sheenRough: 0.85, normal: 1.0 },
  satin: { rough: 0.25, sheen: 0.9, sheenRough: 0.3, normal: 0.25 }, leather: { rough: 0.38, sheen: 0.1, sheenRough: 0.5, normal: 0.5 },
  nylon: { rough: 0.78, sheen: 0.2, sheenRough: 0.6, normal: 1.1, spec: 0.3 }, woven: { rough: 0.82, sheen: 0.45, sheenRough: 0.6, normal: 0.55 },
};

const foldCache: Record<string, { normal: THREE.Texture; rough: THREE.Texture }> = {};
/**
 * The cloth's surface: a few soft creases (the big folds come from the garment's shape and where it bends), plus the
 * weave of its fabric at true size: denim's diagonal twill, jersey's fine knit, a jumper's chunky stitches, leather's
 * grain, a puffer's ripstop. One tile covers about 44 cm. Returns a normal map and a matching roughness map.
 */
export function foldTexture(kind: Folds, fabric: Fabric = 'jersey'): THREE.Texture {
  return clothMaps(kind, fabric).normal;
}
export function clothMaps(kind: Folds, fabric: Fabric) {
  const key = kind + '|' + fabric, hit = foldCache[key]; if (hit) return hit;
  const S = 1024, h = new Float32Array(S * S), r = new Float32Array(S * S);
  let seed = (kind.length * 7919 + fabric.length * 104729) % 2147483647 || 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const add = (cx: number, cy: number, len: number, ang: number, wid: number, dep: number) => {   // one soft crease
    const ca = Math.cos(ang), sa = Math.sin(ang), R = Math.ceil(len / 2 + wid * 3);
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      const u = x * ca + y * sa, v = -x * sa + y * ca, t = Math.abs(u) / (len / 2);
      if (t > 1) continue;
      const X = (Math.floor(cx) + x + S * 4) % S, Y = (Math.floor(cy) + y + S * 4) % S;
      h[Y * S + X] += dep * Math.exp(-(v * v) / (wid * wid)) * (1 - t * t) ** 2;
    }
  };
  // soft creases: fewer and longer than before, so the cloth reads as fabric rather than crumpled paper
  const n = { tee: 26, jeans: 40, knit: 14, drape: 18, leather: 22 }[kind], stiff = fabric === 'leather' || fabric === 'nylon';
  for (let i = 0; i < n; i++) {
    const vert = kind === 'drape' || rnd() < 0.35, ang = vert ? Math.PI / 2 + (rnd() - 0.5) * 0.4 : (rnd() - 0.5) * 0.6;
    add(rnd() * S, rnd() * S, 120 + rnd() * (kind === 'drape' ? 600 : 260), ang, (stiff ? 10 : 7) + rnd() * 12, (rnd() < 0.5 ? -1 : 1) * (stiff ? 3.2 : 2.2));
  }
  // the weave (period in pixels; 1 px is about 0.43 mm)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let w = 0, ro = 0; const i = y * S + x;
    switch (fabric) {
      case 'denim': {   // a 3/1 twill: diagonal ribs, with the white weft peeking through
        const d = (x + y) % 6, rib = d < 4 ? Math.sin(d / 4 * Math.PI) : -0.3;
        w = rib * 0.35 + Math.sin(x * 1.05) * 0.06; ro = rib * 0.05; break;
      }
      case 'twill': { const d = (x + y) % 4; w = (d < 2 ? Math.sin(d / 2 * Math.PI) : -0.2) * 0.2; ro = w * 0.1; break; }
      case 'jersey': {   // knit loops: little V columns
        const cx = x % 4, cy = y % 5, v = Math.abs(cx - 1.5) / 1.5 - Math.abs(cy - 2.5) / 2.5 * 0.4;
        w = (1 - v) * 0.12; break;
      }
      case 'knit': {   // chunky stockinette: rows of V stitches, each ~4 mm
        const cw = 9, ch = 8, sx = x % cw, sy = (y + (Math.floor(x / cw) % 2) * 0) % ch;
        const half = sx < cw / 2 ? sx : cw - sx, lean = (sy - half * 0.9) / ch;
        w = Math.cos(lean * Math.PI * 2) * 0.45 * Math.sin(Math.PI * sx / cw) - (sx === 0 ? 0.4 : 0); ro = 0.04; break;
      }
      case 'satin': w = Math.sin(x * 0.4 + Math.sin(y * 0.05) * 2) * 0.02; ro = -0.05; break;   // almost smooth, faint float lines
      case 'leather': w = 0; break;   // grain: added below
      case 'nylon': { w = (x % 24 === 0 || y % 24 === 0 ? 0.25 : 0) + Math.sin(x * 2.9) * Math.sin(y * 2.9) * 0.04; break; }   // ripstop grid
      case 'woven': w = Math.sin(x * 2.0) * Math.sin(y * 2.0 + (Math.floor(x / 1.57) % 2) * Math.PI) * 0.08; break;   // plain weave
    }
    h[i] += w; r[i] = ro + (rnd() - 0.5) * 0.04;
  }
  if (fabric === 'leather') {   // pebbled grain: many small soft bumps
    for (let i = 0; i < 26000; i++) {
      const cx = rnd() * S, cy = rnd() * S, rr = 2 + rnd() * 4, d0 = 0.3 + rnd() * 0.4;
      for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) {
        const q = (x * x + y * y) / (rr * rr); if (q > 1) continue;
        const X = (Math.floor(cx) + x + S) % S, Y = (Math.floor(cy) + y + S) % S; h[Y * S + X] += d0 * (1 - q) * 0.25; r[Y * S + X] -= 0.03 * (1 - q);
      }
    }
  }
  const nc = document.createElement('canvas'), rc = document.createElement('canvas'); nc.width = nc.height = rc.width = rc.height = S;
  const ng = nc.getContext('2d')!, rg = rc.getContext('2d')!, nd = ng.createImageData(S, S), rd = rg.createImageData(S, S);
  const H = (x: number, y: number) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = H(x + 1, y) - H(x - 1, y), dy = H(x, y + 1) - H(x, y - 1), l = Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
    nd.data[i] = (-dx / l * 0.5 + 0.5) * 255; nd.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; nd.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; nd.data[i + 3] = 255;
    const v = Math.max(0, Math.min(255, (1 + r[y * S + x] * 2) * 200)); rd.data[i] = rd.data[i + 1] = rd.data[i + 2] = v; rd.data[i + 3] = 255;
  }
  ng.putImageData(nd, 0, 0); rg.putImageData(rd, 0, 0);
  const normal = new THREE.CanvasTexture(nc), rough = new THREE.CanvasTexture(rc);
  for (const t of [normal, rough]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  return (foldCache[key] = { normal, rough });
}

/**
 * Folds where clothes really crease, drawn as fine relief from her landmarks: rings that bunch at the elbows and
 * gather at the cuffs, creases behind the knees, trousers stacking over the shoes, "whiskers" fanning from the
 * crotch on trousers, and soft ripples where a top sits at the waist.
 */
export interface FoldZones { arms: boolean; legs: boolean; whiskers: boolean; waist: boolean; stack: boolean }
export function foldZones(p: PieceSpec, k: Marks): FoldZones {
  const longSleeve = p.cuts.some(c => (c.arm ?? 0) > 1.2), legs = p.cuts.some(c => c.source === 'tights' && !c.flare && (c.y0 ?? 0) < k.kneeY + 0.3 && (c.y1 ?? 99) < k.hipY + 0.5);
  const toFloor = p.cuts.some(c => c.source === 'tights' && !c.flare && (c.y0 ?? 0) < k.ankleY + 0.3 && (c.y1 ?? 99) < k.hipY + 0.5);
  const top = p.cuts.some(c => (c.y1 ?? 0) > k.armpitY && (c.y0 ?? 99) > k.crotchY - 0.2 && (c.y0 ?? 99) < k.waistY);
  return { arms: longSleeve, legs, whiskers: legs && (fabricOf(p) === 'denim' || fabricOf(p) === 'twill'), waist: top, stack: toFloor && !p.sole };
}

// ─── Fabric textures (patterns drawn on a canvas) ──────────────────
export function fabricTexture(color: string, pattern?: string, color2 = '#ffffff'): THREE.CanvasTexture {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = color; g.fillRect(0, 0, S, S);
  if (pattern === 'denim') {
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`; g.fillRect(Math.random() * S, Math.random() * S, 3, 1); }
    g.strokeStyle = 'rgba(255,255,255,.08)'; for (let i = -S; i < S; i += 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke(); }
  } else if (pattern === 'check') {
    g.fillStyle = color2; g.globalAlpha = 0.45;
    for (let i = 0; i < S; i += 64) { g.fillRect(i, 0, 32, S); g.fillRect(0, i, S, 32); }
    g.globalAlpha = 1;
  } else if (pattern === 'stripes' || pattern === 'pinstripe') {
    g.fillStyle = color2;
    const w = pattern === 'stripes' ? 22 : 3;
    for (let y = 0; y < S; y += 64) g.fillRect(0, y, S, w);
  } else if (pattern === 'dots') {
    g.fillStyle = color2;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.beginPath(); g.arc(x * 32 + (y % 2) * 16 + 8, y * 32 + 16, 6, 0, Math.PI * 2); g.fill(); }
  } else if (pattern === 'hearts') {
    g.fillStyle = color2;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const cx = x * 64 + (y % 2) * 32 + 32, cy = y * 64 + 30;
      g.beginPath(); g.moveTo(cx, cy + 12); g.bezierCurveTo(cx - 18, cy, cx - 10, cy - 14, cx, cy - 5); g.bezierCurveTo(cx + 10, cy - 14, cx + 18, cy, cx, cy + 12); g.fill();
    }
  } else if (pattern === 'leopard') {
    for (let i = 0; i < 40; i++) {
      const x = (i * 71) % S, y = (i * 113 + (i % 5) * 29) % S, r = 8 + (i % 4) * 2;
      g.fillStyle = 'rgba(40,24,10,.85)'; g.beginPath(); g.ellipse(x, y, r * 1.2, r, (i % 3) * 0.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = color2; g.beginPath(); g.ellipse(x, y, r * 0.6, r * 0.45, (i % 3) * 0.6, 0, Math.PI * 2); g.fill();
    }
  } else if (pattern === 'knit') {
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2;
    for (let x = 0; x < S; x += 8) for (let y = 0; y < S; y += 10) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 4, y + 8); g.lineTo(x + 8, y); g.stroke(); }
  } else if (pattern === 'floral') {
    for (let i = 0; i < 14; i++) {
      const x = (i * 97) % S, y = (i * 53 + (i % 3) * 40) % S, r = 9 + (i % 3) * 3;
      g.fillStyle = color2;
      for (let p = 0; p < 5; p++) { const a = p / 5 * Math.PI * 2; g.beginPath(); g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#fff1a8'; g.beginPath(); g.arc(x, y, r * 0.5, 0, Math.PI * 2); g.fill();
    }
  }
  // weave noise so flat colours read as cloth
  const d = g.getImageData(0, 0, S, S);
  for (let i = 0; i < d.data.length; i += 4) { const n = (Math.random() - 0.5) * 14; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ─── Hair ─────────────────────────────────────────────────────────
export type Hair3D = 'braids' | 'afro' | 'bun' | 'long';
export const HAIR_3D: { id: Hair3D; name: string }[] = [{ id: 'braids', name: 'Box braids' }, { id: 'afro', name: 'Afro' }, { id: 'bun', name: 'Bun' }, { id: 'long', name: 'Long' }];

/** Her head, neck and torso as a stack of ellipses (one per 0.15 dm of height), for hair to rest against. */
export interface Profile { y0: number; dy: number; rx: Float32Array; rz: Float32Array; cz: Float32Array }
export function bodyProfile(m: BodyModel, sp: Float32Array, k: Marks): Profile {
  const skip = /arm|wrist|finger|metacarpal|leg|foot|toe|pelvis/;
  const keep = m.bones.map(b => !skip.test(b.name));
  const y0 = k.hipY, dy = 0.15, nb = Math.ceil((k.headTop + 0.5 - y0) / dy);
  const rx = new Float32Array(nb), zlo = new Float32Array(nb).fill(1e9), zhi = new Float32Array(nb).fill(-1e9);
  for (let v = 0; v < m.ns; v++) {
    if (!keep[m.skinIndex[v * 4]]) continue;
    const y = sp[v * 3 + 1], b = Math.floor((y - y0) / dy);
    if (b < 0 || b >= nb) continue;
    rx[b] = Math.max(rx[b], Math.abs(sp[v * 3])); zlo[b] = Math.min(zlo[b], sp[v * 3 + 2]); zhi[b] = Math.max(zhi[b], sp[v * 3 + 2]);
  }
  const rz = new Float32Array(nb), cz = new Float32Array(nb);
  for (let b = 0; b < nb; b++) {
    if (zhi[b] < zlo[b]) { rx[b] = rx[b - 1] ?? 0.5; zlo[b] = zlo[b - 1] ?? -0.5; zhi[b] = zhi[b - 1] ?? 0.5; }
    rz[b] = (zhi[b] - zlo[b]) / 2; cz[b] = (zhi[b] + zlo[b]) / 2;
  }
  return { y0, dy, rx, rz, cz };
}
/** The profile grown by what she's wearing (so hair lies on the clothes, and over a hood, not through them). */
export function wearing(P: Profile, k: Marks, outfit?: { pieces: PieceSpec[] }): Profile {
  if (!outfit) return P;
  const rx = P.rx.slice(), rz = P.rz.slice();
  let bulk = 0, hood = false;
  for (const pc of outfit.pieces) for (const c of pc.cuts) if ((c.y1 ?? 99) > k.armpitY) bulk = Math.max(bulk, c.ease + (pc.hem ?? 0.035));
  for (const pc of outfit.pieces) if (pc.extra === 'hood') hood = true;
  for (let b = 0; b < rx.length; b++) {
    const y = P.y0 + b * P.dy;
    if (y < k.neckY - 0.1) { rx[b] += bulk; rz[b] += bulk; }
    if (hood && y > k.neckY - 0.85 && y < k.neckY + 0.1) {     // the folded hood round the neck and upper back
      const f = Math.sin(Math.PI * (y - (k.neckY - 0.85)) / 0.95);
      rx[b] += 0.18 * f; rz[b] += 0.32 * f;
    }
  }
  return { ...P, rx, rz };
}

/** Push a point out of the body (with a margin), returning true if it was inside. */
function collide(p: THREE.Vector3, P: Profile, margin: number, stick = false): boolean {
  const b = Math.floor((p.y - P.y0) / P.dy);
  if (b < 0 || b >= P.rx.length) return false;
  const rx = P.rx[b] + margin, rz = P.rz[b] + margin, dx = p.x / rx, dz = (p.z - P.cz[b]) / rz, d = Math.hypot(dx, dz);
  if (d >= 1 && !stick) return false;
  const s = 1 / (d || 1e-3); p.x = dx * s * rx; p.z = P.cz[b] + dz * s * rz;
  return true;
}
/**
 * One strand from a root: it leaves the scalp along the surface (downhill, combed by `comb` while it is on the
 * head), then falls under gravity, lying against her head and back instead of passing through them.
 */
function drape(root: THREE.Vector3, nrm: THREE.Vector3, len: number, P: Profile, k: Marks, o: { margin: number; comb: THREE.Vector3; grav?: number; step?: number; lift?: number }): THREE.Vector3[] {
  const step = o.step ?? 0.1, down = new THREE.Vector3(0, -1, 0), n = nrm.clone().normalize();
  const C = k.head, R = k.headR, cb = o.comb.clone().normalize();
  const dir = cb.clone().addScaledVector(n, -cb.dot(n)).normalize().addScaledVector(n, o.lift ?? 0.15).normalize();
  const p = root.clone().addScaledVector(n, 0.01), pts = [p.clone()], prev = new THREE.Vector3();
  for (let d = 0; d < len; d += step) {
    // on top of the head the comb direction leads; gravity takes over as the strand goes down the back and sides
    // while on the upper head the strand lies on it, combed; below that it hangs free (resting on her back)
    const top = Math.max(0, Math.min(1, (p.y - C.y + R * 0.2) / (R * 0.8)));
    dir.addScaledVector(down, o.grav ?? 0.22).addScaledVector(cb, 0.35 * top).normalize();
    prev.copy(p); p.addScaledVector(dir, step);
    collide(p, P, o.margin, p.y > C.y - R * 0.35 && p.y < k.headTop + 0.2);
    // never across her face
    if (p.y < C.y + R * 0.75 && p.y > k.chinY - 0.4 && Math.abs(p.x) < R * 0.78 && p.z > C.z + R * 0.15) p.z = C.z + R * 0.15;
    dir.subVectors(p, prev).normalize();
    pts.push(p.clone());
  }
  return pts;
}
/** Roots spread evenly over the scalp: one per cell of a grid laid round the head. */
function roots(scalp: Scalp, k: Marks, cell: number, minW: number) {
  const C = k.head, best = new Map<string, number>(), dist = new Map<string, number>(), R = k.headR;
  for (let i = 0; i < scalp.w.length; i++) {
    if (scalp.w[i] < minW) continue;
    const x = scalp.p[i * 3] - C.x, y = scalp.p[i * 3 + 1] - C.y, z = scalp.p[i * 3 + 2] - C.z;
    const az = Math.atan2(x, -z) * R, el = Math.atan2(y, Math.hypot(x, z)) * R;   // arc lengths round and up the head
    const rowH = cell, row = Math.floor(el / rowH), off = (row % 2) * 0.5, col = Math.floor(az / cell + off);
    const key = row + ',' + col, cx = (col + 0.5 - off) * cell, cy = (row + 0.5) * rowH, d = (az - cx) ** 2 + (el - cy) ** 2;
    if (d < (dist.get(key) ?? 1e9)) { dist.set(key, d); best.set(key, i); }
  }
  return [...best.values()];
}
export interface Scalp { p: Float32Array; n: Float32Array; w: Float32Array }

const tex: Record<string, THREE.Texture> = {};
/** A tile of fine strands (white, tinted by the material), with soft tips, for hair cards. */
function strandCard(): THREE.Texture {
  if (tex.card) return tex.card;
  const W = 256, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 950; i++) {
    const x0 = 6 + Math.random() * (W - 12), len = H * (0.7 + Math.random() * 0.3), wv = (Math.random() - 0.5) * 10, l = 150 + Math.random() * 105;
    g.strokeStyle = `rgba(${l},${l},${l},${0.35 + Math.random() * 0.6})`; g.lineWidth = 0.8 + Math.random() * 1.6;
    g.beginPath(); g.moveTo(x0, 0);
    for (let y = 0; y <= len; y += 32) g.lineTo(x0 + Math.sin(y / 180 + x0) * wv * (y / H), y);
    g.stroke();
  }
  // fade the card's long edges so cards blend into each other
  const d = g.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const e = Math.min(x, W - 1 - x) / 40, i = (y * W + x) * 4; if (e < 1) d.data[i + 3] *= e; }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return (tex.card = t);
}
/** Braid surface: the over-under chevrons of a three-strand plait, as a bump map (u along the braid). */
function plaitBump(): THREE.Texture {
  if (tex.plait) return tex.plait;
  const W = 256, H = 64, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!, d = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W * 8, v = y / H * 3;                   // 8 crossings along the tile, 3 strands round
    const ph = (u + Math.abs(((v % 1) - 0.5)) * 1.2) % 1, lobe = Math.sin(ph * Math.PI), fine = Math.sin((u * 9 + v * 13)) * 0.08;
    const h = Math.max(0, lobe) ** 0.6 * 0.85 + fine + (Math.random() - 0.5) * 0.06, i = (y * W + x) * 4;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = Math.max(0, Math.min(255, h * 255)); d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return (tex.plait = t);
}
/** Tight coils for an afro: a speckle of tiny loops; alpha thins out towards the outer shells. */
function coilTexture(): THREE.Texture {
  if (tex.coil) return tex.coil;
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 5200; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 1.5 + Math.random() * 3.5, l = 140 + Math.random() * 115;
    g.strokeStyle = `rgba(${l},${l},${l},1)`; g.lineWidth = 0.8 + Math.random();
    g.beginPath(); g.arc(x, y, r, Math.random() * 6, Math.random() * 6 + 4); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return (tex.coil = t);
}
/** Combed-back strands for the scalp layer and buns (v runs along the hair). */
function combTexture(): THREE.Texture {
  if (tex.comb) return tex.comb;
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!; g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1800; i++) { const x = Math.random() * S, l = 90 + Math.random() * 165; g.fillStyle = `rgba(${l},${l},${l},${0.25 + Math.random() * 0.5})`; g.fillRect(x, Math.random() * S, 1 + Math.random(), 40 + Math.random() * 200); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return (tex.comb = t);
}

/** Ribbon geometry along a strand: width w, lying flat against the head (side = across the hair). */
function ribbon(pts: THREE.Vector3[], C: THREE.Vector3, w: number, P: number[], N: number[], UV: number[], I: number[], u0 = 0) {
  const base = P.length / 3, n = pts.length, t = new THREE.Vector3(), out = new THREE.Vector3(), side = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    t.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    out.subVectors(pts[i], C); out.y *= 0.3; out.normalize();
    side.crossVectors(t, out).normalize(); nn.crossVectors(side, t).normalize();
    const taper = (1 - Math.pow(i / (n - 1), 3) * 0.7) * w / 2;
    for (const sg of [-1, 1]) { P.push(pts[i].x + side.x * taper * sg, pts[i].y + side.y * taper * sg, pts[i].z + side.z * taper * sg); N.push(nn.x, nn.y, nn.z); UV.push(u0 + (sg + 1) / 2, 1 - i / (n - 1)); }
    if (i) { const a = base + (i - 1) * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
}

/** Hair meshes in rest-frame world space (the caller parents them to the head bone). */
export function hairMeshes(style: Hair3D, color: string, k: Marks, scalp: Scalp, cap: THREE.BufferGeometry, prof: Profile): THREE.Object3D[] {
  const col = new THREE.Color(color), C = k.head, R = k.headR, out: THREE.Object3D[] = [];
  const hairMat = (o: Partial<THREE.MeshPhysicalMaterialParameters> = {}) => new THREE.MeshPhysicalMaterial({
    color: col, roughness: 0.5, metalness: 0, sheen: 0.6, sheenColor: col.clone().lerp(new THREE.Color('#ffffff'), 0.25), sheenRoughness: 0.45,
    specularIntensity: 0.6, anisotropy: 0.7, envMapIntensity: 0.5, ...o,
  });
  // the scalp layer: hair colour hugging the head, fading out at the hairline (vertex alpha)
  const capMat = hairMat({ map: combTexture(), roughness: 0.9, transparent: true, vertexColors: true, depthWrite: false, anisotropy: 0, sheen: 0.3, specularIntensity: 0.2 });
  capMat.polygonOffset = true; capMat.polygonOffsetFactor = -2;
  capMat.map!.repeat.set(10, 3);
  out.push(new THREE.Mesh(cap, capMat));

  if (style === 'braids') {
    const bump = plaitBump(), m = hairMat({ bumpMap: bump, bumpScale: 2.2, roughness: 0.55, anisotropy: 0 });
    bump.repeat.set(9, 1);
    const ids = roots(scalp, k, 0.32, 0.4), geos: THREE.BufferGeometry[] = [];
    ids.forEach((i, n) => {
      const root = new THREE.Vector3(scalp.p[i * 3], scalp.p[i * 3 + 1], scalp.p[i * 3 + 2]), nrm = new THREE.Vector3(scalp.n[i * 3], scalp.n[i * 3 + 1], scalp.n[i * 3 + 2]);
      const front = root.z > C.z + R * 0.35, len = (k.headTop - k.waistY) * (0.85 + ((n * 37) % 11) / 60) + (front ? -0.3 : 0);
      // combed straight back off the face, then down
      const pts = drape(root, nrm, len, prof, k, { margin: 0.06 + (n % 3) * 0.035 + (root.y - k.chinY) * 0.012, comb: new THREE.Vector3(root.x * 0.15, 0, -1), lift: 0.2 });
      const curve = new THREE.CatmullRomCurve3(pts), segs = Math.ceil(len * 9);
      const g = new THREE.TubeGeometry(curve, segs, 0.058, 6, false), p = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3(), cc = new THREE.Vector3();
      for (let s2 = 0; s2 <= segs; s2++) {          // a tapered start at the root and a little tail at the end
        curve.getPointAt(s2 / segs, cc); const u = s2 / segs, sc = Math.min(1, Math.sqrt(u * 30)) * (u > 0.97 ? 0.55 : 1);
        for (let r2 = 0; r2 <= 6; r2++) { const ix = s2 * 7 + r2; v.fromBufferAttribute(p, ix).sub(cc).multiplyScalar(sc).add(cc); p.setXYZ(ix, v.x, v.y, v.z); }
      }
      const uv = g.attributes.uv as THREE.BufferAttribute;          // repeat the plait by length, not per braid
      for (let j = 0; j < uv.count; j++) uv.setX(j, uv.getX(j) * len);
      g.computeVertexNormals(); geos.push(g);
    });
    out.push(new THREE.Mesh(merge(geos), m));
  } else if (style === 'long') {
    // over the crown, a smooth layer of hair combed away from a side parting hides where the strands start
    const part = C.x + R * 0.25, cp = cap.attributes.position as THREE.BufferAttribute, cn = cap.attributes.normal as THREE.BufferAttribute, cc = cap.attributes.color as THREE.BufferAttribute;
    const shell = cap.clone(), sp2 = shell.attributes.position as THREE.BufferAttribute, suv = shell.attributes.uv as THREE.BufferAttribute, scol = shell.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < cp.count; i++) {
      const a = cc.getW(i), lift = 0.09 * a * Math.min(1, Math.max(0, (cp.getY(i) - k.chinY) / (k.headTop - k.chinY)) * 1.6);
      sp2.setXYZ(i, cp.getX(i) + cn.getX(i) * lift, cp.getY(i) + cn.getY(i) * lift, cp.getZ(i) + cn.getZ(i) * lift);
      suv.setXY(i, cp.getZ(i) * 0.8, Math.atan2(Math.abs(cp.getX(i) - part), cp.getY(i) - C.y) * 1.2);
      scol.setW(i, Math.min(1, a * 1.3));
    }
    shell.computeVertexNormals();
    const st = combTexture().clone(); st.repeat.set(5, 2.5); st.needsUpdate = true;
    const sm = hairMat({ map: st, roughness: 0.45, transparent: true, vertexColors: true, depthWrite: true, anisotropy: 0.8, anisotropyRotation: 0 });
    out.push(new THREE.Mesh(shell, sm));
    const card = strandCard(), P: number[] = [], N: number[] = [], UV: number[] = [], I: number[] = [];
    for (const [layer, cell, minW] of [[0, 0.26, 0.3], [1, 0.32, 0.45], [2, 0.38, 0.6]] as const) {
      roots(scalp, k, cell, minW).forEach((i, n) => {
        const root = new THREE.Vector3(scalp.p[i * 3], scalp.p[i * 3 + 1], scalp.p[i * 3 + 2]), nrm = new THREE.Vector3(scalp.n[i * 3], scalp.n[i * 3 + 1], scalp.n[i * 3 + 2]);
        // the crown and the front hairline are the smooth layer; strands start round the sides and back, under it
        if ((root.z > C.z + R * 0.1 && Math.abs(root.x - C.x) < R * 0.72) || root.y > C.y + R * 0.62) return;
        const front = root.z > C.z + R * 0.2;
        // a side parting: hair on each side of it falls away from it
        const part = root.x - R * 0.25, comb = new THREE.Vector3(Math.sign(part) * (front ? 0.9 : 0.3), 0, front ? -0.25 : -0.6);
        const len = (k.headTop - k.bustY) * (0.95 + ((n * 29) % 7) / 40) + layer * 0.15;
        const pts = drape(root, nrm, len, prof, k, { margin: 0.03 + layer * 0.035 + (n % 4) * 0.008, comb, lift: 0.02, step: 0.08 });
        ribbon(pts, C, 0.55, P, N, UV, I);
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I);
    g.computeTangents?.();
    // alpha-to-coverage: with the multisampled render, strand edges come out smooth instead of jagged
    const m = hairMat({ map: card, alphaMap: card, alphaTest: 0.22, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.42, anisotropyRotation: Math.PI / 2 });
    const mesh = new THREE.Mesh(g, m); mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ alphaMap: card, alphaTest: 0.22, depthPacking: THREE.RGBADepthPacking });
    out.push(mesh);
  } else if (style === 'afro') {
    // a soft round cloud of coils: shells stacked outward, each thinner than the last
    const g = mergeVertices(new THREE.IcosahedronGeometry(1, 6)), p = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
    const uv = new Float32Array(p.count * 2), RA = R * 1.42, sm = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = Math.sin(v.x * 4.1) * Math.sin(v.y * 3.7 + 1) * Math.sin(v.z * 4.3) * 0.05 + Math.sin(v.x * 11 + v.z * 9) * Math.sin(v.y * 10) * 0.015;
      uv[i * 2] = Math.atan2(v.x, v.z) / Math.PI * 3; uv[i * 2 + 1] = v.y * 3;
      v.multiplyScalar(RA * (1 + n)); v.y *= 0.9;
      // clear of her face: the front pulls back below the hairline, smoothly
      const face = sm(-R * 0.1, R * 0.6, v.z) * (1 - sm(-R * 0.1, R * 0.45, v.y));
      v.z -= face * (v.z - R * 0.25) * 0.9;
      // ends above the neck at the front and sides, lower at the back
      const floor = -R * (0.5 + 0.45 * sm(0, -RA, v.z));
      if (v.y < floor) v.y = floor + (v.y - floor) * 0.3;
      p.setXYZ(i, v.x + C.x, v.y + C.y + R * 0.12, v.z + C.z - R * 0.2);
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.computeVertexNormals();
    const coil = coilTexture(), shells = 20, ctr = new THREE.Vector3(C.x, C.y + R * 0.12, C.z - R * 0.2);
    for (let s2 = 0; s2 < shells; s2++) {
      const f = s2 / (shells - 1), m = hairMat({ map: coil, alphaMap: s2 ? coil : null, alphaTest: s2 ? 0.2 + f * 0.7 : 0, roughness: 0.85, sheen: 0.9, sheenRoughness: 0.8, anisotropy: 0, specularIntensity: 0.25 });
      m.color = col.clone().multiplyScalar(0.45 + f * 0.65);                    // deeper inside, lighter at the tips
      const mesh = new THREE.Mesh(g, m), sc = 0.8 + f * 0.24;
      mesh.position.copy(ctr).multiplyScalar(1 - sc); mesh.scale.setScalar(sc);
      if (s2) mesh.castShadow = false;
      out.push(mesh);
    }
  } else if (style === 'bun') {
    // hair smoothed back to a bun at the crown
    const bun = new THREE.SphereGeometry(R * 0.5, 40, 24), bp = bun.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
    for (let i = 0; i < bp.count; i++) { v.fromBufferAttribute(bp, i); const a = Math.atan2(v.z, v.x); v.multiplyScalar(1 + Math.sin(a * 5 + v.y * 12) * 0.05); v.y *= 0.8; bp.setXYZ(i, v.x, v.y, v.z); }
    bun.computeVertexNormals(); bun.translate(C.x, k.headTop + R * 0.05, C.z - R * 0.6);
    const comb = combTexture().clone(); comb.repeat.set(6, 2); comb.needsUpdate = true;
    out.push(new THREE.Mesh(bun, hairMat({ map: comb, roughness: 0.6 })));
  }
  return out;
}

/** Merge geometries with the same attributes into one (fewer draw calls). */
function merge(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const P: number[] = [], N: number[] = [], UV: number[] = [], I: number[] = [];
  for (const g of gs) {
    const b = P.length / 3, p = g.attributes.position.array, n = g.attributes.normal.array, u = g.attributes.uv.array, ix = g.index!.array;
    for (let i = 0; i < p.length; i++) { P.push(p[i]); N.push(n[i]); }
    for (let i = 0; i < u.length; i++) UV.push(u[i]);
    for (let i = 0; i < ix.length; i++) I.push(ix[i] + b);
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I);
  return g;
}

/** A closet photo laid on a garment: the photo over its front, and a swatch cut from the photo tiled everywhere else. */
export interface PhotoFabric { photo: THREE.Texture; uv: [number, number, number, number]; front: number[]; useFront: boolean;
  /** her photo of the back, laid over the garment's back (seen from behind, so mirrored) */ back?: { photo: THREE.Texture; uv: [number, number, number, number]; box: number[] } }

/**
 * Shader patch for garments: push each vertex out along the posed body normal by its stored distance. With
 * mat.userData.photo, also lay her photo of the piece over its front.
 */
export function clothShader<T extends THREE.Material>(mat: T): T {
  const ph = mat.userData.photo as PhotoFabric | undefined, dt = mat.userData.detail as Detail | undefined;
  const zn = mat.userData.zones as { z: FoldZones; k: Marks } | undefined;
  mat.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute float clothOff;\nattribute vec3 clothDir;\nattribute vec3 clothRest;\nvarying vec3 vRest;\nvarying vec3 vRestN;\nvarying float vSimY;\nvarying vec2 vSimXZ;\n' + sh.vertexShader.replace('#include <skinning_vertex>', `
      #ifdef CLOTH_SIM
        vRest = clothRest;
      #else
        vRest = position + clothDir * clothOff;
      #endif
      vRestN = clothDir;
      #ifdef CLOTH_SIM
        vSimY = position.y; vSimXZ = position.xz;
      #endif
      #include <skinning_vertex>
      #ifdef USE_SKINNING
        mat4 clothM = bindMatrixInverse * ( skinWeight.x * boneMatX + skinWeight.y * boneMatY + skinWeight.z * boneMatZ + skinWeight.w * boneMatW ) * bindMatrix;
        transformed += normalize( ( clothM * vec4( clothDir, 0.0 ) ).xyz ) * clothOff;
      #else
        transformed += clothDir * clothOff;
      #endif`);
    // a hanging garment worn under a coat: the part inside the coat's skirt isn't drawn (it can't be seen, and
    // drawn it would show through wherever the two cloths cross while swinging)
    const hide = mat.userData.hide as { value: THREE.Vector2 } | undefined;
    if (hide) {
      sh.uniforms.clothHide = hide; sh.uniforms.clothHideA = mat.userData.hideA; sh.uniforms.clothHideC = mat.userData.hideC;
      // hidden from the coat's hem (its height in her direction, so where the hem rises nothing shows through) up to the waist
      sh.fragmentShader = 'uniform vec2 clothHide;\nuniform float clothHideA[16];\nuniform vec2 clothHideC;\nvarying float vSimY;\nvarying vec2 vSimXZ;\n' + sh.fragmentShader.replace('void main() {', `void main() {
  if ( vSimY < clothHide.y ) {
    vec2 d = vSimXZ - clothHideC; int a = int( mod( floor( ( atan( d.x, d.y ) / 6.2831853 + 1.0 ) * 16.0 ), 16.0 ) );
    float h = clothHide.x; for ( int i = 0; i < 16; i++ ) if ( i == a && clothHideA[i] > -1e8 ) h = clothHideA[i];
    if ( vSimY > h ) discard;
  }`);
    }
    if ((!ph && !dt && !zn) || !sh.fragmentShader.includes('#include <map_fragment>')) return;
    let head = 'varying vec3 vRest;\nvarying vec3 vRestN;\n', body = '';
    if (zn) {
      const { z, k } = zn;
      sh.uniforms.zF = { value: new THREE.Vector4(z.arms ? 1 : 0, z.legs ? 1 : 0, z.whiskers ? 1 : 0, z.waist ? 1 : 0) };
      sh.uniforms.zStack = { value: z.stack ? 1 : 0 };
      sh.uniforms.zSh = { value: new THREE.Vector2(k.shoulderJ.x, k.shoulderJ.y) }; sh.uniforms.zEl = { value: new THREE.Vector2(k.elbowJ.x, k.elbowJ.y) };
      sh.uniforms.zWr = { value: new THREE.Vector2(k.wristJ.x, k.wristJ.y) };
      sh.uniforms.zY = { value: new THREE.Vector4(k.kneeY, k.ankleY, k.crotchY, k.waistY) };
      head += FOLD_GLSL;
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { float hh = clothFolds(); normal = clothPerturb( - vViewPosition, normal, vec2( dFdx( hh ), dFdy( hh ) ), faceDirection ); }`);
    }
    if (ph) {
      sh.uniforms.photoMap = { value: ph.photo };
      sh.uniforms.photoUv = { value: new THREE.Vector4(...ph.uv) };
      sh.uniforms.photoBox = { value: new THREE.Vector4(...ph.front) };
      sh.uniforms.photoOn = { value: ph.useFront ? 1 : 0 };
      const bk = ph.back;
      sh.uniforms.photoBackMap = { value: bk?.photo ?? ph.photo };
      sh.uniforms.photoBackUv = { value: new THREE.Vector4(...(bk?.uv ?? ph.uv)) };
      sh.uniforms.photoBackBox = { value: new THREE.Vector4(...(bk?.box ?? ph.front)) };
      sh.uniforms.photoBackOn = { value: bk && ph.useFront ? 1 : 0 };
      head += 'uniform sampler2D photoMap;\nuniform vec4 photoUv;\nuniform vec4 photoBox;\nuniform float photoOn;\nuniform sampler2D photoBackMap;\nuniform vec4 photoBackUv;\nuniform vec4 photoBackBox;\nuniform float photoBackOn;\n';
      body += `
          vec2 q = ( vRest.xy - photoBox.xy ) / photoBox.zw;
          vec4 ph = texture2D( photoMap, mix( photoUv.xy, photoUv.zw, q ) );
          float inside = step( 0.0, q.x ) * step( q.x, 1.0 ) * step( 0.0, q.y ) * step( q.y, 1.0 );
          float f = photoOn * inside * smoothstep( -0.05, 0.4, vRestN.z ) * smoothstep( 0.4, 0.9, ph.a );
          sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, ph.rgb, f );
          vec2 qb = ( vRest.xy - photoBackBox.xy ) / photoBackBox.zw; qb.x = 1.0 - qb.x;   // seen from behind
          vec4 pb = texture2D( photoBackMap, mix( photoBackUv.xy, photoBackUv.zw, qb ) );
          float inb = step( 0.0, qb.x ) * step( qb.x, 1.0 ) * step( 0.0, qb.y ) * step( qb.y, 1.0 );
          float fb = photoBackOn * inb * smoothstep( 0.05, -0.4, vRestN.z ) * smoothstep( 0.4, 0.9, pb.a );
          sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, pb.rgb, fb );`;
    }
    if (dt) {
      const v4 = (a?: number[]) => new THREE.Vector4(...(a ?? [0, 0, 0, 0]));
      sh.uniforms.dF = { value: dt.f }; sh.uniforms.dCol = { value: new THREE.Color(dt.color ?? '#3a3a3a') };
      sh.uniforms.dA = { value: v4(dt.a) }; sh.uniforms.dB = { value: v4(dt.b) }; sh.uniforms.dC = { value: v4(dt.c) };
      head += DETAIL_GLSL;
      body += '\n          clothDetails( sampledDiffuseColor.rgb );';
    }
    sh.fragmentShader = head + sh.fragmentShader.replace('#include <map_fragment>', `
        #ifdef USE_MAP
          // the print/fabric is projected from three sides by the cloth's own facing (its true surface, folds
          // and pleats included), so it never stretches where the cloth turns or folds
          vec3 tN = normalize( cross( dFdx( vRest ), dFdy( vRest ) ) ), bw = pow( abs( tN ), vec3( 6.0 ) ); bw /= bw.x + bw.y + bw.z + 1e-5;
          vec4 sampledDiffuseColor = texture2D( map, vRest.zy * vec2( -0.5, 0.5 ) ) * bw.x + texture2D( map, vRest.xz * 0.5 ) * bw.y + texture2D( map, vRest.xy * 0.5 ) * bw.z;${body}
          diffuseColor *= sampledDiffuseColor;
        #endif
        diffuseColor.rgb *= gl_FrontFacing ? 1.0 : 0.5;   // the inside of the garment is in its own shade`);
  };
  mat.customProgramCacheKey = () => `cloth${ph ? '-photo' : ''}${dt ? '-detail' : ''}${zn ? '-zones' : ''}${(mat as THREE.Material & { defines?: Record<string, unknown> }).defines?.CLOTH_SIM ? '-sim' : ''}${mat.userData.hide ? '-hide' : ''}`;
  return mat;
}

/** Folds by body zone (see foldZones); heights in dm, turned into shading by the screen-space slope. */
const FOLD_GLSL = `
uniform vec4 zF; uniform float zStack; uniform vec2 zSh; uniform vec2 zEl; uniform vec2 zWr; uniform vec4 zY;
vec3 clothPerturb( vec3 sp, vec3 sn, vec2 dH, float fd ) {
  vec3 vx = dFdx( sp.xyz ), vy = dFdy( sp.xyz ), n = sn, r1 = cross( vy, n ), r2 = cross( n, vx );
  float det = dot( vx, r1 ) * fd; vec3 g = sign( det ) * ( dH.x * r1 + dH.y * r2 );
  return normalize( abs( det ) * sn - g );
}
float clothFolds() {
  vec3 P = vRest, N = normalize( vRestN ); float ax = abs( P.x ), around = atan( N.x, N.z ), h = 0.0;
  // arms: position along the arm (0 shoulder, 1 elbow, 2 wrist)
  if ( zF.x > 0.5 && ax > zSh.x - 0.15 ) {
    vec2 q = vec2( ax, P.y ), u = zEl - zSh, l = zWr - zEl;
    float t = dot( q - zSh, u ) / dot( u, u ); if ( t > 1.0 ) t = 1.0 + dot( q - zEl, l ) / dot( l, l );
    float elbow = exp( - pow( ( t - 1.0 ) / 0.22, 2.0 ) ), cuff = smoothstep( 1.6, 1.95, t );
    h += ( elbow * 0.03 + cuff * 0.025 ) * sin( t * 22.0 + around * 1.3 + sin( around * 3.0 ) ) * smoothstep( -0.3, 0.6, sin( around * 2.0 + t * 4.0 ) );
  }
  // legs: behind and round the knee, and stacking above the shoes
  if ( zF.y > 0.5 && P.y < zY.z ) {
    float knee = exp( - pow( ( P.y - zY.x ) / 0.45, 2.0 ) ) * ( 0.45 + 0.55 * smoothstep( 0.2, -0.6, N.z ) );
    h += knee * 0.03 * sin( P.y * 16.0 + around * 1.6 ) * smoothstep( -0.4, 0.5, sin( around * 2.0 + P.y * 3.0 ) );
    if ( zStack > 0.5 ) h += smoothstep( zY.y + 0.7, zY.y + 0.1, P.y ) * 0.035 * sin( P.y * 15.0 + around * 2.2 + sin( around * 5.0 ) );
  }
  // whiskers: creases fanning out from the crotch over the tops of the thighs
  if ( zF.z > 0.5 && N.z > 0.2 ) {
    vec2 d = vec2( ax - 0.05, P.y - zY.z + 0.15 ); float r = length( d ), a = atan( d.y, d.x );
    h += 0.03 * smoothstep( 0.15, 0.4, r ) * smoothstep( 1.1, 0.5, r ) * smoothstep( -0.2, 0.6, d.y ) * pow( abs( sin( a * 7.0 ) ), 3.0 );
  }
  // a top's soft ripples where it sits round the waist (mostly at the sides)
  if ( zF.w > 0.5 ) h += exp( - pow( ( P.y - zY.w + 0.15 ) / 0.4, 2.0 ) ) * abs( N.x ) * 0.015 * sin( P.y * 14.0 + around * 0.8 );
  return h;
}
`;

/** The details a garment can carry, drawn from its position on her body at rest (dm; +z is the front). */
const DETAIL_GLSL = `
uniform float dF; uniform vec3 dCol; uniform vec4 dA; uniform vec4 dB; uniform vec4 dC;
float dBit( float b ) { return mod( floor( dF / b ), 2.0 ); }
float dLine( float d, float w ) { return 1.0 - smoothstep( w * 0.5, w, abs( d ) ); }
float dRect( vec2 p, vec2 lo, vec2 hi, float w ) {
  vec2 c = ( lo + hi ) * 0.5, h = ( hi - lo ) * 0.5, d = abs( p - c ) - h;
  return dLine( length( max( d, 0.0 ) ) + min( max( d.x, d.y ), 0.0 ), w );
}
float dButton( vec2 p, vec2 c ) { return 1.0 - smoothstep( 0.05, 0.062, length( p - c ) ); }
void clothDetails( inout vec3 col ) {
  vec3 P = vRest, N = normalize( vRestN );
  float fr = smoothstep( 0.15, 0.45, N.z ), bk = smoothstep( 0.15, 0.45, -N.z ), ax = abs( P.x );
  vec3 dark = col * 0.6;
  // topstitched side seams and inside-leg seams (where the cloth turns from front to back)
  if ( dBit( 1.0 ) > 0.5 ) col = mix( col, dCol, clamp( dLine( N.z - 0.07, 0.035 ) + dLine( N.z + 0.07, 0.035 ), 0.0, 1.0 ) * 0.8 * ( 1.0 - step( 0.85, abs( N.y ) ) ) * ( dC.w > 0.5 ? step( dC.z, P.y ) : 1.0 ) );
  // a button placket down the front (x = dA.w), buttons every dA.z from dA.x down to dA.y
  if ( dBit( 2.0 ) > 0.5 ) {
    float r = step( dA.y, P.y ) * step( P.y, dA.x ) * fr;
    col = mix( col, dark, clamp( dLine( P.x - dA.w - 0.1, 0.018 ) + dLine( P.x - dA.w + 0.1, 0.018 ), 0.0, 1.0 ) * r * 0.55 );
    float m = mod( dA.x - P.y + dA.z * 0.5, dA.z ) - dA.z * 0.5;
    float b = dButton( vec2( P.x - dA.w, m ), vec2( 0.0 ) ) * r;
    col = mix( col, dCol, b ); col = mix( col, dCol * 1.6 + 0.08, b * dLine( length( vec2( P.x - dA.w, m ) ) - 0.03, 0.012 ) );
  }
  // double-breasted: two columns of buttons at +-dA.w
  if ( dBit( 4.0 ) > 0.5 ) {
    float r = step( dA.y, P.y ) * step( P.y, dA.x ) * fr, m = mod( dA.x - P.y + dA.z * 0.5, dA.z ) - dA.z * 0.5;
    float b = dButton( vec2( ax - dA.w, m ), vec2( 0.0 ) ) * r;
    col = mix( col, dCol, b ); col = mix( col, dCol * 1.6 + 0.08, b * dLine( length( vec2( ax - dA.w, m ) ) - 0.03, 0.012 ) );
  }
  // a zip (x = dA.w) from dA.x down to dA.y, with its teeth
  if ( dBit( 8.0 ) > 0.5 ) {
    float r = step( dA.y, P.y ) * step( P.y, dA.x ) * fr * dLine( P.x - dA.w, 0.05 );
    col = mix( col, mix( vec3( 0.55 ), vec3( 0.85 ), step( 0.5, fract( P.y * 45.0 ) ) ), r );
  }
  // quilted channels every 0.55
  if ( dBit( 16.0 ) > 0.5 ) col = mix( col, dark, dLine( ( fract( P.y / 0.55 ) - 0.0 ) * 0.55 - 0.0, 0.05 ) * 0.8 );
  // a yoke seam across the chest and back
  if ( dBit( 32.0 ) > 0.5 ) col = mix( col, dCol, clamp( dLine( P.y - dB.x, 0.016 ) + dLine( P.y - dB.x + 0.045, 0.016 ), 0.0, 1.0 ) * ( 1.0 - step( 0.9, abs( N.y ) ) ) );
  // flap chest pockets
  if ( dBit( 64.0 ) > 0.5 ) {
    float r = clamp( dRect( vec2( ax, P.y ), vec2( 0.28, dB.y - 0.42 ), vec2( 0.68, dB.y ), 0.018 ) + dLine( P.y - dB.y + 0.14, 0.018 ) * step( 0.28, ax ) * step( ax, 0.68 ), 0.0, 1.0 ) * fr;
    col = mix( col, dCol, r );
    col = mix( col, col * 0.8, ( 1.0 - step( 0.0, P.y - dB.y + 0.14 ) - ( 1.0 - step( 0.0, P.y - dB.y ) ) ) * step( 0.28, ax ) * step( ax, 0.68 ) * fr * 0.0 );
  }
  // a ribbed band at the hem (up to dB.z)
  if ( dBit( 128.0 ) > 0.5 && P.y < dB.z ) col *= 0.86 + 0.14 * smoothstep( -0.3, 0.3, sin( atan( P.x, P.z - 0.1 ) * 140.0 ) );
  // a wrap front: the overlap edge runs from her right shoulder to her left hip
  if ( dBit( 256.0 ) > 0.5 ) {
    float t = clamp( ( dA.x - P.y ) / ( dA.x - dA.y ), 0.0, 1.0 ), ex = mix( -0.3, 0.5, t );
    col = mix( col, col * 0.55, dLine( P.x - ex, 0.03 ) * fr * step( dA.y, P.y ) * step( P.y, dA.x - 0.4 ) );
  }
  // corset boning
  if ( dBit( 512.0 ) > 0.5 ) col = mix( col, col * 0.6, clamp( dLine( ax - 0.16, 0.02 ) + dLine( ax - 0.42, 0.02 ) + dLine( ax - 0.66, 0.02 ), 0.0, 1.0 ) * ( fr + bk ) );
  // cargo pockets on the outside of the thighs, with flaps
  if ( dBit( 1024.0 ) > 0.5 ) {
    float sd = smoothstep( 0.55, 0.8, abs( N.x ) ) * step( P.x * N.x, 0.0 + 99.0 );
    float r = clamp( dRect( vec2( P.z, P.y ), vec2( -0.25, dB.w - 0.85 ), vec2( 0.32, dB.w ), 0.02 ) + dLine( P.y - dB.w + 0.22, 0.02 ) * step( -0.25, P.z ) * step( P.z, 0.32 ), 0.0, 1.0 );
    col = mix( col, dCol, r * sd );
  }
  // back pockets
  if ( dBit( 2048.0 ) > 0.5 ) col = mix( col, dCol, dRect( vec2( ax, P.y ), vec2( 0.2, dC.x - 0.55 ), vec2( 0.68, dC.x ), 0.02 ) * bk * 0.9 );
  // waistband
  if ( dBit( 4096.0 ) > 0.5 ) col = mix( col, dCol, clamp( dLine( P.y - dC.y, 0.016 ) + dLine( P.y - dC.y - 0.2, 0.016 ), 0.0, 1.0 ) * ( 1.0 - step( 0.85, abs( N.y ) ) ) );
}
`;

// ─── Accessories (hard pieces skinned to one bone each) ────────────
export interface Accessory { geo: THREE.BufferGeometry; color: string; rough: number; sheen?: number; metal?: number; opacity?: number }
function skinTo(g: THREE.BufferGeometry, bone: number): THREE.BufferGeometry {
  const n = g.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { si[i * 4] = bone; sw[i * 4] = 1; }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return g;
}
/** Sneaker soles and laces, or a hoodie's hood (lying down round the neck) and drawstrings. */
export function accessories(m: BodyModel, pos: Float32Array, k: Marks, piece: PieceSpec): Accessory[] {
  const out: Accessory[] = [];
  const sole = piece.sole ?? (piece.extra === 'sneaker' ? { h: 0.25, laces: true } : piece.extra === 'boot' ? { h: 0.1 } : null);
  if (sole) {
    const H = sole.h, heel = sole.heel ?? 0, tilt = heelTilt(k, heel);
    for (const side of ['L', 'R'] as const) {
      const fb = m.boneIndex(`foot.${side}`), sg = side === 'L' ? 1 : -1;
      const isFoot = new Set(m.bones.map((b, i) => (b.name === `foot.${side}` || b.name.startsWith('toe') && b.name.endsWith(side) ? i : -1)).filter(i => i >= 0));
      const pts: number[][] = [];
      for (let v = 0; v < m.ns; v++) if (isFoot.has(m.skinIndex[v * 4]) && pos[v * 3 + 1] < k.ankleY + 0.1 && Math.sign(pos[v * 3]) === sg) pts.push([pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]);
      if (pts.length < 20) continue;
      const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[2], 0) / pts.length;
      let z0 = 1e9, z1 = -1e9; for (const p of pts) { z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); }
      // the footprint: furthest foot point in each direction round the foot, smoothed, plus the sole's overhang
      const NB = 48, rad = new Float32Array(NB);
      for (const p of pts) { const a = Math.atan2(p[0] - cx, p[2] - cz), b = ((Math.round(a / (Math.PI * 2) * NB) % NB) + NB) % NB; rad[b] = Math.max(rad[b], Math.hypot(p[0] - cx, p[2] - cz)); }
      for (let it = 0; it < 4; it++) { const r2 = rad.slice(); for (let b = 0; b < NB; b++) rad[b] = Math.max(r2[b], (r2[(b + NB - 1) % NB] + r2[b] * 2 + r2[(b + 1) % NB]) / 4); }
      const len = z1 - z0, y0 = k.soleY - 0.01;
      const ring = (b: number, grow: number) => { const a = b / NB * Math.PI * 2, r = rad[b] + grow; return [cx + Math.sin(a) * r, cz + Math.cos(a) * r]; };
      // profile of the sole: [height above the floor, outward growth] (chunky for trainers, a thin edge for heels and flats)
      const prof: [number, number][] = H > 0.15 ? [[0, 0.05], [0.025, 0.085], [0.17, 0.095], [0.23, 0.08], [0.25, 0.05]]
        : [[0, 0.01], [H * 0.3, 0.025], [H, 0.025], [H + 0.01, 0.005]];
      const P: number[] = [], I: number[] = [];
      for (const [h, gr] of prof) for (let b = 0; b < NB; b++) {
        const [x, z] = ring(b, gr), toe = Math.max(0, (z - z0) / len - 0.72) / 0.28;   // toe spring: the front curls up
        P.push(x, y0 + h + (heel ? 0 : toe * toe * 0.12 * (h < 0.1 ? 1 : 0.4)), z);
      }
      for (let r = 0; r < prof.length - 1; r++) for (let b = 0; b < NB; b++) { const a = r * NB + b, c = r * NB + (b + 1) % NB; I.push(a, c, a + NB, c, c + NB, a + NB); }
      const bot = P.length / 3; P.push(cx, y0, cz); const top = P.length / 3; P.push(cx, y0 + prof[prof.length - 1][0], cz);
      for (let b = 0; b < NB; b++) { I.push(bot, (b + 1) % NB, b); const t0 = (prof.length - 1) * NB; I.push(top, t0 + b, t0 + (b + 1) % NB); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
      out.push({ geo: skinTo(g, fb), color: piece.color2 ?? '#f4f1ea', rough: heel ? 0.5 : 0.75 });
      // the heel itself, under the back of the foot; built tilted so it stands straight once the foot points down
      if (heel > 0.06) {
        const hz = z0 + (sole.post === 'stiletto' ? 0.22 : 0.3), hh = heel + 0.02;
        const post = sole.post === 'stiletto' ? new THREE.CylinderGeometry(0.095, 0.038, hh, 14) : new THREE.CylinderGeometry(0.2, 0.17, hh, 4, 1);
        if (sole.post !== 'stiletto') post.rotateY(Math.PI / 4);
        post.translate(0, -hh / 2, 0);
        post.applyMatrix4(new THREE.Matrix4().makeRotationX(-tilt));
        post.translate(cx, y0 + 0.02, hz);
        post.computeVertexNormals();
        out.push({ geo: skinTo(post, fb), color: piece.color2 ?? '#2a2a2a', rough: 0.4 });
      }
      // laces across the instep: find the top of the foot along its length, a little above the upper
      const L: THREE.BufferGeometry[] = [], az = pts.filter(p => p[1] > k.ankleY - 0.15).reduce((a, p) => Math.max(a, p[2]), -1e9);
      for (let j = 0; j < 5; j++) {
        const z = az - 0.05 + j * (len * 0.42) / 5; let ty = -1e9;
        for (const p of pts) if (Math.abs(p[2] - z) < 0.06 && Math.abs(p[0] - cx) < 0.2) ty = Math.max(ty, p[1]);
        if (ty < -1e8) continue;
        const bx = new THREE.BoxGeometry(0.34 - j * 0.02, 0.02, 0.045); bx.rotateX(0.35 + j * 0.1); bx.translate(cx, ty + 0.13, z);
        L.push(bx.toNonIndexed());
      }
      if (L.length && sole.laces) { const lg = mergePlain(L); out.push({ geo: skinTo(lg, fb), color: piece.color2 === piece.color ? '#2a2a2a' : '#f6f6f2', rough: 0.85 }); }
    }
  }
  if (piece.extra === 'hood') {
    // the hood lies folded on her upper back and round the sides of the neck, meeting in a V at the front
    const prof = bodyProfile(m, pos, k), at = (yy: number) => Math.max(0, Math.min(prof.rx.length - 1, Math.floor((yy - prof.y0) / prof.dy)));
    const y = k.neckY - 0.12, b = at(y), rx = prof.rx[b], rz = prof.rz[b], czz = prof.cz[b], spine = m.boneIndex('spine01');
    const pts: THREE.Vector3[] = [], A = 0.8 * Math.PI, SEG = 40, H = Math.PI / 2;
    const backOf = (a: number) => Math.max(0, Math.cos(a / (A / H)));          // 1 at the back, 0 at the front ends
    for (let i = 0; i <= SEG; i++) {
      const a = -A + (2 * A * i) / SEG, back = backOf(a), front = Math.max(0, (Math.abs(a) - H) / (A - H));
      const off = 0.26 + 0.34 * back, side = 1 - back - front;         // the sides lie flat round the base of the neck
      pts.push(new THREE.Vector3(Math.sin(a) * (rx + off) * (1 - front * 0.35), y - 0.04 - 0.12 * side - 0.45 * back * back - 0.6 * front, czz - Math.cos(a) * (rz + off) + front * 0.15));
    }
    const curve = new THREE.CatmullRomCurve3(pts), tube = new THREE.TubeGeometry(curve, SEG * 2, 1, 14, false), tp = tube.attributes.position as THREE.BufferAttribute;
    const c = new THREE.Vector3(), v = new THREE.Vector3();
    for (let s2 = 0; s2 <= SEG * 2; s2++) {
      const t = s2 / (SEG * 2), a = -A + 2 * A * t, back = backOf(a);
      curve.getPointAt(t, c);
      const thick = 0.1 + 0.16 * back, wide = 0.13 + 0.5 * back;       // a flattened roll: thick and wide at the back
      const outward = new THREE.Vector3(c.x, 0, c.z - czz).normalize();
      for (let r2 = 0; r2 <= 14; r2++) {
        const ix = s2 * 15 + r2; v.fromBufferAttribute(tp, ix).sub(c);      // unit circle round the curve
        const o = v.dot(outward), p = c.clone().addScaledVector(outward, o * thick).add(new THREE.Vector3(0, v.y * wide, 0));
        tp.setXYZ(ix, p.x, p.y, p.z);
      }
    }
    tube.computeVertexNormals();
    out.push({ geo: skinTo(tube, spine), color: piece.color, rough: 0.95, sheen: 0.8 });
    // drawstrings from the front of the hood, hanging down over the chest (outside the hoodie)
    const ds: THREE.BufferGeometry[] = [];
    for (const sg of [-1, 1]) {
      const q: THREE.Vector3[] = [];
      for (let j = 0; j <= 6; j++) {
        const yy = y - 0.5 - j * 0.2, bb = at(yy), x = sg * (0.17 + j * 0.005);
        const zf = prof.cz[bb] + prof.rz[bb] * Math.sqrt(Math.max(0, 1 - (x / (prof.rx[bb] + 0.2)) ** 2)) + 0.27;
        q.push(new THREE.Vector3(x, yy, zf));
      }
      ds.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(q), 24, 0.024, 6, false).toNonIndexed());
      const e = q[q.length - 1], tip = new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8); tip.translate(e.x, e.y - 0.05, e.z); ds.push(tip.toNonIndexed());
    }
    out.push({ geo: skinTo(mergePlain(ds), spine), color: '#f2f2f2', rough: 0.8 });
  }
  for (const e of piece.extras ?? []) out.push(...extra(m, pos, k, e, piece));
  if (piece.wear) {
    const hand = [new THREE.Vector3(-k.elbowJ.x, k.elbowJ.y, k.elbowJ.z), new THREE.Vector3(-k.wristJ.x, k.wristJ.y, k.wristJ.z)];   // her right arm
    for (const wb of wearables(piece.wear, k, bodyProfile(m, pos, k), piece.color, piece.color2, hand)) {
      const bi = m.boneIndex(wb.bone); if (bi < 0) continue;
      out.push({ geo: skinTo(wb.geo, bi), color: wb.color, rough: wb.rough, metal: wb.metal, opacity: wb.opacity });
    }
  }
  return out;
}

/** How far the feet point down in heels of a given height (so the heel stands on the floor and the toes too). */
export function heelTilt(k: Marks, heel: number): number {
  const len = Math.max(1.2, (k.toeZ - k.heelZ) * 0.82);   // heel to the ball of the foot
  return heel > 0.06 ? Math.asin(Math.min(0.8, heel / len)) : 0;
}
/** How much she rises in them: the ball of the foot (not the tip of the toe) stays on the floor. */
export function heelLift(k: Marks, heel: number): number {
  const a = heelTilt(k, heel); if (!a) return 0;
  const bz = k.heelZ + (k.toeZ - k.heelZ) * 0.82 - k.ankleZ, by = k.soleY - k.ankleY;
  return by - (by * Math.cos(a) - bz * Math.sin(a));
}

/** A point on her body's surface at height y (front or back), pushed out by off. */
function onBody(P: Profile, x: number, y: number, front: boolean, off: number): THREE.Vector3 {
  const b = Math.max(0, Math.min(P.rx.length - 1, Math.floor((y - P.y0) / P.dy)));
  const rx = P.rx[b] + off, rz = P.rz[b] + off, u = Math.max(-0.999, Math.min(0.999, x / rx));
  return new THREE.Vector3(x, y, P.cz[b] + (front ? 1 : -1) * rz * Math.sqrt(1 - u * u));
}
/** A strip round her neck/waist: rows at heights ys, round angles from -a0 to a0 (0 = back), pushed out by offs per row. */
function band(P: Profile, ys: number[], offs: number[], a0: number | number[], seg = 48, at?: number): THREE.BufferGeometry {   // at: take her shape at this one height for every row; a0 may differ per row
  const pts: number[] = [], I: number[] = [];
  ys.forEach((y, r) => {
    const b = Math.max(0, Math.min(P.rx.length - 1, Math.floor(((at ?? y) - P.y0) / P.dy))), ar = typeof a0 === 'number' ? a0 : a0[r];
    for (let i = 0; i <= seg; i++) {
      const a = -ar + (2 * ar * i) / seg;
      pts.push(Math.sin(a) * (P.rx[b] + offs[r]), y, P.cz[b] - Math.cos(a) * (P.rz[b] + offs[r]));
    }
  });
  for (let r = 0; r < ys.length - 1; r++) for (let i = 0; i < seg; i++) { const a = r * (seg + 1) + i, c = a + seg + 1; I.push(a, c, a + 1, a + 1, c, c + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setIndex(I); g.computeVertexNormals();
  return g;
}
/** A flat panel lying on the chest through the given corner points (x, y), following her shape. */
function panel(P: Profile, corners: [number, number][], off: number, n = 6): THREE.BufferGeometry {
  const pts: number[] = [], I: number[] = [], c0 = corners.reduce((a, c) => [a[0] + c[0] / corners.length, a[1] + c[1] / corners.length], [0, 0]);
  // a fan of triangles from the middle, each split into a small grid so it bends with her
  for (let t = 0; t < corners.length; t++) {
    const A = c0, B = corners[t], C = corners[(t + 1) % corners.length], base = pts.length / 3, idx: number[][] = [];
    for (let i = 0; i <= n; i++) { idx.push([]); for (let j = 0; j <= n - i; j++) {
      const u = i / n, v = j / n, x = A[0] + (B[0] - A[0]) * u + (C[0] - A[0]) * v, y = A[1] + (B[1] - A[1]) * u + (C[1] - A[1]) * v;
      const p = onBody(P, x, y, true, off); idx[i].push(pts.length / 3); pts.push(p.x, p.y, p.z);
    } }
    void base;
    for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
      I.push(idx[i][j], idx[i + 1][j], idx[i][j + 1]);
      if (j < n - i - 1) I.push(idx[i + 1][j], idx[i + 1][j + 1], idx[i][j + 1]);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setIndex(I); g.computeVertexNormals();
  return g;
}
/** The solid parts of a garment: collars, lapels, roll necks, belts, a bow. */
function extra(m: BodyModel, pos: Float32Array, k: Marks, e: Extra, piece: PieceSpec): Accessory[] {
  const P = bodyProfile(m, pos, k), col = e.color ?? piece.color, rough = piece.rough ?? 0.8, w = e.wide ?? 1;
  const chest = m.boneIndex('spine01'), neck = m.boneIndex('neck01'), waist = m.boneIndex('spine03');
  const ny = k.neckY;
  switch (e.kind) {
    case 'collar': {   // a shirt collar: a band standing round the back of the neck, its points turned down at the front
      // a stand round the neck, then the fall folding down over it (all measured at the neck, so the shoulders
      // don't flare it out into spikes); the front ends taper down into points
      const ys = [ny - 0.14, ny + 0.03, ny + 0.11, ny + 0.06, ny - 0.08, ny - 0.18 * w];
      const offs = [0.02, 0.035, 0.07, 0.11, 0.15, 0.2 * w].map(o => o + e.off * 0.5);
      // the stand stops short of the front; the fall reaches further round, so its front edge slants into a point
      const g = band(P, ys, offs, [0.78, 0.8, 0.81, 0.83, 0.87, 0.92].map(a => a * Math.PI), 64, ny + 0.02);
      const p = g.attributes.position as THREE.BufferAttribute, seg = 65;
      for (let i = 0; i < p.count; i++) {
        const row = Math.floor(i / seg), z = p.getZ(i), x = p.getX(i); if (row < 3) continue;
        // the fall lies out over the slope of her shoulders at the sides
        const side = Math.min(1, Math.abs(x) / (k.headR * 0.9)); p.setX(i, x + Math.sign(x) * (row - 2) * 0.06 * side * side);
        p.setY(i, p.getY(i) - (row - 2) * 0.02 * side);
        if (z < 0.1) continue;
        const f = Math.min(1, (z - 0.1) / 0.5); p.setY(i, p.getY(i) - f * (row - 2) * 0.05 * w);
      }
      g.computeVertexNormals();
      return [{ geo: skinTo(g, neck), color: col, rough }];
    }
    case 'lapels': {   // notched lapels folding back from the neck down to the top button (breakY)
      const by = e.breakY ?? k.bustY, out: Accessory[] = [];
      for (const s of [-1, 1]) {
        const corners: [number, number][] = [[s * 0.32, ny - 0.1], [s * 0.8 * w, ny - 0.5], [s * 0.62 * w, ny - 0.72], [s * 0.86 * w, ny - 0.86], [s * 0.1, by]];
        out.push({ geo: skinTo(panel(P, corners, e.off + 0.07), chest), color: shade(col, 0.88), rough });
      }
      out.push({ geo: skinTo(band(P, [ny - 0.15, ny + 0.08, ny + 0.26], [e.off + 0.03, e.off + 0.1, e.off + 0.22], Math.PI * 0.62), neck), color: shade(col, 0.9), rough });
      return out;
    }
    case 'turtle': case 'puffcollar': case 'neckband': {   // a roll neck / a stand-up padded collar / a ribbed neckband
      const big = e.kind === 'puffcollar', top = e.kind === 'neckband' ? ny - 0.05 : ny + (big ? 0.42 : 0.5);
      const ys = Array.from({ length: 8 }, (_, i) => ny - 0.22 + (top - ny + 0.22) * i / 7);
      const offs = ys.map((_, i) => { const t = i / 7; return e.off + (big ? 0.12 + 0.12 * Math.sin(Math.PI * t) : e.kind === 'neckband' ? -0.03 + 0.03 * Math.sin(Math.PI * t) : 0.04 + 0.1 * Math.sin(Math.PI * t * 0.9)); });
      return [{ geo: skinTo(band(P, ys, offs, Math.PI * 0.999, 64), neck), color: col, rough: e.kind === 'neckband' ? rough : big ? 0.62 : 0.95 }];
    }
    case 'belt': {   // a belt round the waist, with a buckle at the front
      const by = e.breakY ?? k.waistY, ys = [by - 0.1, by + 0.08], g = band(P, ys, [e.off + 0.03, e.off + 0.03], Math.PI * 0.999, 64);
      const fr = onBody(P, 0, by, true, e.off + 0.06), bk = new THREE.BoxGeometry(0.26, 0.24, 0.04); bk.translate(fr.x, fr.y - 0.01, fr.z);
      return [{ geo: skinTo(g, waist), color: col, rough }, { geo: skinTo(bk, waist), color: '#b8a070', rough: 0.35 }];
    }
    case 'bow': {   // a tie at the side of the waist: two loops and two ends
      const at = onBody(P, 0.5, k.waistY, true, e.off + 0.08), parts: THREE.BufferGeometry[] = [];
      for (const s of [-1, 1]) {
        const loop = new THREE.TorusGeometry(0.11, 0.035, 8, 16); loop.scale(1.3, 0.7, 0.4); loop.translate(at.x + s * 0.14, at.y, at.z); parts.push(loop.toNonIndexed());
        const end = new THREE.BoxGeometry(0.08, 0.6, 0.02); end.rotateZ(s * 0.15); end.translate(at.x + s * 0.06, at.y - 0.32, at.z + 0.02); parts.push(end.toNonIndexed());
      }
      const knot = new THREE.SphereGeometry(0.06, 10, 8); knot.translate(at.x, at.y, at.z + 0.02); parts.push(knot.toNonIndexed());
      for (const g of parts) g.computeVertexNormals();
      return [{ geo: skinTo(mergePlain(parts), waist), color: col, rough }];
    }
  }
  return [];
}
/** Merge non-indexed geometries (position + normal only). */
function mergePlain(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const P: number[] = [], N: number[] = [];
  for (const g of gs) { const p = g.attributes.position.array, n = g.attributes.normal.array; for (let i = 0; i < p.length; i++) { P.push(p[i]); N.push(n[i]); } g.dispose(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  return g;
}
