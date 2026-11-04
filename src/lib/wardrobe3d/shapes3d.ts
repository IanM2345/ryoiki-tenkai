// How a closet photo is worn in 3D: each piece of her clothing is matched to a 3D garment shape (a T-shirt, jeans,
// a midi dress...), which the 3D figure wears coloured and patterned from her photo. No three.js here, so the
// closet pages can use it cheaply.
import type { ClosetCategory } from '@/lib/db';

export type Shape3D = string;
export type Slot3D = 'top' | 'outer' | 'bottom' | 'dress' | 'shoes' | 'bag' | 'hat' | 'glasses' | 'ears' | 'neck' | 'belt';

/** Every 3D garment (see garments3d), by closet category; her closet photos can be worn as any of these. */
export const SHAPES_3D: { id: Shape3D; name: string; category: ClosetCategory; slot: Slot3D }[] = [
  ...([['tee', 'T-shirt'], ['fitted-tee', 'Fitted tee'], ['crop', 'Crop top'], ['longsleeve', 'Long-sleeve top'], ['turtleneck', 'Turtleneck'], ['v-tee', 'V-neck tee'],
    ['sweater', 'Jumper'], ['shirt', 'Button shirt'], ['blouse', 'Puff-sleeve blouse'], ['cami', 'Cami'], ['tank', 'Vest top'], ['off-shoulder', 'Off-shoulder top'], ['corset', 'Corset top']] as const)
    .map(([id, name]) => ({ id, name, category: 'top' as const, slot: 'top' as const })),
  ...([['hoodie', 'Hoodie'], ['zip-hoodie', 'Zip hoodie'], ['jacket', 'Jacket'], ['denim-jacket', 'Denim jacket'], ['blazer', 'Blazer'], ['cardigan', 'Cardigan'],
    ['leather', 'Leather jacket'], ['trench', 'Trench coat'], ['coat', 'Long coat'], ['puffer', 'Puffer jacket']] as const)
    .map(([id, name]) => ({ id, name, category: 'outerwear' as const, slot: 'outer' as const })),
  ...([['jeans', 'Straight jeans'], ['skinny', 'Skinny jeans'], ['flares', 'Flares'], ['wide-trousers', 'Wide trousers'], ['cargos', 'Cargo trousers'], ['leggings', 'Leggings'],
    ['shorts', 'Shorts'], ['bermudas', 'Long shorts'], ['skirt', 'Short skirt'], ['mini-skirt', 'Mini skirt'], ['pleated-skirt', 'Pleated skirt'], ['a-line-skirt', 'A-line midi skirt'],
    ['pencil-skirt', 'Pencil skirt'], ['longskirt', 'Long skirt'], ['maxi-skirt', 'Maxi skirt']] as const)
    .map(([id, name]) => ({ id, name, category: 'bottom' as const, slot: 'bottom' as const })),
  ...([['dress', 'Midi dress'], ['minidress', 'Short dress'], ['maxidress', 'Long dress'], ['sundress', 'Sundress'], ['slip-dress', 'Slip dress'], ['bodycon', 'Bodycon dress'],
    ['wrap-dress', 'Wrap dress'], ['tshirt-dress', 'T-shirt dress'], ['off-shoulder-dress', 'Off-shoulder dress'], ['jumpsuit', 'Jumpsuit']] as const)
    .map(([id, name]) => ({ id, name, category: 'dress' as const, slot: 'dress' as const })),
  ...([['sneakers', 'Trainers'], ['heels', 'Heels'], ['flats', 'Ballet flats'], ['sandals', 'Sandals'], ['loafers', 'Loafers'], ['ankle-boots', 'Ankle boots'], ['boots', 'Knee boots']] as const)
    .map(([id, name]) => ({ id, name, category: 'shoes' as const, slot: 'shoes' as const })),
  ...([['handbag', 'Handbag'], ['crossbody', 'Crossbody bag'], ['tote', 'Tote bag']] as const).map(([id, name]) => ({ id, name, category: 'bag' as const, slot: 'bag' as const })),
  ...([['beanie', 'Beanie', 'hat'], ['cap', 'Cap', 'hat'], ['bucket-hat', 'Bucket hat', 'hat'], ['headband', 'Headband', 'hat'], ['sunglasses', 'Sunglasses', 'glasses'], ['glasses', 'Glasses', 'glasses'],
    ['hoops', 'Hoop earrings', 'ears'], ['studs', 'Stud earrings', 'ears'], ['drops', 'Drop earrings', 'ears'], ['necklace', 'Pendant necklace', 'neck'], ['pearls', 'Pearls', 'neck'], ['choker', 'Choker', 'neck'],
    ['belt', 'Belt', 'belt'], ['waist-belt', 'Waist belt', 'belt']] as const)
    .map(([id, name, slot]) => ({ id, name, category: 'accessory' as const, slot: slot as Slot3D })),
];
export const shapesFor = (c: ClosetCategory) => SHAPES_3D.filter(s => s.category === c);
export const isShape3D = (v: unknown): v is Shape3D => SHAPES_3D.some(s => s.id === v);

