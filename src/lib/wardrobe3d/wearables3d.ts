// The small things she wears in 3D: hats, glasses, earrings, necklaces and bags. Each is solid geometry built round
// her landmarks in the rest pose and fixed to one bone (her head, neck, chest, hips or hand), so it moves with her.
import * as THREE from 'three';
import type { Marks, Profile } from './build3d';

export interface Wearable { geo: THREE.BufferGeometry; bone: string; color: string; rough: number; metal?: number; opacity?: number }
export type WearableKind = 'beanie' | 'cap' | 'bucket-hat' | 'headband' | 'sunglasses' | 'glasses' | 'hoops' | 'studs' | 'drops'
  | 'necklace' | 'pearls' | 'choker' | 'handbag' | 'crossbody' | 'tote';

const shade = (hex: string, k: number) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
const merge = (gs: THREE.BufferGeometry[]) => {
  const P: number[] = [], N: number[] = [];
  for (const g0 of gs) { const g = g0.index ? g0.toNonIndexed() : g0; g.computeVertexNormals(); const p = g.attributes.position.array, n = g.attributes.normal.array; for (let i = 0; i < p.length; i++) { P.push(p[i]); N.push(n[i]); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  return g;
};
/** A point on her body's surface (the stack of ellipses in P) at height y and angle a round her (0 = front), pushed out by off. */
function round(P: Profile, y: number, a: number, off: number): THREE.Vector3 {
  const b = Math.max(0, Math.min(P.rx.length - 1, Math.floor((y - P.y0) / P.dy)));
  return new THREE.Vector3(Math.sin(a) * (P.rx[b] + off), y, P.cz[b] + Math.cos(a) * (P.rz[b] + off));
}

/** A crown that fits her head: rim at height yb, top just above her head (or her hair), radius about her head's. */
function crown(k: Marks, yb: number, lift: number, grow: number, segs = 40): THREE.BufferGeometry {
  const R = k.headR * grow, g = new THREE.SphereGeometry(R, segs, 18, 0, Math.PI * 2, 0, Math.PI * 0.5);
  g.scale(1, (k.headTop + lift - yb) / R, 1.06); g.translate(k.head.x, yb, k.head.z - k.headR * 0.06);
  return g;
}

export function wearables(kind: WearableKind, k: Marks, P: Profile, color: string, color2 = '#d9b45a', hand: THREE.Vector3[] = []): Wearable[] {
  const C = k.head, R = k.headR, gold = '#d9b45a', eyeY = k.eye.y + 0.02;
  const faceZ = k.eye.z + 0.16, earX = k.earX, earY = k.eye.y - 0.42, earZ = k.eye.z - 0.62;
  switch (kind) {
    // ─── hats (over the hair: a little bigger than her head) ───
    case 'beanie': {
      const g = crown(k, eyeY + 0.32, 0.22, 1.1);
      const cuff = new THREE.CylinderGeometry(R * 1.09, R * 1.11, 0.3, 40, 1, true); cuff.scale(1, 1, 1.05); cuff.translate(C.x, eyeY + 0.38, C.z - R * 0.06);
      return [{ geo: merge([g]), bone: 'head', color, rough: 0.97 }, { geo: merge([cuff]), bone: 'head', color: shade(color, 0.9), rough: 0.97 }];
    }
    case 'cap': {
      const g = crown(k, eyeY + 0.3, 0.12, 1.07);
      const brim = new THREE.CylinderGeometry(R * 0.8, R * 0.8, 0.03, 32, 1, false, -Math.PI / 2, Math.PI); brim.scale(1, 1, 1.5);
      brim.rotateX(0.15); brim.translate(C.x, eyeY + 0.31, C.z + R * 0.62);
      const btn = new THREE.SphereGeometry(0.035, 8, 6); btn.translate(C.x, k.headTop + 0.12, C.z - R * 0.06);
      return [{ geo: merge([g, btn]), bone: 'head', color, rough: 0.85 }, { geo: merge([brim]), bone: 'head', color: shade(color, 0.85), rough: 0.8 }];
    }
    case 'bucket-hat': {
      const g = crown(k, eyeY + 0.3, 0.12, 1.1);
      const brim = new THREE.CylinderGeometry(R * 1.1, R * 1.55, R * 0.3, 48, 1, true); brim.translate(C.x, eyeY + 0.2, C.z - R * 0.06);
      return [{ geo: merge([g, brim]), bone: 'head', color, rough: 0.92 }];
    }
    case 'headband': {
      const g = new THREE.TorusGeometry(R * 1.04, 0.05, 10, 48, Math.PI * 1.25); g.rotateY(Math.PI / 2); g.rotateZ(Math.PI / 2 - Math.PI * 0.625 + Math.PI / 2);
      g.rotateX(-0.25); g.translate(C.x, C.y + R * 0.15, C.z + R * 0.05);
      return [{ geo: merge([g]), bone: 'head', color, rough: 0.6 }];
    }
    // ─── glasses ───
    case 'sunglasses': case 'glasses': {
      const sun = kind === 'sunglasses', fr: THREE.BufferGeometry[] = [], lens: THREE.BufferGeometry[] = [];
      const ex = k.eye.x, lw = sun ? 0.27 : 0.23, lh = sun ? 0.2 : 0.16, z = faceZ;
      for (const s of [-1, 1]) {
        const ring = new THREE.TorusGeometry(1, 0.08, 6, 28); ring.scale(lw, lh, lw * 0.6); ring.translate(C.x + s * ex, eyeY, z); fr.push(ring);
        const l = new THREE.CircleGeometry(1, 28); l.scale(lw, lh, 1); l.translate(C.x + s * ex, eyeY, z - 0.005); lens.push(l);
        const arm = new THREE.BoxGeometry(0.03, 0.035, z - earZ); arm.translate(C.x + s * (earX * 0.97), eyeY + lh * 0.3, (z + earZ) / 2); fr.push(arm);
      }
      const bridge = new THREE.TorusGeometry(ex - lw, 0.025, 6, 12, Math.PI); bridge.translate(C.x, eyeY + lh * 0.2, z); fr.push(bridge);
      return [{ geo: merge(fr), bone: 'head', color: sun ? '#141414' : color, rough: 0.35, metal: sun ? 0 : 0.3 },
        { geo: merge(lens), bone: 'head', color: sun ? '#1a1410' : '#ffffff', rough: 0.05, opacity: sun ? 0.82 : 0.12 }];
    }
    // ─── earrings (at each earlobe) ───
    case 'hoops': case 'studs': case 'drops': {
      const parts: THREE.BufferGeometry[] = [];
      for (const s of [-1, 1]) {
        const x = C.x + s * earX * 0.95, y = earY;
        if (kind === 'hoops') { const h = new THREE.TorusGeometry(0.24, 0.02, 8, 32); h.rotateY(Math.PI / 2); h.translate(x + s * 0.03, y - 0.24, earZ); parts.push(h); }
        if (kind === 'studs') { const st = new THREE.SphereGeometry(0.05, 12, 8); st.translate(x + s * 0.02, y, earZ); parts.push(st); }
        if (kind === 'drops') {
          const st = new THREE.SphereGeometry(0.025, 10, 8); st.translate(x + s * 0.01, y, earZ); parts.push(st);
          const wire = new THREE.CylinderGeometry(0.008, 0.008, 0.18, 6); wire.translate(x + s * 0.015, y - 0.1, earZ); parts.push(wire);
          const d = new THREE.SphereGeometry(0.055, 14, 10); d.scale(1, 1.4, 1); d.translate(x + s * 0.015, y - 0.25, earZ); parts.push(d);
        }
      }
      return [{ geo: merge(parts), bone: 'head', color: color2 === '#ffffff' ? gold : color, rough: 0.2, metal: 1 }];
    }
    // ─── necklaces (lying on her neck and chest) ───
    case 'necklace': case 'pearls': case 'choker': {
      const choker = kind === 'choker', y0 = choker ? k.neckY + 0.12 : k.neckY - 0.15, drop = choker ? 0 : kind === 'pearls' ? 0.55 : 0.9;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 64; i++) {
        const a = -Math.PI + (i / 64) * Math.PI * 2, front = Math.pow(Math.max(0, Math.cos(a)), 2.2), y = y0 - drop * front;
        pts.push(round(P, y, a, choker ? -0.02 + 0.03 * front : 0.05 + 0.12 * front));
      }
      const curve = new THREE.CatmullRomCurve3(pts, true), out: Wearable[] = [];
      if (kind === 'pearls') {
        const beads: THREE.BufferGeometry[] = [];
        for (let i = 0; i < 60; i++) { const b = new THREE.SphereGeometry(0.038, 10, 8); const p = curve.getPointAt(i / 60); b.translate(p.x, p.y, p.z); beads.push(b); }
        out.push({ geo: merge(beads), bone: 'spine01', color: '#f3eee6', rough: 0.18, metal: 0.1 });
      } else {
        out.push({ geo: merge([new THREE.TubeGeometry(curve, 160, choker ? 0.05 : 0.009, choker ? 8 : 5, true)]), bone: choker ? 'neck01' : 'spine01', color: choker ? color : gold, rough: choker ? 0.5 : 0.25, metal: choker ? 0 : 1 });
        if (!choker) { const p = curve.getPointAt(0.5), pend = new THREE.SphereGeometry(0.06, 14, 10); pend.scale(1, 1.25, 0.5); pend.translate(p.x, p.y - 0.07, p.z + 0.02); out.push({ geo: merge([pend]), bone: 'spine01', color, rough: 0.2, metal: 0.6 }); }
      }
      return out;
    }
    // ─── bags ───
    case 'crossbody': {   // small bag on her left hip, strap from her right shoulder across her chest and back
      const bag = new THREE.BoxGeometry(0.8, 0.6, 0.22), bp = round(P, k.hipY + 0.05, Math.PI * 0.45, 0.3); bag.rotateY(Math.PI * 0.45); bag.translate(bp.x, bp.y, bp.z);
      const flap = new THREE.BoxGeometry(0.77, 0.3, 0.03); flap.translate(0, 0.14, 0.12); flap.rotateY(Math.PI * 0.45); flap.translate(bp.x, bp.y, bp.z);
      const strap: THREE.Vector3[] = [];
      for (let i = 0; i <= 24; i++) {   // round her: over the right shoulder, diagonally down the front to the bag, and back up behind
        const t = i / 24, a = -Math.PI * 0.42 + t * Math.PI * 0.87, y = k.neckY - 0.35 + (k.hipY + 0.2 - (k.neckY - 0.35)) * t;
        strap.push(round(P, y, a, 0.12 + 0.2 * t * t));
      }
      const back = strap.slice().reverse().map(p => new THREE.Vector3(p.x, p.y, 2 * (P.cz[Math.max(0, Math.min(P.rx.length - 1, Math.floor((p.y - P.y0) / P.dy)))]) - p.z));
      const sg = merge([new THREE.TubeGeometry(new THREE.CatmullRomCurve3([...strap, ...back], true), 120, 0.03, 5, true)]);
      return [{ geo: merge([bag, flap]), bone: 'spine05', color, rough: 0.45 }, { geo: sg, bone: 'spine01', color: shade(color, 0.8), rough: 0.5 }];
    }
    case 'handbag': case 'tote': {   // held in her right hand (built along her rest-pose arm, so it hangs down once her arm is down)
      const [el, wr] = hand; if (!el || !wr) return [];
      const dir = wr.clone().sub(el).normalize(), big = kind === 'tote', h = big ? 1.4 : 0.85, wdt = big ? 1.3 : 1.0, dp = big ? 0.25 : 0.35;
      const centre = wr.clone().addScaledVector(dir, 0.45 + (big ? 0.55 : 0.25) + h / 2);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir), m = new THREE.Matrix4().compose(centre, q, new THREE.Vector3(1, 1, 1));
      const body = new THREE.BoxGeometry(dp, h, wdt), handle = new THREE.TorusGeometry(big ? 0.45 : 0.3, 0.03, 8, 24, Math.PI);
      handle.rotateY(Math.PI / 2); handle.translate(0, h / 2, 0);
      for (const g of [body, handle]) g.applyMatrix4(m);
      return [{ geo: merge([body]), bone: 'wrist.R', color, rough: big ? 0.8 : 0.4 }, { geo: merge([handle]), bone: 'wrist.R', color: shade(color, 0.8), rough: 0.5 }];
    }
  }
  return [];
}
