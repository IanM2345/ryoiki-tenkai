'use client';
// One mahjong tile, drawn as an SVG face on an ivory tile with a jade back edge.
import React from 'react';
import { type Kind, suitOf, rank, cornerLabel, tileName } from './tiles';
import s from './tile.module.css';

const BLUE = '#1f4e9c', GREEN = '#167a4a', RED = '#c8272d', INK = '#1b1b1f';
const CJK = "'Noto Serif CJK SC','Noto Serif CJK JP','Songti SC','STSong','SimSun','PingFang SC','Hiragino Sans GB','Microsoft YaHei',serif";
const NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

// Dot positions (x, y, r) for 1-9 dots, in the 60 x 80 face.
const DOTS: [number, number, number][][] = [
  [[30, 40, 17]],
  [[30, 22, 10], [30, 58, 10]],
  [[15, 17, 9], [30, 40, 9], [45, 63, 9]],
  [[18, 22, 9.5], [42, 22, 9.5], [18, 58, 9.5], [42, 58, 9.5]],
  [[17, 19, 8.5], [43, 19, 8.5], [30, 40, 8.5], [17, 61, 8.5], [43, 61, 8.5]],
  [[19, 17, 8], [41, 17, 8], [19, 40, 8], [41, 40, 8], [19, 63, 8], [41, 63, 8]],
  [[13, 12, 6.8], [30, 20, 6.8], [47, 28, 6.8], [19, 47, 7.2], [41, 47, 7.2], [19, 66, 7.2], [41, 66, 7.2]],
  [[19, 12, 7], [41, 12, 7], [19, 31, 7], [41, 31, 7], [19, 49, 7], [41, 49, 7], [19, 68, 7], [41, 68, 7]],
  [[14, 16, 7.5], [30, 16, 7.5], [46, 16, 7.5], [14, 40, 7.5], [30, 40, 7.5], [46, 40, 7.5], [14, 64, 7.5], [30, 64, 7.5], [46, 64, 7.5]],
];
function dotColor(n: number, i: number): string {
  if (n === 2 || n === 8) return n === 2 ? GREEN : BLUE;
  if (n === 3) return [BLUE, RED, GREEN][i];
  if (n === 4) return i === 0 || i === 3 ? BLUE : GREEN;
  if (n === 5) return i === 2 ? RED : i === 0 || i === 4 ? BLUE : GREEN;
  if (n === 6) return i < 2 ? GREEN : RED;
  if (n === 7) return i < 3 ? GREEN : RED;
  if (n === 9) return i < 3 ? BLUE : i < 6 ? RED : GREEN;
  return BLUE;
}
function Dot({ x, y, r, c }: { x: number; y: number; r: number; c: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={c} />
      <circle cx={x} cy={y} r={r * 0.72} fill="#fffaf0" />
      <circle cx={x} cy={y} r={r * 0.5} fill={c} />
      <circle cx={x} cy={y} r={r * 0.2} fill="#fffaf0" />
    </g>
  );
}
function BigDot() {
  return (
    <g>
      <circle cx={30} cy={40} r={19} fill={GREEN} />
      <circle cx={30} cy={40} r={15.5} fill="#fffaf0" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return <circle key={i} cx={30 + Math.cos(a) * 12} cy={40 + Math.sin(a) * 12} r={2.4} fill={i % 2 ? BLUE : RED} />;
      })}
      <circle cx={30} cy={40} r={7} fill={RED} />
      <circle cx={30} cy={40} r={3} fill="#fffaf0" />
    </g>
  );
}

// Bamboo stick centres for 2-9 (x, y), with a stick height per count.
const STICKS: Record<number, { pts: [number, number][]; h: number; red?: number[] }> = {
  2: { pts: [[30, 22], [30, 58]], h: 30 },
  3: { pts: [[30, 22], [19, 58], [41, 58]], h: 30 },
  4: { pts: [[19, 22], [41, 22], [19, 58], [41, 58]], h: 30 },
  5: { pts: [[17, 22], [43, 22], [30, 40], [17, 58], [43, 58]], h: 28, red: [2] },
  6: { pts: [[14, 22], [30, 22], [46, 22], [14, 58], [30, 58], [46, 58]], h: 30 },
  7: { pts: [[30, 14], [14, 42], [30, 42], [46, 42], [14, 67], [30, 67], [46, 67]], h: 21, red: [0] },
  8: { pts: [[11, 22], [24, 22], [36, 22], [49, 22], [11, 58], [24, 58], [36, 58], [49, 58]], h: 30 },
  9: { pts: [[14, 15], [30, 15], [46, 15], [14, 40], [30, 40], [46, 40], [14, 65], [30, 65], [46, 65]], h: 21, red: [1, 4, 7] },
};
function Stick({ x, y, h, c }: { x: number; y: number; h: number; c: string }) {
  const w = 7.5;
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={3.5} fill={c} />
      <rect x={x - 1} y={y - h / 2 + 2} width={2} height={h - 4} rx={1} fill="#fffaf0" opacity={0.55} />
      <rect x={x - w / 2 - 0.6} y={y - 1.2} width={w + 1.2} height={2.4} rx={1.2} fill={c} />
    </g>
  );
}
function Sparrow() {
  // One of bamboo: a little bird on a stalk.
  return (
    <g>
      <path d="M22 70 C24 52 26 40 30 26" stroke={GREEN} strokeWidth={3} fill="none" strokeLinecap="round" />
      <path d="M26 50 C18 46 14 40 14 34 C20 38 24 42 27 46Z" fill={GREEN} />
      <path d="M28 40 C36 36 42 30 44 24 C38 28 33 32 29 36Z" fill={GREEN} />
      <ellipse cx={34} cy={22} rx={9} ry={7} fill={RED} />
      <circle cx={39} cy={19} r={4.5} fill={RED} />
      <circle cx={40.5} cy={18} r={1.2} fill="#fffaf0" />
      <path d="M43.5 18.5 L48 19.5 L43.5 21Z" fill="#e0a21b" />
      <path d="M26 23 L16 16 L18 26Z" fill={BLUE} />
    </g>
  );
}

