// ─── THEME: single source of truth ───────────────────────────
// Used by the no-flash script in layout.tsx, the Theme page, and
// anywhere else that needs to know or apply the current theme.
// Only four base colours are set; globals.css derives every other
// shade from them, so a theme change reaches every page.

export interface Theme {
  name: string;
  bg: string;
  accent: string;
  secondary: string;
  text: string;
}

export const PRESET_THEMES: Theme[] = [
  { name: 'Default',  bg: '#0d0a0f', accent: '#ff8c00', secondary: '#a855f7', text: '#f5e6d0' },
  { name: 'Warm',     bg: '#f5f0e8', accent: '#c9736a', secondary: '#9b8ec4', text: '#1a1612' },
  { name: 'Midnight', bg: '#0d0f1a', accent: '#7b8eff', secondary: '#c4b0ff', text: '#e8e0ff' },
  { name: 'Sage',     bg: '#0a1a0a', accent: '#4ade80', secondary: '#a3e635', text: '#d4f5d4' },
  { name: 'Rose',     bg: '#1a0a10', accent: '#f43f5e', secondary: '#fb7185', text: '#ffe4e8' },
  { name: 'Ocean',    bg: '#04111a', accent: '#22d3ee', secondary: '#38bdf8', text: '#e0f2fe' },
  { name: 'Bubblegum', bg: '#160811', accent: '#ff5db1', secondary: '#b57bff', text: '#ffe4f3' },
];

export const DEFAULT_THEME = PRESET_THEMES[0];

export const APP_FONTS: Record<string, { label: string; family: string }> = {
  comic:   { label: 'Comic',       family: "var(--font-comic), 'Comic Sans MS', cursive" },
  caveat:  { label: 'Handwriting', family: "'Caveat', 'Comic Sans MS', cursive" },
  fredoka: { label: 'Rounded',     family: "'Fredoka', system-ui, sans-serif" },
  space:   { label: 'Modern',      family: "'Space Grotesk', system-ui, sans-serif" },
  storybook: { label: 'Storybook', family: "'Lora', Georgia, serif" },
  georgia: { label: 'Georgia',     family: 'Georgia, "Times New Roman", serif' },
  mono:    { label: 'Mono',        family: "ui-monospace, 'Cascadia Mono', 'Courier New', monospace" },
  system:  { label: 'System',      family: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
};
export const DEFAULT_FONT_KEY = 'comic';

export const FONT_SIZES = [
  { label: 'XS',  px: 13 },
  { label: 'S',   px: 14 },
  { label: 'M',   px: 15 },
  { label: 'L',   px: 16 },
  { label: 'XL',  px: 17 },
  { label: 'XXL', px: 19 },
] as const;
export const DEFAULT_SIZE_IDX = 2;

export const THEME_STORAGE_KEY = 'yw-theme';

export interface StoredTheme {
  bg?: string; accent?: string; secondary?: string; text?: string;
  font?: string; fontSize?: number;
}

/** Map any stored font family (including legacy values) to a font key. */
export function fontKeyFromFamily(family?: string | null): string {
  if (!family) return DEFAULT_FONT_KEY;
  if (/caveat/i.test(family)) return 'caveat';
  if (/fredoka/i.test(family)) return 'fredoka';
  if (/space grotesk/i.test(family)) return 'space';
  if (/lora/i.test(family)) return 'storybook';
  if (/comic/i.test(family)) return 'comic';
  if (/georgia/i.test(family)) return 'georgia';
  if (/mono|courier/i.test(family)) return 'mono';
  if (/serif/i.test(family) && !/sans/i.test(family)) return 'storybook';
  if (/system|sans-serif/i.test(family)) return 'system';
  return DEFAULT_FONT_KEY;
}

/** Nearest size index for a stored px value (old sizes were 11–17px). */
export function sizeIdxFromPx(px?: number | null): number {
  if (!px) return DEFAULT_SIZE_IDX;
  let best = 0;
  FONT_SIZES.forEach((s, i) => {
    if (Math.abs(s.px - px) < Math.abs(FONT_SIZES[best].px - px)) best = i;
  });
  // Old default (13px) and below all map up to the new readable default.
  return px <= 13 ? DEFAULT_SIZE_IDX : best;
}

/** Relative luminance, used to pick readable text on the accent colour. */
function luminance(hex: string): number {
  const m = hex.replace('#', '').match(/.{2}/g);
  if (!m || m.length < 3) return 0;
  const [r, g, b] = m.slice(0, 3).map(h => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function applyTheme(t: StoredTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const st = root.style;
  if (t.bg)        st.setProperty('--bg', t.bg);
  if (t.accent)    st.setProperty('--or', t.accent);
  if (t.secondary) st.setProperty('--pu-l', t.secondary);
  if (t.text)      st.setProperty('--tx', t.text);
  if (t.accent)    st.setProperty('--on-accent', luminance(t.accent) > 0.35 ? '#120a02' : '#fffaf3');
  if (t.bg)        root.dataset.scheme = luminance(t.bg) > 0.5 ? 'light' : 'dark';
  if (t.font)      st.setProperty('--font', APP_FONTS[fontKeyFromFamily(t.font)].family);
  if (t.fontSize)  st.fontSize = `${FONT_SIZES[sizeIdxFromPx(t.fontSize)].px}px`;
}

export function saveThemeLocally(t: StoredTheme): void {
  try { localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(t)); } catch { /* private mode */ }
}

export function readLocalTheme(): StoredTheme {
  try { return JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) || '{}'); } catch { return {}; }
}

/**
 * Inline script for <head>: applies the saved theme before first paint so
 * there is no flash of the default colours. Hand-written ES5 that mirrors
 * applyTheme() (functions can't be serialised safely after minification).
 */
export const themeInitScript = `(function(){try{
var t=JSON.parse(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})||'{}');
var FS=${JSON.stringify(FONT_SIZES.map(f => f.px))},DEF=${DEFAULT_SIZE_IDX};
var F=${JSON.stringify(Object.fromEntries(Object.entries(APP_FONTS).map(([k, v]) => [k, v.family])))};
function lum(h){var m=(h||'').replace('#','').match(/.{2}/g);if(!m||m.length<3)return 0;var c=m.slice(0,3).map(function(x){x=parseInt(x,16)/255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4)});return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]}
var d=document.documentElement,s=d.style;
if(t.bg){s.setProperty('--bg',t.bg);d.dataset.scheme=lum(t.bg)>0.5?'light':'dark'}
if(t.accent){s.setProperty('--or',t.accent);s.setProperty('--on-accent',lum(t.accent)>0.35?'#120a02':'#fffaf3')}
if(t.secondary)s.setProperty('--pu-l',t.secondary);
if(t.text)s.setProperty('--tx',t.text);
if(t.font){var k=/comic/i.test(t.font)?'comic':/mono|courier/i.test(t.font)?'mono':/georgia/i.test(t.font)?'georgia':/system|sans/i.test(t.font)?'system':'comic';s.setProperty('--font',F[k])}
if(t.fontSize){var p=t.fontSize,b=0;for(var i=0;i<FS.length;i++){if(Math.abs(FS[i]-p)<Math.abs(FS[b]-p))b=i}if(p<=13)b=DEF;s.fontSize=FS[b]+'px'}
}catch(e){}})();`;