/**
 * Her chosen shape, or a guess from the category and the photo's proportions (height / width) when she hasn't
 * picked one. Bags and accessories have no 3D version (null).
 */
export function shapeOf(category: ClosetCategory, chosen?: string | null, aspect = 1): Shape3D | null {
  if (isShape3D(chosen) && SHAPES_3D.find(s => s.id === chosen)!.category === category) return chosen;
  switch (category) {
    case 'top': return 'tee';
    case 'outerwear': return 'jacket';
    case 'bottom': return aspect > 1.45 ? 'jeans' : aspect < 0.8 ? 'shorts' : 'skirt';
    case 'dress': return aspect > 2.1 ? 'maxidress' : aspect < 1.35 ? 'minidress' : 'dress';
    case 'shoes': return 'sneakers';
    case 'bag': return 'handbag';
    default: return null;
  }
}
export const slotOf = (shape: Shape3D): Slot3D => SHAPES_3D.find(s => s.id === shape)!.slot;

// ─── The 2D dress-up outfit, seen in 3D ──────────────────────────
/** Each built-in 2D piece as one or more 3D garment shapes (accessories, bags and hats have none). */
// (most built-in pieces have a 3D garment of the same name; these are the exceptions)
const ALIAS: Record<string, Shape3D> = { 'crop-tee': 'crop', 'long-sleeve': 'longsleeve', 'maxi-dress': 'maxidress', 'knee-boots': 'boots' };
const PIECE_3D = (id: string): Shape3D[] => { const a = ALIAS[id] ?? id; return SHAPES_3D.some(s => s.id === a) ? [a] : []; };
/** Guess for built-in pieces not in the table, by slot. */
const BY_SLOT: Record<string, Shape3D> = { top: 'tee', bottom: 'jeans', dress: 'dress', outer: 'jacket', shoes: 'sneakers', bag: 'handbag' };

type Layer2D = { kind: 'piece'; piece: string; color: string; color2: string; pattern: string } | { kind: 'photo'; item: string };
export interface Wear3DIn { id: string; url?: string; backPath?: string | null; category?: ClosetCategory; shape3d?: string | null; shape?: Shape3D; color?: string; color2?: string; pattern?: string }

/**
 * The outfit on the 2D avatar as things the 3D figure can wear: built-in pieces become plain 3D garments in the
 * same colours and pattern; her closet photos are worn as their 3D shape. Also says how many pieces have no 3D
 * version.
 */
export function layersTo3D(layers: Layer2D[], slotOfPiece: (id: string) => string | null, items: Map<string, { category: ClosetCategory; shape3d?: string | null; back_path?: string | null }>, urls: Record<string, string>): { wear: Wear3DIn[]; skipped: number } {
  const wear: Wear3DIn[] = []; let skipped = 0;
  layers.forEach((l, i) => {
    if (l.kind === 'photo') {
      const it = items.get(l.item), url = urls[l.item];
      if (it && url && shapeOf(it.category, it.shape3d)) wear.push({ id: l.item, url, backPath: it.back_path, category: it.category, shape3d: it.shape3d });
      else skipped++;
      return;
    }
    const slot = slotOfPiece(l.piece), own = PIECE_3D(l.piece), shapes = own.length ? own : slot && BY_SLOT[slot] ? [BY_SLOT[slot]] : [];
    if (!shapes.length) { skipped++; return; }
    shapes.forEach((shape, j) => wear.push({ id: `${l.piece}-${i}-${j}`, shape, color: l.color, color2: l.color2, pattern: l.pattern === 'solid' ? undefined : l.pattern }));
  });
  // one per slot: the later layer wins (it's on top in 2D), and a dress replaces a top and bottom and vice versa
  const out: Wear3DIn[] = [];
  for (let i = wear.length - 1; i >= 0; i--) {
    const w = wear[i], sl = w.shape ? slotOf(w.shape) : slotOf(shapeOf(w.category!, w.shape3d)!);
    const clash = (o: Wear3DIn) => { const os = o.shape ? slotOf(o.shape) : slotOf(shapeOf(o.category!, o.shape3d)!); return os === sl || (sl === 'dress' && (os === 'top' || os === 'bottom')) || ((sl === 'top' || sl === 'bottom') && os === 'dress'); };
    if (!out.some(clash)) out.unshift(w);
  }
  return { wear: out, skipped };
}

/** Her 2D hairstyle as the nearest of the 3D ones. */
export function hairTo3D(h: string): 'braids' | 'afro' | 'bun' | 'long' {
  if (h === 'braids' || h === 'locs' || h === 'cornrows') return 'braids';
  if (h === 'afro' || h === 'puffs' || h === 'curly' || h === 'pixie') return 'afro';
  if (h === 'bun') return 'bun';
  return 'long';
}
