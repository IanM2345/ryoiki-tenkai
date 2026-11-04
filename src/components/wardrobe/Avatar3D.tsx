'use client';
// The 3D avatar (test). MakeHuman's CC0 body shaped by her settings, posed with its skeleton,
// lit like a photo studio, with generated clothes and hair. Drag to turn her around.
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { loadBody, type BodyModel } from '@/lib/wardrobe3d/body3d';
import { Drape, legCapsules } from '@/lib/wardrobe3d/drape';
import { signedUrl } from '@/lib/upload';
import { marks, outfits, underwear, closetPieces, garmentGeometry, clothShader, accessories, heelTilt, heelLift, fabricOf, FABRIC_LOOK, clothMaps, foldZones, type PieceSpec, type PhotoFabric, fabricTexture, foldTexture, hairMeshes, scalpWeight, bodyProfile, wearing, type Hair3D, type Marks } from '@/lib/wardrobe3d/build3d';
import type { Look } from '@/lib/wardrobe/body';
import type { ClosetCategory } from '@/lib/db';
import { shapeOf, type Shape3D } from '@/lib/wardrobe3d/shapes3d';
import s from './avatar3d.module.css';

const HEAD_SHAPE: Record<Look['faceShape'], string> = { oval: 'head_oval', round: 'head_round', square: 'head_square', heart: 'head_invertedtriangular', long: 'head_rectangular' };
const c2 = (v: number, k = 1) => (v - 0.5) * 2 * k;
/** Her look -> morph amounts (-1..1). */
export function morphValues(L: Look): Record<string, number> {
  return {
    bust: c2(L.bust, 0.8), cup: c2(L.bust, 0.9), underbust: c2(L.bust, 0.2), waist: c2(L.waist), hips: c2(L.hips), buttocks: c2(L.hips, 0.6),
    thighs: c2(L.thighs), shoulders: c2(L.shoulders, 0.8), [HEAD_SHAPE[L.faceShape]]: 0.7,
    jaw: c2(L.jaw), cheeks: c2(L.cheeks), eyeSize: c2(L.eyeSize, 0.7), eyeGap: c2(L.eyeGap, 0.7), eyeTilt: c2(L.eyeTilt, 0.8),
    noseWidth: c2(L.noseWidth), noseFlare: c2(L.noseWidth, 0.6), upperLip: c2(L.lipFull), lowerLip: c2(L.lipFull), browAngle: c2(L.browArch, 0.6),
  };
}

interface World {
  renderer: THREE.WebGLRenderer; composer: EffectComposer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls;
  root: THREE.Group; model: BodyModel; skin?: THREE.MeshPhysicalMaterial; masks?: HTMLImageElement; eyeImg?: HTMLImageElement;
  body?: THREE.SkinnedMesh; bones?: THREE.Bone[]; skeleton?: THREE.Skeleton; extras: THREE.Object3D[]; hair: THREE.Object3D[];
  marks?: Marks; look?: Look; outfitId?: string | null; drapes?: Drape[]; caps?: ReturnType<typeof legCapsules>; heelA?: number; heelLift?: number; baseY?: number; worn?: PieceSpec[]; worn3d?: Worn3D[]; pos?: Float32Array; sp?: Float32Array; nrm?: Float32Array; /* pos: original vertices, sp/nrm: the smooth surface */ raf: number; t0: number;
}

const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

