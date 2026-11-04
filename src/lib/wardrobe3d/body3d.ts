// The 3D body: MakeHuman's CC0 base mesh with its shape morphs, skeleton and eyes, packed by
// scripts/build_body3d.py into /models/body3d. Everything here is plain math on typed arrays;
// the three.js scene lives in components/wardrobe/Avatar3D.tsx.

type Arr = { off: number; len: number; type: string };
interface MorphEnd { i: string; d: string; scale: number }
interface Json {
  n: number; nt: number; arrays: Record<string, Arr>; groups: string[];
  morphs: { name: string; lo?: MorphEnd; hi?: MorphEnd }[];
  bones: { name: string; parent: number; head: number[]; tail: number[] }[];
  eyeScale: Record<'x' | 'y' | 'z', [number, number, number]>;
}
const VIEW: Record<string, (b: ArrayBuffer, o: number, l: number) => ArrayLike<number>> = {
  float32: (b, o, l) => new Float32Array(b, o, l), uint32: (b, o, l) => new Uint32Array(b, o, l),
  uint8: (b, o, l) => new Uint8Array(b, o, l), int16: (b, o, l) => new Int16Array(b, o, l),
};

export interface Morph { name: string; lo?: { i: Uint32Array; d: Int16Array; s: number }; hi?: { i: Uint32Array; d: Int16Array; s: number } }

// Two levels of vertices: the ORIGINAL MakeHuman mesh (morphs, joints and the eye fitting work on it), and the
// smooth SURFACE, one Catmull-Clark subdivision of it, which is what gets drawn. The subdivision is linear, so it is
// kept as a sparse stencil (each surface vertex = a weighted sum of original vertices) and re-applied after shaping.
// "Vertex" below means a surface vertex unless it says original.
export class BodyModel {
  readonly n: number;                 // original vertices
  readonly ns: number;                // surface vertices
  readonly nr: number;                // render vertices (surface vertices split at UV seams)
  readonly base: Float32Array;        // original
  readonly rmap: Uint32Array;         // render vertex -> surface vertex
  readonly uv: Float32Array;
  readonly groups: Record<string, Uint32Array> = {};
  readonly ofaces: Uint32Array;       // triangles on surface vertices
  readonly skinIndex: Uint8Array;     // per surface vertex
  readonly skinWeight: Float32Array;
  private readonly st: { row: Uint32Array; col: Uint32Array; w: Float32Array };
  readonly morphs = new Map<string, Morph>();
  readonly bones: Json['bones'];
  readonly eye: { refI: Uint32Array; refW: Float32Array; refO: Float32Array; rmap: Uint32Array; uv: Float32Array; idx: Uint32Array; scale: Json['eyeScale'] };

  constructor(j: Json, bin: ArrayBuffer) {
    const get = <T,>(k: string) => { const a = j.arrays[k]; return VIEW[a.type](bin, a.off, a.len) as unknown as T; };
    this.n = j.n;
    this.base = get('base');
    const quads: Record<string, Uint32Array> = {};
    for (const g of j.groups) quads[g] = get('q_' + g);
    const sd = subdivide(this.n, get<Float32Array>('vt'), j.nt, quads);
    this.ns = sd.ns; this.nr = sd.rmap.length; this.rmap = sd.rmap; this.uv = sd.uv; this.ofaces = sd.ofaces; this.st = sd.st;
    Object.assign(this.groups, sd.groups);
    // skin weights carried through the stencil, keeping the strongest four bones
    const oi = get<Uint8Array>('skinIndex'), ow = get<Float32Array>('skinWeight');
    this.skinIndex = new Uint8Array(this.ns * 4); this.skinWeight = new Float32Array(this.ns * 4);
    const acc = new Float32Array(256), used: number[] = [];
    for (let v = 0; v < this.ns; v++) {
      for (let e = sd.st.row[v]; e < sd.st.row[v + 1]; e++) {
        const o = sd.st.col[e] * 4, wt = sd.st.w[e];
        for (let k = 0; k < 4; k++) { const b = oi[o + k], x = ow[o + k] * wt; if (!x) continue; if (!acc[b]) used.push(b); acc[b] += x; }
      }
      used.sort((a, b) => acc[b] - acc[a]);
      let sum = 0; for (let k = 0; k < 4 && k < used.length; k++) sum += acc[used[k]];
      for (let k = 0; k < 4 && k < used.length; k++) { this.skinIndex[v * 4 + k] = used[k]; this.skinWeight[v * 4 + k] = acc[used[k]] / (sum || 1); }
      for (const b of used) acc[b] = 0; used.length = 0;
    }
    for (const m of j.morphs) {
      const end = (e?: MorphEnd) => e && { i: get<Uint32Array>(e.i), d: get<Int16Array>(e.d), s: e.scale };
      this.morphs.set(m.name, { name: m.name, lo: end(m.lo), hi: end(m.hi) });
    }
    this.bones = j.bones;
    this.eye = { refI: get('eye_refs_i'), refW: get('eye_refs_w'), refO: get('eye_refs_o'), rmap: get('eye_rmap'), uv: get('eye_uv'), idx: get('eye_idx'), scale: j.eyeScale };
  }