function Glyph({ ch, color, size = 44, y = 54 }: { ch: string; color: string; size?: number; y?: number }) {
  return <text x={30} y={y} textAnchor="middle" fontFamily={CJK} fontWeight={700} fontSize={size} fill={color}>{ch}</text>;
}

const FLOWER_CH = ['梅', '蘭', '菊', '竹'], FLOWER_C = ['#d14a7a', '#7b4bb8', '#d98a12', GREEN];
const SEASON_CH = ['春', '夏', '秋', '冬'], SEASON_C = ['#2e8b57', '#d9480f', '#b5651d', '#3b6fb6'];

export function TileFace({ kind }: { kind: Kind }) {
  const suit = suitOf(kind), n = rank(kind);
  let face: React.ReactNode = null;
  if (suit === 'pin') face = n === 1 ? <BigDot /> : DOTS[n - 1].map(([x, y, r], i) => <Dot key={i} x={x} y={y} r={r} c={dotColor(n, i)} />);
  else if (suit === 'sou') {
    if (n === 1) face = <Sparrow />;
    else { const d = STICKS[n]; face = d.pts.map(([x, y], i) => <Stick key={i} x={x} y={y} h={d.h} c={d.red?.includes(i) ? RED : i % 2 && n === 8 ? BLUE : GREEN} />); }
  } else if (suit === 'man') {
    face = <>
      <Glyph ch={NUMS[n - 1]} color={INK} size={27} y={33} />
      <Glyph ch="萬" color={RED} size={29} y={68} />
    </>;
  } else if (suit === 'wind') face = <Glyph ch={'東南西北'[kind - 27]} color={INK} />;
  else if (suit === 'dragon') {
    if (kind === 31) face = <Glyph ch="中" color={RED} size={48} y={57} />;
    else if (kind === 32) face = <Glyph ch="發" color={GREEN} size={46} y={56} />;
    else face = <>
      <rect x={13} y={15} width={34} height={50} rx={3} fill="none" stroke={BLUE} strokeWidth={4} />
      <rect x={18.5} y={20.5} width={23} height={39} rx={1.5} fill="none" stroke={BLUE} strokeWidth={1.6} />
    </>;
  } else if (suit === 'flower') {
    const i = kind - 34;
    face = <>
      {[0, 1, 2, 3, 4].map(p => { const a = (p / 5) * Math.PI * 2 - Math.PI / 2; return <circle key={p} cx={30 + Math.cos(a) * 7} cy={25 + Math.sin(a) * 7} r={5.5} fill={FLOWER_C[i]} opacity={0.85} />; })}
      <circle cx={30} cy={25} r={3.5} fill="#f2c94c" />
      <Glyph ch={FLOWER_CH[i]} color={FLOWER_C[i]} size={26} y={68} />
    </>;
  } else {
    const i = kind - 38;
    face = <>
      <circle cx={30} cy={25} r={11} fill="none" stroke={SEASON_C[i]} strokeWidth={3} />
      <circle cx={30} cy={25} r={5} fill={SEASON_C[i]} />
      <Glyph ch={SEASON_CH[i]} color={SEASON_C[i]} size={26} y={68} />
    </>;
  }
  return (
    <svg viewBox="0 0 60 80" className={s.face} aria-hidden>
      {face}
      <text x={5} y={11} fontFamily="system-ui, sans-serif" fontWeight={800} fontSize={10} fill="#8a7d63">{cornerLabel(kind)}</text>
    </svg>
  );
}

export type TileState = 'normal' | 'selected' | 'hint' | 'blocked' | 'claim' | 'win';

/** A standing tile. Width sets the size; height is 4/3 of it. */
export default function Tile({
  kind, width, state = 'normal', faceDown, onClick, disabled, label, style, className, sideways, domId,
}: {
  kind: Kind;
  width: number;
  state?: TileState;
  faceDown?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  label?: string;
  style?: React.CSSProperties;
  className?: string;
  sideways?: boolean;
  domId?: string;
}) {
  const cls = [s.tile, s[state], faceDown ? s.back : '', onClick ? s.clickable : '', sideways ? s.sideways : '', className ?? ''].join(' ');
  const st: React.CSSProperties = { width, height: Math.round(width * 4 / 3), ['--d' as string]: `${Math.max(2, Math.round(width * 0.09))}px`, ...style };
  const name = faceDown ? 'Face-down tile' : (label ?? tileName(kind));
  if (onClick) {
    return (
      <button type="button" id={domId} className={cls} style={st} onClick={onClick} disabled={disabled} aria-label={name} title={faceDown ? undefined : tileName(kind)}>
        {!faceDown && <TileFace kind={kind} />}
      </button>
    );
  }
  return <span id={domId} className={cls} style={st} role="img" aria-label={name}>{!faceDown && <TileFace kind={kind} />}</span>;
}