/** Skin colour map: her tone, lips, a little colour on the lids and nails, brows, and pore-level noise. */
function skinTexture(m: BodyModel, L: Look, masks: HTMLImageElement, pos: Float32Array, sp: Float32Array, k: Marks): THREE.CanvasTexture {
  const S = 2048, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(masks, 0, 0, S, S);
  const mk = g.getImageData(0, 0, S, S).data, out = g.createImageData(S, S), d = out.data;
  // colours stay in sRGB here (the canvas is sRGB)
  const hx = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
  const sk = hx(L.skin), lip = hx(L.lips), nail = mix(sk, [243, 212, 207], 0.5), lid = sk.map(v => v * 0.8);
  for (let i = 0; i < S * S; i++) {
    const lr = mk[i * 4] / 255, lg = mk[i * 4 + 1] / 255, lb = mk[i * 4 + 2] / 255, n = 1 + (Math.random() - 0.5) * 0.05;
    const col = mix(mix(mix(sk, lid, lg * 0.7), nail, lb * 0.8), lip, lr * 0.92);
    d[i * 4] = col[0] * n; d[i * 4 + 1] = col[1] * n; d[i * 4 + 2] = col[2] * n; d[i * 4 + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  // eyebrows: a soft arch above each eye, painted onto the skin texture triangle by triangle
  const ep = m.eyes(pos), nv = ep.length / 3;
  const eyeC = [0, 1].map(side => { let x = 0, y = 0, z = 0, n = 0; for (let v = 0; v < nv; v++) if ((ep[v * 3] > 0) === (side === 1)) { x += ep[v * 3]; y += ep[v * 3 + 1]; z += ep[v * 3 + 2]; n++; } return [x / n, y / n, z / n]; });
  const thick = 0.025 + L.browThick * 0.03, arch = 0.025 + L.browArch * 0.06;
  const browW = (x: number, y: number, z: number) => {
    const e = eyeC[x > 0 ? 1 : 0], u = (Math.abs(x) - Math.abs(e[0]) + 0.2) / 0.52;   // 0 = inner end, 1 = tail
    if (u < 0 || u > 1 || z < e[2] - 0.15) return 0;
    const cy = e[1] + 0.21 + Math.sin(Math.min(1, u * 1.35) * Math.PI) * arch - u * 0.03;
    const th = thick * (1.15 - u * 0.7);
    const dist = Math.abs(y - cy) / th;
    return dist < 1 ? (1 - dist * dist) * (u < 0.08 ? u / 0.08 : 1) : 0;
  };
  const bi = m.groups.body, wv = new Float32Array(m.nr), sv = new Float32Array(m.nr);
  for (let r = 0; r < m.nr; r++) {
    const o = m.rmap[r] * 3; wv[r] = browW(sp[o], sp[o + 1], sp[o + 2]);
    sv[r] = sp[o + 1] > k.chinY - 0.8 ? scalpWeight(k, sp[o], sp[o + 1], sp[o + 2]) : 0;
  }
  // scalp: hair colour on the skin under the hair, fading out at the hairline
  const sc = document.createElement('canvas'); sc.width = sc.height = S;
  const sg = sc.getContext('2d')!; sg.fillStyle = L.hairColor;
  for (let t = 0; t < bi.length; t += 3) {
    const wt = (sv[bi[t]] + sv[bi[t + 1]] + sv[bi[t + 2]]) / 3;
    if (wt <= 0.02) continue;
    sg.globalAlpha = Math.min(1, wt);
    sg.beginPath();
    for (const [i, v] of [bi[t], bi[t + 1], bi[t + 2]].entries()) { const X = m.uv[v * 2] * S, Y = (1 - m.uv[v * 2 + 1]) * S; if (i) sg.lineTo(X, Y); else sg.moveTo(X, Y); }
    sg.closePath(); sg.fill();
  }
  g.filter = 'blur(2.5px)'; g.drawImage(sc, 0, 0); g.filter = 'none';
  const bc = document.createElement('canvas'); bc.width = bc.height = S;
  const bg = bc.getContext('2d')!; bg.fillStyle = L.hairColor;
  for (let t = 0; t < bi.length; t += 3) {
    const a = bi[t], b = bi[t + 1], cc = bi[t + 2], wt = (wv[a] + wv[b] + wv[cc]) / 3;
    if (wt <= 0.02) continue;
    bg.globalAlpha = Math.min(0.95, wt * 1.3);
    bg.beginPath();
    for (const [i, v] of [a, b, cc].entries()) { const X = m.uv[v * 2] * S, Y = (1 - m.uv[v * 2 + 1]) * S; if (i) bg.lineTo(X, Y); else bg.moveTo(X, Y); }
    bg.closePath(); bg.fill();
  }
  // the soft base of the brows (a shadow under the hairs)
  g.globalAlpha = 0.55; g.filter = 'blur(3px) brightness(0.9)'; g.drawImage(bc, 0, 0); g.filter = 'none'; g.globalAlpha = 1;
  // colour in the face, as on real skin: warmth on the cheeks, nose and ears, a little shadow under the eyes
  const paint = (wf: (x: number, y: number, z: number) => number, colour: string, alpha: number, blur: number) => {
    const pc = document.createElement('canvas'); pc.width = pc.height = S;
    const pg = pc.getContext('2d')!; pg.fillStyle = colour;
    const wr = new Float32Array(m.nr);
    for (let r = 0; r < m.nr; r++) { const o = m.rmap[r] * 3; wr[r] = sp[o + 1] > k.chinY - 0.3 ? wf(sp[o], sp[o + 1], sp[o + 2]) : 0; }
    for (let t = 0; t < bi.length; t += 3) {
      const wt = (wr[bi[t]] + wr[bi[t + 1]] + wr[bi[t + 2]]) / 3; if (wt <= 0.01) continue;
      pg.globalAlpha = Math.min(1, wt); pg.beginPath();
      for (const [i, v] of [bi[t], bi[t + 1], bi[t + 2]].entries()) { const X = m.uv[v * 2] * S, Y = (1 - m.uv[v * 2 + 1]) * S; if (i) pg.lineTo(X, Y); else pg.moveTo(X, Y); }
      pg.closePath(); pg.fill();
    }
    g.globalAlpha = alpha; g.filter = `blur(${blur}px)`; g.drawImage(pc, 0, 0); g.filter = 'none'; g.globalAlpha = 1;
  };
  const blob = (cx: number, cy: number, cz: number, r: number) => (x: number, y: number, z: number) => { const d = Math.hypot(Math.abs(x) - cx, y - cy, (z - cz) * 0.6) / r; return d < 1 ? (1 - d * d) ** 2 : 0; };
  const eL = eyeC[1], fz = k.headFront;
  const warm = `rgb(${Math.round(sk[0] * 1.05 + 20)},${Math.round(sk[1] * 0.78)},${Math.round(sk[2] * 0.72)})`;
  if (L.blush) paint(blob(Math.abs(eL[0]) + 0.05, eL[1] - 0.33, fz - 0.35, 0.42), warm, 0.5, 10);
  paint(blob(0, eL[1] - 0.45, fz, 0.22), warm, 0.35, 8);                                         // nose tip
  paint(blob(Math.abs(eL[0]), eL[1] - 0.1, eL[2] + 0.05, 0.2), `rgb(${sk.map(v => Math.round(v * 0.72)).join(',')})`, 0.4, 6);   // under the eyes
  paint((x, y, z) => (z < k.head.z && y > eL[1] - 0.6 && y < eL[1] + 0.3 && Math.abs(x) > k.headR * 0.75 ? 0.8 : 0), warm, 0.35, 8);   // ears
  // eyebrow hairs, stroke by stroke. The brow area is nearly flat in the texture, so a straight-line fit maps
  // her face (x, y) to texture (u, v) there.
  for (const side of [-1, 1]) {
    const e = eyeC[side > 0 ? 1 : 0], pts: number[][] = [];
    for (let r = 0; r < m.nr; r++) {
      const o = m.rmap[r] * 3, x = sp[o], y = sp[o + 1], z = sp[o + 2];
      if (Math.sign(x) !== side || Math.abs(Math.abs(x) - Math.abs(e[0])) > 0.45 || Math.abs(y - e[1] - 0.22) > 0.25 || z < e[2] - 0.1) continue;
      pts.push([x, y, m.uv[r * 2] * S, (1 - m.uv[r * 2 + 1]) * S]);
    }
    if (pts.length < 6) continue;
    const fit = (col: number) => {   // least squares: value = a x + b y + c
      let sxx = 0, sxy = 0, syy = 0, sx = 0, sy = 0, n = 0, sxv = 0, syv = 0, sv = 0;
      for (const q of pts) { sxx += q[0] * q[0]; sxy += q[0] * q[1]; syy += q[1] * q[1]; sx += q[0]; sy += q[1]; n++; sxv += q[0] * q[col]; syv += q[1] * q[col]; sv += q[col]; }
      const M = new THREE.Matrix3().set(sxx, sxy, sx, sxy, syy, sy, sx, sy, n).invert(), v = new THREE.Vector3(sxv, syv, sv).applyMatrix3(M);
      return (x: number, y: number) => v.x * x + v.y * y + v.z;
    };
    const fu = fit(2), fv = fit(3);
    const hair = new THREE.Color(L.hairColor).lerp(new THREE.Color('#000000'), 0.15);
    g.strokeStyle = `rgb(${Math.round(hair.r * 255)},${Math.round(hair.g * 255)},${Math.round(hair.b * 255)})`; g.lineCap = 'round';
    const count = Math.round(170 + L.browThick * 160);
    for (let i = 0; i < count; i++) {
      const u = Math.pow(Math.random(), 0.9), cy = e[1] + 0.21 + Math.sin(Math.min(1, u * 1.35) * Math.PI) * arch - u * 0.03, th = thick * (1.15 - u * 0.7);
      const x0 = side * (Math.abs(e[0]) - 0.2 + u * 0.52), y0 = cy + (Math.random() - 0.5) * 2 * th * 0.9;
      // hairs grow up at the inner end, then sweep out towards the tail
      const ang = u < 0.18 ? Math.PI / 2 - u * 2 + (Math.random() - 0.5) * 0.4 : 0.35 - u * 0.4 + (Math.random() - 0.5) * 0.35;
      const len = 0.05 + Math.random() * 0.04, x1 = x0 + side * Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
      g.globalAlpha = 0.35 + Math.random() * 0.5; g.lineWidth = 0.9 + Math.random() * 0.9;
      g.beginPath(); g.moveTo(fu(x0, y0), fv(x0, y0)); g.lineTo(fu(x1, y1), fv(x1, y1)); g.stroke();
    }
    g.globalAlpha = 1;
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = true; t.anisotropy = 8;
  return t;
}

/**
 * Light passing through skin: on the shadow side of every curve the light wraps a little further round and comes
 * out warm and red, instead of cutting off hard like on plastic. A cheap stand-in for subsurface scattering.
 */
function skinShader(mat: THREE.MeshPhysicalMaterial) {
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_pars_fragment>', THREE.ShaderChunk.lights_physical_pars_fragment.replace(
      'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
      `float wrapNL = saturate( ( dot( geometryNormal, directLight.direction ) + 0.45 ) / 1.45 );
      vec3 scatter = directLight.color * max( wrapNL - dotNL, 0.0 ) * vec3( 0.62, 0.3, 0.24 );
      reflectedLight.directDiffuse += ( irradiance + scatter ) * BRDF_Lambert( material.diffuseColor );`));
  };
  mat.customProgramCacheKey = () => 'skin-sss';
}