  /** Shape the body: values are -1..1 per morph (0 = average). Returns original-vertex positions. */
  shape(values: Record<string, number>, out = new Float32Array(this.base.length)): Float32Array {
    out.set(this.base);
    for (const [name, v] of Object.entries(values)) {
      if (!v) continue;
      const m = this.morphs.get(name);
      const e = v < 0 ? m?.lo : m?.hi;
      if (!e) continue;
      const k = Math.abs(v) * e.s;
      for (let j = 0; j < e.i.length; j++) {
        const o = e.i[j] * 3;
        out[o] += e.d[j * 3] * k; out[o + 1] += e.d[j * 3 + 1] * k; out[o + 2] += e.d[j * 3 + 2] * k;
      }
    }
    return out;
  }

  /** Original positions -> smooth surface positions. */
  surface(pos: Float32Array, out = new Float32Array(this.ns * 3)): Float32Array {
    const { row, col, w } = this.st;
    for (let v = 0; v < this.ns; v++) {
      let x = 0, y = 0, z = 0;
      for (let e = row[v]; e < row[v + 1]; e++) { const o = col[e] * 3, k = w[e]; x += pos[o] * k; y += pos[o + 1] * k; z += pos[o + 2] * k; }
      out[v * 3] = x; out[v * 3 + 1] = y; out[v * 3 + 2] = z;
    }
    return out;
  }

  /** Smooth normals on the surface topology (no creases along UV seams). */
  normals(pos: Float32Array): Float32Array {
    const nrm = new Float32Array(pos.length), f = this.ofaces;
    for (let t = 0; t < f.length; t += 3) {
      const a = f[t] * 3, b = f[t + 1] * 3, c = f[t + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const o of [a, b, c]) { nrm[o] += nx; nrm[o + 1] += ny; nrm[o + 2] += nz; }
    }
    for (let o = 0; o < nrm.length; o += 3) {
      const l = Math.hypot(nrm[o], nrm[o + 1], nrm[o + 2]) || 1;
      nrm[o] /= l; nrm[o + 1] /= l; nrm[o + 2] /= l;
    }
    return nrm;
  }

  /** Spread per-surface-vertex data (k values each) onto render vertices. */
  expand<T extends Float32Array | Uint8Array | Uint16Array>(src: T, k: number, Ctor: { new (n: number): T }): T {
    const out = new Ctor(this.nr * k);
    for (let r = 0; r < this.nr; r++) { const o = this.rmap[r] * k; for (let c = 0; c < k; c++) out[r * k + c] = src[o + c]; }
    return out;
  }

  /** Joint position: the mean of its marker vertices. */
  joint(pos: Float32Array, verts: number[]): [number, number, number] {
    let x = 0, y = 0, z = 0;
    for (const v of verts) { x += pos[v * 3]; y += pos[v * 3 + 1]; z += pos[v * 3 + 2]; }
    return [x / verts.length, y / verts.length, z / verts.length];
  }
  boneIndex(name: string) { return this.bones.findIndex(b => b.name === name); }

  /** Fit the eyeball proxy to the (shaped) helper vertices. */
  eyes(pos: Float32Array): Float32Array {
    const { refI, refW, refO, rmap, scale } = this.eye;
    const d = (a: number, b: number) => Math.abs(pos[a * 3] - pos[b * 3]) + Math.abs(pos[a * 3 + 1] - pos[b * 3 + 1]) + Math.abs(pos[a * 3 + 2] - pos[b * 3 + 2]);
    const axis = (k: 'x' | 'y' | 'z', c: number) => { const [a, b, s] = scale[k]; return Math.abs(pos[a * 3 + c] - pos[b * 3 + c]) / s || d(a, b) / s; };
    const sx = axis('x', 0), sy = axis('y', 1), sz = axis('z', 2);
    const nv = refW.length / 3, pv = new Float32Array(nv * 3);
    for (let v = 0; v < nv; v++) {
      for (let c = 0; c < 3; c++) {
        let p = 0;
        for (let r = 0; r < 3; r++) p += refW[v * 3 + r] * pos[refI[v * 3 + r] * 3 + c];
        pv[v * 3 + c] = p + refO[v * 3 + c] * [sx, sy, sz][c];
      }
    }
    const out = new Float32Array(rmap.length * 3);
    for (let r = 0; r < rmap.length; r++) for (let c = 0; c < 3; c++) out[r * 3 + c] = pv[rmap[r] * 3 + c];
    return out;
  }
}

/**
 * One level of Catmull-Clark subdivision of the quad groups, as a stencil on the original vertices, with
 * face-varying UVs (interpolated, so UV seams stay sharp) and render vertices split wherever UVs differ.
 * quads: per group, 4 corners per face, each (original vertex, uv index).
 */