/** Fine skin detail: pores and faint creases as a tiling normal map (and matching roughness), so the light breaks up like on real skin. */
let pores: THREE.Texture | null = null;
function poreTexture(): THREE.Texture {
  const S = 512, h = new Float32Array(S * S);
  const rnd = (() => { let x = 1234567; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
  for (let i = 0; i < 9000; i++) {            // pores: small soft pits
    const cx = rnd() * S, cy = rnd() * S, r = 0.8 + rnd() * 1.6, d = 0.4 + rnd() * 0.6;
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
      const q = (x * x + y * y) / (r * r); if (q > 1) continue;
      const X = (Math.floor(cx) + x + S) % S, Y = (Math.floor(cy) + y + S) % S; h[Y * S + X] -= d * (1 - q) * (1 - q);
    }
  }
  for (let i = 0; i < 260; i++) {             // faint criss-cross creases
    let x = rnd() * S, y = rnd() * S; const a = rnd() * Math.PI, len = 20 + rnd() * 60;
    for (let t = 0; t < len; t++) { const X = Math.floor(x + S) % S, Y = Math.floor(y + S) % S; h[Y * S + X] -= 0.35; x += Math.cos(a); y += Math.sin(a); }
  }
  for (let i = 0; i < S * S; i++) h[i] += (rnd() - 0.5) * 0.25;
  const nc = document.createElement('canvas'), rc = document.createElement('canvas'); nc.width = nc.height = rc.width = rc.height = S;
  const ng = nc.getContext('2d')!, rg = rc.getContext('2d')!, nd = ng.createImageData(S, S), rd = rg.createImageData(S, S);
  const H = (x: number, y: number) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 0.9, dy = (H(x, y + 1) - H(x, y - 1)) * 0.9, l = Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
    nd.data[i] = (-dx / l * 0.5 + 0.5) * 255; nd.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; nd.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; nd.data[i + 3] = 255;
    const r = Math.max(0, Math.min(255, 150 - H(x, y) * 60)); rd.data[i] = rd.data[i + 1] = rd.data[i + 2] = r; rd.data[i + 3] = 255;
  }
  ng.putImageData(nd, 0, 0); rg.putImageData(rd, 0, 0);
  const n = new THREE.CanvasTexture(nc), r = new THREE.CanvasTexture(rc);
  for (const t of [n, r]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(14, 14); t.anisotropy = 8; }
  n.userData.rough = r;
  return n;
}

/** A closet photo ready to dress a 3D garment: the photo, where the piece is in it, a swatch of its fabric, its colour. */
interface Fabric { photo: THREE.Texture; uv: [number, number, number, number]; swatch: THREE.Texture; avg: string; aspect: number }
const fabrics = new Map<string, Promise<Fabric>>();
function loadFabric(url: string): Promise<Fabric> {
  const hit = fabrics.get(url); if (hit) return hit;
  const p = new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = url; }).then(img => {
    // where the piece is in the cut-out (its opaque pixels), and its average colour
    const S = 160, sc = S / Math.max(img.width, img.height), W = Math.max(1, Math.round(img.width * sc)), H = Math.max(1, Math.round(img.height * sc));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(img, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    let x0 = W, x1 = 0, y0 = H, y1 = 0, r = 0, gg = 0, b = 0, n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4; if (d[i + 3] < 128) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++;
    }
    if (!n) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1; n = 1; r = gg = b = 200; }
    const avg = '#' + [r, gg, b].map(v => Math.round(v / n).toString(16).padStart(2, '0')).join('');
    // a swatch from low in the middle of the piece (clear of most chest prints), mirrored so it tiles without seams
    const bw = (x1 - x0 + 1) / sc, bh = (y1 - y0 + 1) / sc, side = Math.max(8, bw * 0.24);
    const sx = x0 / sc + bw / 2 - side / 2, sy = Math.min(y0 / sc + bh * 0.68, y1 / sc - side) ;
    const sw = document.createElement('canvas'); sw.width = sw.height = 256;
    const swg = sw.getContext('2d')!; swg.fillStyle = avg; swg.fillRect(0, 0, 256, 256);
    swg.drawImage(img, sx, Math.max(y0 / sc, sy), side, side, 0, 0, 256, 256);
    const swatch = new THREE.CanvasTexture(sw); swatch.colorSpace = THREE.SRGBColorSpace; swatch.wrapS = swatch.wrapT = THREE.MirroredRepeatWrapping; swatch.repeat.set(2.2, 2.2); swatch.anisotropy = 4;
    const photo = new THREE.Texture(img); photo.colorSpace = THREE.SRGBColorSpace; photo.anisotropy = 8; photo.needsUpdate = true;
    photo.wrapS = photo.wrapT = THREE.ClampToEdgeWrapping;
    // photo uv (flipped: v runs up): left, bottom, right, top of the piece
    const uv: [number, number, number, number] = [x0 / W, 1 - (y1 + 1) / H, (x1 + 1) / W, 1 - y0 / H];
    return { photo, uv, swatch, avg, aspect: (y1 - y0 + 1) / (x1 - x0 + 1) };
  });
  p.catch(() => fabrics.delete(url));
  fabrics.set(url, p);
  return p;
}

/**
 * A photo studio round her: a seamless backdrop that curves from the floor up into the wall (no horizon line),
 * lit from the front with a soft pool of light where she stands, taking her shadow.
 */
function studio(): THREE.Object3D {
  // a round cyclorama (floor curving up into a wall all the way round), big enough that the camera stays inside it
  const R = 62, H = 60, curve = 14, pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) pts.push(new THREE.Vector2((R - curve) * i / 10, 0));
  for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI / 2; pts.push(new THREE.Vector2(R - curve + Math.sin(a) * curve, curve - Math.cos(a) * curve)); }
  for (let i = 1; i <= 6; i++) pts.push(new THREE.Vector2(R, curve + i * (H - curve) / 6));
  const geo = new THREE.LatheGeometry(pts, 96), p = geo.attributes.position as THREE.BufferAttribute, C = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    // brightest round her feet and on the wall behind her, falling off softly
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), d = Math.hypot(x / 30, (z + 6) / 34, y / 40), v = 0.38 + 0.62 * Math.exp(-d * d * 1.8);
    C[i * 3] = C[i * 3 + 1] = C[i * 3 + 2] = v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
  const room = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#5b5268', roughness: 0.92, metalness: 0, vertexColors: true, envMapIntensity: 0.4, side: THREE.BackSide }));
  room.receiveShadow = true;
  return room;
}