function subdivide(n: number, VT: Float32Array, nt: number, quads: Record<string, Uint32Array>) {
  const names = Object.keys(quads);
  let nq = 0; for (const g of names) nq += quads[g].length / 8;
  const qv = new Uint32Array(nq * 4), qt = new Uint32Array(nq * 4), qg = new Uint8Array(nq);
  { let q = 0; names.forEach((g, gi) => { const a = quads[g]; for (let i = 0; i < a.length; i += 8, q++) { for (let c = 0; c < 4; c++) { qv[q * 4 + c] = a[i + c * 2]; qt[q * 4 + c] = a[i + c * 2 + 1]; } qg[q] = gi; } }); }
  // original vertices in use -> surface vertex ids [0, nv)
  const vid = new Int32Array(n).fill(-1), vorig: number[] = [];
  for (let i = 0; i < qv.length; i++) if (vid[qv[i]] < 0) { vid[qv[i]] = vorig.length; vorig.push(qv[i]); }
  const nv = vorig.length;
  // edges, each with up to two faces
  const emap = new Map<number, number>(), ea: number[] = [], eb: number[] = [], ef0: number[] = [], ef1: number[] = [], qe = new Uint32Array(nq * 4);
  for (let q = 0; q < nq; q++) for (let c = 0; c < 4; c++) {
    const a = qv[q * 4 + c], b = qv[q * 4 + (c + 1) % 4], key = Math.min(a, b) * n + Math.max(a, b);
    let e = emap.get(key);
    if (e === undefined) { e = ea.length; emap.set(key, e); ea.push(a); eb.push(b); ef0.push(q); ef1.push(-1); } else if (ef1[e] < 0) ef1[e] = q;
    qe[q * 4 + c] = e;
  }
  const ne = ea.length;
  // per original vertex: its edges (interior rule) and boundary neighbours (boundary rule)
  const vEdges: number[][] = Array.from({ length: nv }, () => []), vFaces: number[][] = Array.from({ length: nv }, () => []);
  for (let e = 0; e < ne; e++) { vEdges[vid[ea[e]]].push(e); vEdges[vid[eb[e]]].push(e); }
  for (let q = 0; q < nq; q++) for (let c = 0; c < 4; c++) vFaces[vid[qv[q * 4 + c]]].push(q);
  // stencil rows: vertex points, then edge points, then face points
  const ns = nv + ne + nq, row = new Uint32Array(ns + 1), col: number[] = [], w: number[] = [];
  const put = (v: number, k: number) => { col.push(v); w.push(k); };
  const face = (q: number, k: number) => { for (let c = 0; c < 4; c++) put(qv[q * 4 + c], k); };
  for (let i = 0; i < nv; i++) {
    row[i] = col.length;
    const P = vorig[i], es = vEdges[i], bnd = es.filter(e => ef1[e] < 0);
    if (bnd.length === 2) { put(P, 0.75); for (const e of bnd) put(ea[e] === P ? eb[e] : ea[e], 0.125); }
    else if (bnd.length) put(P, 1);
    else {
      const k = es.length;
      put(P, (k - 2) / k);
      for (const e of es) put(ea[e] === P ? eb[e] : ea[e], 1 / (k * k));
      for (const q of vFaces[i]) face(q, 1 / (4 * k * k));
    }
  }
  for (let e = 0; e < ne; e++) {
    row[nv + e] = col.length;
    if (ef1[e] < 0) { put(ea[e], 0.5); put(eb[e], 0.5); }
    else { put(ea[e], 0.25); put(eb[e], 0.25); face(ef0[e], 1 / 16); face(ef1[e], 1 / 16); }
  }
  for (let q = 0; q < nq; q++) { row[nv + ne + q] = col.length; face(q, 0.25); }
  row[ns] = col.length;
  // new faces and render vertices
  const rmap: number[] = [], uv: number[] = [], vkey = new Map<number, number>();
  const eR0 = new Int32Array(ne).fill(-1), eT0 = new Int32Array(ne * 2);
  const addR = (sv: number, u: number, vv: number) => { rmap.push(sv); uv.push(u, vv); return rmap.length - 1; };
  const groups: Record<string, number[]> = Object.fromEntries(names.map(g => [g, []]));
  const ofaces: number[] = [];
  const cR = [0, 0, 0, 0], eR = [0, 0, 0, 0], cS = [0, 0, 0, 0], eS = [0, 0, 0, 0];
  for (let q = 0; q < nq; q++) {
    let fu = 0, fv = 0;
    for (let c = 0; c < 4; c++) {
      const v = qv[q * 4 + c], t = qt[q * 4 + c], key = vid[v] * nt + t;
      let r = vkey.get(key); if (r === undefined) { r = addR(vid[v], VT[t * 2], VT[t * 2 + 1]); vkey.set(key, r); }
      cR[c] = r; cS[c] = vid[v]; fu += VT[t * 2] / 4; fv += VT[t * 2 + 1] / 4;
    }
    for (let c = 0; c < 4; c++) {
      const e = qe[q * 4 + c], ta = qt[q * 4 + c], tb = qt[q * 4 + (c + 1) % 4], lo = Math.min(ta, tb), hi = Math.max(ta, tb);
      let r: number;
      if (eR0[e] >= 0 && eT0[e * 2] === lo && eT0[e * 2 + 1] === hi) r = eR0[e];
      else { r = addR(nv + e, (VT[ta * 2] + VT[tb * 2]) / 2, (VT[ta * 2 + 1] + VT[tb * 2 + 1]) / 2); if (eR0[e] < 0) { eR0[e] = r; eT0[e * 2] = lo; eT0[e * 2 + 1] = hi; } }
      eR[c] = r; eS[c] = nv + e;
    }
    const fR = addR(nv + ne + q, fu, fv), fS = nv + ne + q, gi = groups[names[qg[q]]];
    for (let c = 0; c < 4; c++) {
      const p = (c + 3) % 4;
      gi.push(cR[c], eR[c], fR, cR[c], fR, eR[p]);
      ofaces.push(cS[c], eS[c], fS, cS[c], fS, eS[p]);
    }
  }
  return {
    ns, rmap: Uint32Array.from(rmap), uv: Float32Array.from(uv), ofaces: Uint32Array.from(ofaces),
    groups: Object.fromEntries(names.map(g => [g, Uint32Array.from(groups[g])])) as Record<string, Uint32Array>,
    st: { row, col: Uint32Array.from(col), w: Float32Array.from(w) },
  };
}

let cached: Promise<BodyModel> | null = null;
export function loadBody(): Promise<BodyModel> {
  cached ??= (async () => {
    const [j, bin] = await Promise.all([
      fetch('/models/body3d/body3d.json').then(r => { if (!r.ok) throw new Error('body data'); return r.json(); }),
      fetch('/models/body3d/body3d.bin').then(r => { if (!r.ok) throw new Error('body data'); return r.arrayBuffer(); }),
    ]);
    return new BodyModel(j, bin);
  })().catch(e => { cached = null; throw e; });
  return cached;
}