/** A gentle photographic grade: a soft S-curve, a touch of warmth in the mid-tones and a faint vignette. */
const GRADE = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 x = c.rgb;
      x = mix(x, x * x * (3.0 - 2.0 * x), 0.22);                     // contrast, kept soft
      float l = dot(x, vec3(0.299, 0.587, 0.114));
      x += vec3(0.006, 0.002, -0.004) * (1.0 - abs(l - 0.5) * 2.0);  // a hint of warmth in the mid-tones
      x = mix(vec3(l), x, 0.96);                                     // colours kept natural (not oversaturated)
      vec2 d = vUv - 0.5; x *= 1.0 - dot(d, d) * 0.35;               // vignette
      gl_FragColor = vec4(clamp(x, 0.0, 1.0), c.a);
    }`,
};

function eyeTexture(img: HTMLImageElement, colour: string): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d')!; g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), tint = { r: parseInt(colour.slice(1, 3), 16) / 255, g: parseInt(colour.slice(3, 5), 16) / 255, b: parseInt(colour.slice(5, 7), 16) / 255 };
  for (let i = 0; i < d.data.length; i += 4) {
    const r = d.data[i], gg = d.data[i + 1], b = d.data[i + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    if (mx - mn > 25 && mx < 235) {                     // the coloured iris (not the white or the pupil)
      // her eye colour, lifted so even dark brown reads as brown (not black) once it's under the cornea, keeping
      // the iris's own fibres from the texture
      const l = (r + gg + b) / 3 / 140, lift = Math.max(1, 0.42 / Math.max(0.05, 0.3 * tint.r + 0.55 * tint.g + 0.15 * tint.b)), k = Math.min(1.6, (0.55 + l * 0.7) * lift);
      d.data[i] = Math.min(255, tint.r * 255 * k); d.data[i + 1] = Math.min(255, tint.g * 255 * k); d.data[i + 2] = Math.min(255, tint.b * 255 * k);
    }
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/**
 * Something to wear in 3D. Either one of her closet photos (url, with its category and chosen 3D shape, empty =
 * guess), or a plain garment (shape, colour and pattern, like the built-in pieces).
 */
export interface ClosetWear {
  id: string; url?: string; backPath?: string | null; category?: ClosetCategory; shape3d?: string | null;
  shape?: Shape3D; color?: string; color2?: string; pattern?: string;
}
type Worn3D = { shape: Shape3D; fab?: Fabric; back?: Fabric; color: string; color2?: string; pattern?: string };

export default function Avatar3D({ look, outfit, closet = [], hair, closeUp = false, className = '' }: { look: Look; outfit: string | null; closet?: ClosetWear[]; hair: Hair3D; closeUp?: boolean; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const world = useRef<World | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [ready, setReady] = useState(0);
  const latest = useRef({ look, outfit, hair, closet });
  useEffect(() => { latest.current = { look, outfit, hair, closet }; });
  const closetKey = closet.map(c => `${c.id}:${c.backPath ?? ''}:${c.shape3d ?? ''}:${c.shape ?? ''}:${c.color ?? ''}:${c.color2 ?? ''}:${c.pattern ?? ''}`).join(',');

  // Scene setup, once.
  useEffect(() => {
    const el = box.current!;
    let disposed = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    const camera = new THREE.PerspectiveCamera(26, 1, 0.5, 400);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 14; controls.maxDistance = 70; controls.minPolarAngle = 0.6; controls.maxPolarAngle = 1.75;
    // studio lights: a soft key from the front left, a fill, and a rim light behind
    const key = new THREE.DirectionalLight('#fff4ea', 2.4); key.position.set(-12, 22, 18); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -10; key.shadow.camera.right = 10; key.shadow.camera.top = 22; key.shadow.camera.bottom = -2;
    key.shadow.bias = -0.0003; key.shadow.normalBias = 0.03; key.shadow.radius = 5; key.shadow.blurSamples = 16;
    const fill = new THREE.DirectionalLight('#e6ecff', 0.7); fill.position.set(14, 8, 10);
    const rim = new THREE.DirectionalLight('#ffd9b0', 1.6); rim.position.set(6, 16, -18);
    scene.add(key, fill, rim, new THREE.HemisphereLight('#f4ecff', '#2a2030', 0.35));
    scene.add(studio());
    const root = new THREE.Group(); scene.add(root);
    // ambient occlusion (soft contact shadows in creases, under the chin, between fingers and in clothes folds),
    // rendered through a multisampled target so edges stay smooth
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    // phones and small screens skip the occlusion pass to stay smooth
    const light = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 600);
    if (light) renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    const ao = new GTAOPass(scene, camera, 1, 1);
    ao.enabled = !light;
    ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.6, thickness: 1, scale: 1.2, samples: 12 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    ao.blendIntensity = 0.85;
    composer.addPass(ao);
    composer.addPass(new OutputPass());
    composer.addPass(new ShaderPass(GRADE));

    const fit = () => {
      const w = el.clientWidth || 300, h = el.clientHeight || 500;
      renderer.setSize(w, h, false); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(fit); ro.observe(el); fit();

    Promise.all([loadBody(), load('/models/body3d/skin-masks.png'), load('/models/body3d/eye.jpg')]).then(([model, masks, eyeImg]) => {
      if (disposed) return;
      world.current = { renderer, composer, scene, camera, controls, root, model, masks, eyeImg, extras: [], hair: [], raf: 0, t0: performance.now() };
      setStatus('ready'); setReady(n => n + 1);
      const tick = () => {
        const w = world.current; if (!w) return;
        w.raf = requestAnimationFrame(tick);
        pose(w, (performance.now() - w.t0) / 1000);
        if (w.drapes?.length) {
          w.root.updateMatrixWorld(true);
          for (const d of w.drapes) d.step();
          // layers: each hanging garment stays inside the ones worn over it (they're in order, innermost first)
          for (const d of w.drapes) d.hideBetween();
          for (let j = w.drapes.length - 1; j > 0; j--) {
            const sh = w.drapes[j].shell(), wy = w.marks ? w.marks.waistY : sh.top;
            for (let i = 0; i < j; i++) { w.drapes[i].keepInside(sh); w.drapes[i].hideBetween(sh.hem + 0.05, Math.min(wy, sh.top - 0.5), sh);
              // where the two cloths meet at the hem, the coat wins (drawn as if a hair nearer)
              const im = w.drapes[i].mesh.material as THREE.Material; if (!im.polygonOffset) { im.polygonOffset = true; im.polygonOffsetFactor = 2; im.polygonOffsetUnits = 8; im.needsUpdate = true; } }
          }
          for (const d of w.drapes) d.finish();
        }
        w.controls.update(); w.composer.render();
      };
      tick();
    }, () => { if (!disposed) setStatus('error'); });

    return () => {
      disposed = true; ro.disconnect();
      if (world.current) cancelAnimationFrame(world.current.raf);
      world.current = null;
      scene.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; (Array.isArray(mt) ? mt : mt ? [mt] : []).forEach(x => x.dispose()); });
      controls.dispose(); pmrem.dispose(); composer.dispose(); rt.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, []);

  // Body shape and skin: rebuild when her look changes.
  useEffect(() => {
    const w = world.current; if (!w || !ready) return;
    buildBody(w, look);
    buildOutfit(w, latest.current.outfit, w.worn3d);
    buildHair(w, latest.current.hair, look.hairColor);
  }, [look, ready]);
  useEffect(() => {
    const w = world.current; if (!w?.body || !ready) return;
    let stale = false;
    const dress = (fabs?: Worn3D[]) => { if (stale || world.current !== w) return; buildOutfit(w, outfit, fabs); buildHair(w, latest.current.hair, latest.current.look.hairColor); };   // hair rests on the clothes
    const items = latest.current.closet;
    if (!items.length) dress();
    else Promise.all(items.map((c): Promise<Worn3D | null> => c.url && c.category
      ? Promise.all([loadFabric(c.url), c.backPath ? signedUrl(c.backPath).then(u => (u ? loadFabric(u) : undefined)).catch(() => undefined) : undefined])
        .then(([fab, back]) => { const shape = shapeOf(c.category!, c.shape3d, fab.aspect); return shape ? { fab, back, shape, color: fab.avg } : null; }).catch(() => null)
      : Promise.resolve(c.shape ? { shape: c.shape, color: c.color ?? '#cccccc', color2: c.color2, pattern: c.pattern } : null)))
      .then(r => dress(r.filter((x): x is Worn3D => !!x)));
    return () => { stale = true; };
  }, [outfit, closetKey, ready]);
  useEffect(() => { const w = world.current; if (w?.body && ready) buildHair(w, hair, latest.current.look.hairColor); }, [hair, ready]);
  // Full length or a close-up of her face
  useEffect(() => {
    const w = world.current; if (!w?.marks || !ready) return;
    const h = latest.current.look.height / 10, sc = w.root.scale.x, faceY = w.root.position.y + w.marks.head.y * sc;
    if (closeUp) { w.controls.target.set(0, faceY - 0.7, 0); w.camera.position.set(0, faceY - 0.5, 11); w.controls.minDistance = 5; }
    else { w.controls.target.set(0, h * 0.55, 0); w.camera.position.set(Math.sin(VIEW_A) * h * 2.55, h * 0.6, Math.cos(VIEW_A) * h * 2.55); w.controls.minDistance = 14; }
    w.controls.update();
  }, [closeUp, ready]);

  return (
    <div className={`${s.wrap} ${className}`}>
      <div ref={box} className={s.canvas} />
      {status === 'loading' && <p className={s.note}>Loading the 3D model…</p>}
      {status === 'error' && <p className={s.note}>The 3D model couldn&apos;t load. Check your connection and try again.</p>}
    </div>
  );
}

/** The opening view: a little from the side (three-quarters), like a fashion photo; shows depth, heels and drape. */
const VIEW_A = 0.38;

// ─── Building ────────────────────────────────────────────────────
function buildBody(w: World, L: Look) {
  const m = w.model;
  const pos = m.shape(morphValues(L)), sp = m.surface(pos), nrm = m.normals(sp);
  w.pos = pos; w.sp = sp; w.nrm = nrm; w.marks = marks(m, pos, sp); w.look = L; w.caps = undefined;
  // skeleton at rest (each bone's frame lines up with the world axes, sitting on its joint)
  const heads = m.bones.map(b => m.joint(pos, b.head));
  const bones = m.bones.map((b, i) => {
    const bone = new THREE.Bone(); bone.name = b.name;
    const p = b.parent >= 0 ? heads[b.parent] : [0, 0, 0];
    bone.position.set(heads[i][0] - p[0], heads[i][1] - p[1], heads[i][2] - p[2]);
    const tl = m.joint(pos, b.tail); bone.userData.dir = new THREE.Vector3(tl[0] - heads[i][0], tl[1] - heads[i][1], tl[2] - heads[i][2]).normalize();
    return bone;
  });
  m.bones.forEach((b, i) => { if (b.parent >= 0) bones[b.parent].add(bones[i]); });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(m.expand(sp, 3, Float32Array), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(m.expand(nrm, 3, Float32Array), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(m.expand(m.skinIndex, 4, Uint8Array)), 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(m.expand(m.skinWeight, 4, Float32Array), 4));
  geo.setIndex(new THREE.BufferAttribute(m.groups.body, 1));

  // clear the old body
  if (w.body) { w.root.remove(w.body); w.body.geometry.dispose(); }
  w.skin?.map?.dispose(); w.skin?.dispose();
  const map = skinTexture(m, L, w.masks!, pos, sp, w.marks);
  const skinCol = new THREE.Color(L.skin);
  pores ??= poreTexture();
  w.skin = new THREE.MeshPhysicalMaterial({
    map, roughness: 0.85, metalness: 0, sheen: 0.15, sheenRoughness: 0.6, sheenColor: skinCol.clone().lerp(new THREE.Color('#ffd2c0'), 0.3),
    specularIntensity: 0.5, normalMap: pores, normalScale: new THREE.Vector2(0.35, 0.35), roughnessMap: pores.userData.rough as THREE.Texture,
  });
  skinShader(w.skin);
  // her height: scale the whole figure so head-to-toe matches, standing on the floor (before binding the skeleton)
  const k = w.marks;
  const scale = (L.height / 10) / (k.headTop - k.soleY);
  w.root.scale.setScalar(scale);
  w.root.position.y = -k.soleY * scale; w.baseY = w.root.position.y;
  w.root.updateMatrixWorld(true);
  const body = new THREE.SkinnedMesh(geo, w.skin);
  body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false;
  body.add(bones[0]);
  w.root.add(body); body.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  body.bind(skeleton);
  w.body = body; w.bones = bones; w.skeleton = skeleton;

  // eyes and lashes ride on the head bone
  const head = bones[m.boneIndex('head')], hp = heads[m.boneIndex('head')];
  const eg = new THREE.BufferGeometry(), ep = m.eyes(pos);
  // each eyeball a touch fuller and forward so it fills the lids (no dark gap under the iris)
  for (const side of [1, -1]) {
    let cx = 0, cy = 0, cz = 0, n = 0;
    for (let i = 0; i < ep.length; i += 3) if (Math.sign(ep[i]) === side) { cx += ep[i]; cy += ep[i + 1]; cz += ep[i + 2]; n++; }
    cx /= n; cy /= n; cz /= n;
    for (let i = 0; i < ep.length; i += 3) if (Math.sign(ep[i]) === side) { ep[i] = cx + (ep[i] - cx) * 1.05; ep[i + 1] = cy + (ep[i + 1] - cy) * 1.05; ep[i + 2] = cz + (ep[i + 2] - cz) * 1.05 + 0.012; }
  }
  for (let i = 0; i < ep.length; i += 3) { ep[i] -= hp[0]; ep[i + 1] -= hp[1]; ep[i + 2] -= hp[2]; }
  eg.setAttribute('position', new THREE.BufferAttribute(ep, 3)); eg.setAttribute('uv', new THREE.BufferAttribute(m.eye.uv, 2));
  // the proxy has a clear cornea dome over each eye (its UVs sit in the texture's corner): split it off
  const ix = m.eye.idx, uv = m.eye.uv, ball: number[] = [], cornea: number[] = [];
  for (let t = 0; t < ix.length; t += 3) {
    const inCorner = [ix[t], ix[t + 1], ix[t + 2]].every(v => uv[v * 2] > 0.84 && uv[v * 2 + 1] < 0.16);
    (inCorner ? cornea : ball).push(ix[t], ix[t + 1], ix[t + 2]);
  }
  eg.setIndex([...ball, ...cornea]); eg.clearGroups(); eg.addGroup(0, ball.length, 0); eg.addGroup(ball.length, cornea.length, 1);
  eg.computeVertexNormals();
  const eyes = new THREE.Mesh(eg, [
    new THREE.MeshPhysicalMaterial({ map: eyeTexture(w.eyeImg!, L.eyes), roughness: 0.45, envMapIntensity: 0.25, specularIntensity: 0.3 }),
    // the clear cornea: almost invisible, but it carries the bright little reflections that make eyes look alive
    new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.06, roughness: 0.0, envMapIntensity: 1.6, specularIntensity: 1, ior: 1.38, depthWrite: false }),
  ]);
  eyes.userData.kind = 'eyes';
  head.add(eyes);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', geo.attributes.position); lg.setAttribute('skinIndex', geo.attributes.skinIndex); lg.setAttribute('skinWeight', geo.attributes.skinWeight);
  lg.setIndex(new THREE.BufferAttribute(m.groups.lashes, 1)); lg.computeVertexNormals();
  const lashes = new THREE.SkinnedMesh(lg, new THREE.MeshStandardMaterial({ color: '#120a08', roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: L.lashes ? 0.8 : 0.45 }));
  lashes.frustumCulled = false; lashes.bind(skeleton, body.bindMatrix); w.root.add(lashes);
  w.extras.forEach(o => { if (o.userData.kind === 'lashes') w.root.remove(o); });
  lashes.userData.kind = 'lashes'; w.extras = w.extras.filter(o => o.userData.kind !== 'lashes'); w.extras.push(lashes);

  const h = L.height / 10;
  w.controls.target.set(0, h * 0.55, 0);
  if (!w.camera.userData.placed) { w.camera.position.set(Math.sin(VIEW_A) * h * 2.55, h * 0.6, Math.cos(VIEW_A) * h * 2.55); w.camera.userData.placed = true; }
  w.controls.update();
}

function buildOutfit(w: World, id: string | null, closet?: Worn3D[]) {
  w.extras = w.extras.filter(o => { if (o.userData.kind === 'cloth') { w.root.remove(o); (o as THREE.Mesh).geometry.dispose(); return false; } return true; });
  w.drapes = [];
  w.outfitId = id; w.worn3d = closet?.length ? closet : undefined;
  if (!w.marks || !w.pos || !w.nrm || !w.skeleton || !w.body) return;
  const basics = w.look?.basics ?? '#e9ddd0';
  // her own clothes when she's picked any from her closet, otherwise a built-in outfit (or just underwear)
  const pieces = w.worn3d ? closetPieces(w.marks, w.worn3d.map((c, i) => ({ shape: c.shape, color: c.color, color2: c.color2, pattern: c.pattern, photo: c.fab ? i : undefined })), basics)
    : (id ? outfits(w.marks).find(x => x.id === id)?.pieces : null) ?? underwear(w.marks, basics);
  w.worn = pieces;
  for (const piece of pieces) {
    const g = garmentGeometry(w.model, w.sp!, w.nrm, piece.cuts, w.marks, piece.hem);
    if (g) addGarment(w, piece, g, fabOf(w, piece));
    for (const a of accessories(w.model, w.sp!, w.marks, piece)) {
      const am = new THREE.SkinnedMesh(a.geo, new THREE.MeshPhysicalMaterial({
        color: a.color, roughness: a.rough, sheen: a.metal ? 0 : a.sheen ?? 0.2, sheenRoughness: 0.7, side: THREE.DoubleSide, clearcoat: piece.coat ?? 0, clearcoatRoughness: 0.4,
        metalness: a.metal ?? 0, ...(a.opacity !== undefined ? { transparent: true, opacity: a.opacity, depthWrite: false } : {}),
        ...(a.sheen ? { normalMap: foldTexture('knit'), normalScale: new THREE.Vector2(0.4, 0.4) } : {}),
      }));
      am.castShadow = true; am.receiveShadow = true; am.frustumCulled = false;
      am.bind(w.skeleton, w.body.bindMatrix); am.userData.kind = 'cloth';
      w.root.add(am); w.extras.push(am);
    }
  }
  // heels: up onto the balls of her feet
  const heel = Math.max(0, ...pieces.map(p => p.sole?.heel ?? 0));
  w.heelA = heelTilt(w.marks, heel); w.heelLift = heelLift(w.marks, heel);
}
const fabOf = (w: World, piece: PieceSpec) => (piece.photo !== undefined ? w.worn3d?.[piece.photo]?.fab : undefined);
function addGarment(w: World, piece: PieceSpec, g: THREE.BufferGeometry, fab: Fabric | undefined) {
  if (!w.skeleton || !w.body) return;
  {
    // the fabric sets how it catches the light: matte cotton, fuzzy knit, glossy satin, leather, nylon
    const fb = fabricOf(piece), look = FABRIC_LOOK[fb], maps = clothMaps(piece.folds ?? 'tee', fb);
    const nTex = maps.normal.clone(), rTex = maps.rough.clone(); nTex.repeat.set(0.45, 0.45); rTex.repeat.set(0.45, 0.45); nTex.needsUpdate = rTex.needsUpdate = true;
    const mat = new THREE.MeshPhysicalMaterial({
      clearcoat: piece.coat ?? 0, clearcoatRoughness: 0.35,
      map: fab ? fab.swatch : fabricTexture(piece.color, piece.pattern, piece.color2), roughness: Math.min(1, (piece.rough ?? look.rough) * 0.4 + look.rough * 0.6),
      sheen: look.sheen, sheenRoughness: look.sheenRough, sheenColor: new THREE.Color(piece.color).lerp(new THREE.Color('#ffffff'), 0.45), side: THREE.DoubleSide,
      normalMap: nTex, normalScale: new THREE.Vector2(look.normal, look.normal), roughnessMap: rTex,
      specularIntensity: look.spec ?? 1,
    });
    if (w.marks) mat.userData.zones = { z: foldZones(piece, w.marks), k: w.marks };
    const backFab = piece.photo !== undefined ? w.worn3d?.[piece.photo]?.back : undefined;
    if (fab) mat.userData.photo = { photo: fab.photo, uv: fab.uv, front: g.userData.front as number[], useFront: !!piece.photoFront, ...(backFab ? { back: { photo: backFab.photo, uv: backFab.uv, box: g.userData.back as number[] } } : {}) } satisfies PhotoFabric;
    if (piece.detail) mat.userData.detail = piece.detail;
    clothShader(mat);
    // skirts, dress skirts and coat tails hang and move (simulated); everything else moves with her skin
    if (g.userData.drape && w.bones && w.marks) {
      w.caps ??= legCapsules(w.model.bones.map(b => b.name), v => w.model.skinIndex[v * 4], w.model.ns, w.sp!, n => new THREE.Vector3(...w.model.joint(w.pos!, w.model.bones[w.model.boneIndex(n)].head)));
      mat.userData.hide = { value: new THREE.Vector2(1e9, 1e9) }; mat.userData.hideA = { value: new Array(16).fill(-1e9) }; mat.userData.hideC = { value: new THREE.Vector2() };
      const d = new Drape(g, mat, w.bones, w.skeleton, w.body.bindMatrix, w.root, w.caps, { stiff: fabricOf(piece) === 'leather' || fabricOf(piece) === 'twill' ? 0.5 : fabricOf(piece) === 'satin' ? 0.12 : 0.25, memory: Math.max(g.userData.memory as number, fabricOf(piece) === 'twill' || fabricOf(piece) === 'leather' ? 0.035 : 0), floor: w.marks.soleY + 0.03 });
      const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); (dm as THREE.Material & { defines?: Record<string, unknown> }).defines = { CLOTH_SIM: '' };
      d.mesh.customDepthMaterial = clothShader(dm);
      d.mesh.castShadow = true; d.mesh.receiveShadow = true; d.mesh.userData.kind = 'cloth';
      w.root.add(d.mesh); w.extras.push(d.mesh); w.drapes!.push(d);
      g.dispose();
      return;
    }
    const mesh = new THREE.SkinnedMesh(g, mat);
    mesh.customDepthMaterial = clothShader(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    mesh.bind(w.skeleton, w.body.bindMatrix);
    mesh.userData.kind = 'cloth';
    w.root.add(mesh); w.extras.push(mesh);
  }
}

function buildHair(w: World, style: Hair3D, colour: string) {
  for (const o of w.hair) { o.parent?.remove(o); o.traverse(x => (x as THREE.Mesh).geometry?.dispose()); }
  w.hair = [];
  if (!w.marks || !w.pos || !w.sp || !w.nrm || !w.bones) return;
  const sp = w.sp, nrm = w.nrm, m = w.model, k = w.marks, idx = m.groups.body;
  // the scalp: head skin round the hairline and above; the hair layer fades in through the hairline
  const wt = new Float32Array(m.ns);
  for (let v = 0; v < m.ns; v++) wt[v] = sp[v * 3 + 1] > k.chinY - 0.8 ? scalpWeight(k, sp[v * 3], sp[v * 3 + 1], sp[v * 3 + 2]) : 0;
  const map = new Map<number, number>(), P: number[] = [], Cl: number[] = [], I: number[] = [], SN: number[] = [], SW: number[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [m.rmap[idx[t]], m.rmap[idx[t + 1]], m.rmap[idx[t + 2]]];
    if (!tri.some(v => wt[v] > 0.01)) continue;
    for (const v of tri) {
      if (!map.has(v)) {
        const e = 0.006 + 0.05 * Math.pow(wt[v], 1.5), o = v * 3;
        map.set(v, P.length / 3); P.push(sp[o] + nrm[o] * e, sp[o + 1] + nrm[o + 1] * e, sp[o + 2] + nrm[o + 2] * e);
        const a = Math.min(1, Math.max(0, (wt[v] - 0.2) / 0.6)); Cl.push(1, 1, 1, a * a * (3 - 2 * a));
        SN.push(nrm[o], nrm[o + 1], nrm[o + 2]); SW.push(wt[v]);
      }
      I.push(map.get(v)!);
    }
  }
  const cap = new THREE.BufferGeometry();
  cap.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); cap.setAttribute('color', new THREE.Float32BufferAttribute(Cl, 4)); cap.setIndex(I); cap.computeVertexNormals();
  // hair runs back over the head: u round the head, v front to back
  const uv = new Float32Array(P.length / 3 * 2);
  for (let i = 0; i < P.length / 3; i++) { uv[i * 2] = Math.atan2(P[i * 3] - k.head.x, P[i * 3 + 1] - k.head.y + 0.3) * 0.5; uv[i * 2 + 1] = (P[i * 3 + 2] - k.head.z) * 0.5; }
  cap.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const scalp = { p: Float32Array.from(P), n: Float32Array.from(SN), w: Float32Array.from(SW) };
  const prof = wearing(bodyProfile(m, sp, k), k, w.worn ? { pieces: w.worn } : undefined);
  const bi = m.boneIndex('head'), head = w.bones[bi], hp = m.joint(w.pos, m.bones[bi].head);
  // under a hat, a bun or an afro is tucked away (the smooth scalp layer stays); braids and long hair hang below it
  const hat = w.worn?.some(p => p.wear && ['beanie', 'cap', 'bucket-hat'].includes(p.wear));
  const meshes = hairMeshes(style, colour, k, scalp, cap, prof).filter((_, i) => !(hat && (style === 'bun' || style === 'afro') && i > 0));
  for (const mesh of meshes) {
    const g = new THREE.Group(); g.add(mesh); g.position.set(-hp[0], -hp[1], -hp[2]);
    mesh.traverse(o => { o.castShadow = true; o.receiveShadow = true; });
    head.add(g); w.hair.push(g);
  }
}

// ─── Pose and idle movement ──────────────────────────────────────
const E = new THREE.Euler(), Q = new THREE.Quaternion();
function rot(b: THREE.Bone | undefined, x: number, y: number, z: number) { if (b) b.quaternion.multiply(Q.setFromEuler(E.set(x, y, z))); }
/** Turn a bone about its own length (for forearm twist), whatever direction it points at rest. */
function twist(b: THREE.Bone | undefined, a: number) { if (b?.userData.dir) b.quaternion.multiply(Q.setFromAxisAngle(b.userData.dir as THREE.Vector3, a)); }
function pose(w: World, t: number) {
  if (!w.bones) return;
  const B = (n: string) => w.bones![w.model.boneIndex(n)];
  for (const b of w.bones) b.quaternion.identity();
  const breathe = Math.sin(t * 1.25) * 0.012, sway = Math.sin(t * 0.42), P = POSE;
  // weight on her right leg: hips drop a touch on the left, left knee softens, shoulders counter the hips
  // a slow, easy shift of the hips (and the shoulders turning back against it), so skirts swing a little
  const hipTurn = Math.sin(t * 0.55) * 0.07 + Math.sin(t * 1.3) * 0.02;
  rot(B('spine05'), 0, hipTurn, P.hip + sway * 0.012);
  rot(B('spine03'), 0, -hipTurn * 0.8, 0);
  rot(B('upperleg01.R'), 0, 0, -P.hip + P.legIn); rot(B('upperleg01.L'), P.legL, 0, -P.hip - P.legIn);
  const ha = w.heelA ?? 0;   // in heels the feet point down and she stands taller
  rot(B('lowerleg01.L'), P.kneeL, 0, 0); const out = ha ? 0.45 : 0;   // in heels her feet turn out a little, so the heels show from the front
  rot(B('foot.L'), -P.kneeL * 0.5 - P.legL + ha, 0.15 + out, P.legIn); rot(B('foot.R'), ha, -0.08 - out, P.hip - P.legIn);
  if (w.baseY !== undefined) w.root.position.y = w.baseY + (w.heelLift ?? 0) * w.root.scale.y;
  rot(B('spine03'), breathe, sway * 0.01, -P.hip * 0.6);
  rot(B('spine01'), 0, 0, -P.hip * 0.5);
  for (const [side, sg] of [['L', -1], ['R', 1]] as const) {
    // sg: -1 for her left (+x). The base body stands in a slight A-pose, so the arms only need lowering a little.
    // relaxed shoulders: the collarbone and shoulder drop a little and take some of the arm's lowering, so the
    // upper arm needs less (which keeps the shoulder round instead of bunching into a shelf)
    rot(B(`clavicle.${side}`), 0, 0, sg * P.clav);
    rot(B(`shoulder01.${side}`), 0, 0, sg * P.shoulder);
    rot(B(`upperarm01.${side}`), 0.06 + Math.sin(t * 0.7 + sg) * 0.01, sg * P.armTwist, sg * (P.arm - P.clav - P.shoulder) + sg * breathe * 0.4);
    rot(B(`lowerarm01.${side}`), P.elbow, 0, sg * 0.05);
    twist(B(`lowerarm02.${side}`), -sg * P.foreTwist);
    rot(B(`wrist.${side}`), P.wristX, 0, sg * P.wrist);
    for (let f = 2; f <= 5; f++) for (let j = 1; j <= 3; j++) rot(B(`finger${f}-${j}.${side}`), P.curlX * (0.6 + f * 0.12) * (j === 1 ? 0.7 : 1), 0, sg * P.curlZ * (0.6 + f * 0.12) * (j === 1 ? 0.7 : 1));
    rot(B(`finger1-2.${side}`), P.thumbX, 0, sg * P.thumbZ); rot(B(`finger1-3.${side}`), P.thumbX, 0, sg * P.thumbZ);
  }
  rot(B('neck01'), -0.02, Math.sin(t * 0.33) * 0.05, P.hip * 0.4);
  rot(B('head'), Math.sin(t * 0.5) * 0.025, Math.sin(t * 0.27 + 1) * 0.09, Math.sin(t * 0.36) * 0.015 + P.hip * 0.3);
}
/** The standing pose (radians). */
const POSE = { legIn: 0.05, hip: 0.035, legL: -0.04, kneeL: 0.12, arm: 0.5, clav: 0.1, shoulder: 0.2, armTwist: 0.0, elbow: 0.2, foreTwist: 0.9, wrist: 0.05, wristX: 0, curlX: 0, curlZ: 0.25, thumbX: 0, thumbZ: 0.15 };
