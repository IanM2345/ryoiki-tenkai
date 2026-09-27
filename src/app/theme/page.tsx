'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Check, RotateCcw, Save, TriangleAlert, CircleCheck, Plus, Sparkles, Type, Palette, Layers } from 'lucide-react';
import s from './theme.module.css';
import { Btn, Tag, Topbar, Toast, useToast } from '@/components/ui';
import { getSettings, saveSettings } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import {
  PRESET_THEMES, APP_FONTS, FONT_SIZES, DEFAULT_THEME, DEFAULT_FONT_KEY, DEFAULT_SIZE_IDX,
  applyTheme, saveThemeLocally, readLocalTheme, fontKeyFromFamily, sizeIdxFromPx, type StoredTheme,
} from '@/lib/theme';

// ─── TYPES & HELPERS ──────────────────────────────────────────
type ColorKey = 'bg' | 'accent' | 'secondary' | 'text';
interface Draft { bg: string; accent: string; secondary: string; text: string; font: string; sizeIdx: number; }

const COLOR_FIELDS: { key: ColorKey; label: string; hint: string }[] = [
  { key: 'bg',        label: 'Background', hint: 'The page behind everything' },
  { key: 'accent',    label: 'Accent',     hint: 'Buttons, links and highlights' },
  { key: 'secondary', label: 'Secondary',  hint: 'Tags, icons and soft tints' },
  { key: 'text',      label: 'Text',       hint: 'Headings and body copy' },
];

const DEFAULT_DRAFT: Draft = {
  bg: DEFAULT_THEME.bg, accent: DEFAULT_THEME.accent, secondary: DEFAULT_THEME.secondary, text: DEFAULT_THEME.text,
  font: DEFAULT_FONT_KEY, sizeIdx: DEFAULT_SIZE_IDX,
};

/** Normalise #rgb / #rrggbb (with or without #) to lowercase #rrggbb, or null. */
function normHex(v: string | null | undefined): string | null {
  const m = (v ?? '').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  return `#${h.toLowerCase()}`;
}

function luminance(hex: string): number {
  const h = normHex(hex) ?? '#000000';
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const sameDraft = (a: Draft, b: Draft) =>
  a.bg === b.bg && a.accent === b.accent && a.secondary === b.secondary && a.text === b.text && a.font === b.font && a.sizeIdx === b.sizeIdx;

const toStored = (d: Draft): StoredTheme => ({
  bg: d.bg, accent: d.accent, secondary: d.secondary, text: d.text,
  font: APP_FONTS[d.font]?.family ?? APP_FONTS[DEFAULT_FONT_KEY].family,
  fontSize: FONT_SIZES[d.sizeIdx]?.px ?? FONT_SIZES[DEFAULT_SIZE_IDX].px,
});

function fromStored(t: StoredTheme, base: Draft = DEFAULT_DRAFT): Draft {
  return {
    bg:        normHex(t.bg)        ?? base.bg,
    accent:    normHex(t.accent)    ?? base.accent,
    secondary: normHex(t.secondary) ?? base.secondary,
    text:      normHex(t.text)      ?? base.text,
    font:      t.font ? fontKeyFromFamily(t.font) : base.font,
    sizeIdx:   t.fontSize ? sizeIdxFromPx(t.fontSize) : base.sizeIdx,
  };
}

const presetVars = (p: { bg: string; accent: string; secondary: string; text: string }) => ({
  ['--p-bg' as string]: p.bg, ['--p-ac' as string]: p.accent, ['--p-se' as string]: p.secondary, ['--p-tx' as string]: p.text,
});

// ─── COLOUR FIELD ─────────────────────────────────────────────
function ColorField({ id, label, hint, value, onChange }: { id: string; label: string; hint: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  // Follow outside changes (picker, presets, reset) without an effect.
  if (value !== prev) { setPrev(value); setText(value); }

  return (
    <div className={s.colorRow}>
      <label className={s.swatch} style={{ ['--sw' as string]: value }}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)} aria-label={`${label} colour picker`} />
      </label>
      <div className={s.colorText}>
        <label htmlFor={id} className={s.colorLabel}>{label}</label>
        <span className={s.colorHint}>{hint}</span>
      </div>
      <input
        id={id}
        className={s.hexInput}
        value={text}
        spellCheck={false}
        autoComplete="off"
        maxLength={7}
        onChange={e => {
          setText(e.target.value);
          const h = normHex(e.target.value);
          if (h) onChange(h);
        }}
        onBlur={() => setText(value)}
      />
    </div>
  );
}

// ─── PAGE ──────────────────────────────────────────────────────
export default function ThemePage() {
  const [saved, setSaved]   = useState<Draft>(DEFAULT_DRAFT);
  const [draft, setDraft]   = useState<Draft>(DEFAULT_DRAFT);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, show] = useToast();
  const savedRef = useRef<Draft>(DEFAULT_DRAFT);
  const previewingRef = useRef(false);

  const dirty = loaded && !sameDraft(saved, draft);

  // ── Load: local copy first (instant), then the database ────
  useEffect(() => {
    (async () => {
      const local = fromStored(readLocalTheme());
      setSaved(local); setDraft(local); savedRef.current = local;
      try {
        if (!(await ensureSession())) return;
        const st = await getSettings();
        if (!st) return;
        const fromDb = fromStored({
          bg: st.theme_bg, accent: st.theme_accent, secondary: st.theme_secondary, text: st.theme_text,
          font: st.theme_font, fontSize: st.theme_font_size,
        }, local);
        setSaved(fromDb); setDraft(fromDb); savedRef.current = fromDb;
        // Keep this device in sync with the theme saved in the database.
        saveThemeLocally(toStored(fromDb));
      } catch {
        show('Could not load your saved theme.', 'var(--red)');
      } finally {
        setLoaded(true);
      }
    })();
  }, [show]);

  // ── Live apply: the whole app previews the draft ───────────
  useEffect(() => {
    if (!loaded) return;
    applyTheme(toStored(draft));
    previewingRef.current = true;
  }, [draft, loaded]);

  // Leaving the page without saving puts the saved theme back
  // (only once we have actually previewed something).
  useEffect(() => () => { if (previewingRef.current) applyTheme(toStored(savedRef.current)); }, []);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // ── Handlers ───────────────────────────────────────────────
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft(d => ({ ...d, [k]: v }));
  const pickPreset = (p: typeof PRESET_THEMES[number]) =>
    setDraft(d => ({ ...d, bg: p.bg, accent: p.accent, secondary: p.secondary, text: p.text }));
  const reset = () => setDraft(saved);
  const restoreDefaults = () => setDraft(DEFAULT_DRAFT);

  const save = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    const next = draft;
    const stored = toStored(next);
    try {
      await saveSettings({
        theme_bg: next.bg, theme_accent: next.accent, theme_secondary: next.secondary, theme_text: next.text,
        theme_font: stored.font, theme_font_size: stored.fontSize,
      });
      saveThemeLocally(stored);
      setSaved(next); savedRef.current = next;
      show('Theme saved');
    } catch {
      show('Could not save your theme. Your changes are still here.', 'var(--red)');
    } finally {
      setSaving(false);
    }
  };

  const activePreset = PRESET_THEMES.findIndex(p =>
    p.bg === draft.bg && p.accent === draft.accent && p.secondary === draft.secondary && p.text === draft.text);
  const ratio = contrast(draft.text, draft.bg);
  const lowContrast = ratio < 4.5;
  const size = FONT_SIZES[draft.sizeIdx] ?? FONT_SIZES[DEFAULT_SIZE_IDX];
  const isDefault = sameDraft(draft, DEFAULT_DRAFT);

  return (
    <div className={s.page}>
      <Topbar title="Theme" sub="Make this space feel like yours" maxWidth={1120} />

      <div className={s.wrap}>
        <div className={s.layout}>
          {/* ── Controls ──────────────────────────────────── */}
          <div className={s.controls}>
            <section className={s.card} aria-labelledby="presets-title">
              <h2 id="presets-title" className={s.cardTitle}><Layers size={17} strokeWidth={2} /> Presets</h2>
              <div className={s.presets} role="radiogroup" aria-label="Preset themes">
                {PRESET_THEMES.map((p, i) => {
                  const on = activePreset === i;
                  return (
                    <button
                      key={p.name}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={`${s.preset} ${on ? s.presetOn : ''}`}
                      style={presetVars(p)}
                      onClick={() => pickPreset(p)}
                      disabled={!loaded}
                    >
                      <span className={s.mini} aria-hidden>
                        <span className={s.miniBar}>
                          <span className={s.miniDot} />
                          <span className={s.miniLine} />
                        </span>
                        <span className={s.miniBody}>
                          <span className={s.miniText}>Aa</span>
                          <span className={s.miniSub}>Hello there</span>
                          <span className={s.miniRow}>
                            <span className={s.miniBtn} />
                            <span className={s.miniTag} />
                          </span>
                        </span>
                        {on && <span className={s.miniCheck}><Check size={12} strokeWidth={3} /></span>}
                      </span>
                      <span className={s.presetName}>{p.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className={s.card} aria-labelledby="colours-title">
              <h2 id="colours-title" className={s.cardTitle}><Palette size={17} strokeWidth={2} /> Colours</h2>
              {!loaded ? (
                [0, 1, 2, 3].map(i => <div key={i} className={`skeleton ${s.rowSkel}`} />)
              ) : (
                <div className={s.colorList}>
                  {COLOR_FIELDS.map(f => (
                    <ColorField key={f.key} id={`theme-${f.key}`} label={f.label} hint={f.hint} value={draft[f.key]} onChange={v => set(f.key, v)} />
                  ))}
                </div>
              )}
              <div className={`${s.contrast} ${lowContrast ? s.contrastLow : ''}`} role={lowContrast ? 'alert' : undefined}>
                {lowContrast ? <TriangleAlert size={16} strokeWidth={2} /> : <CircleCheck size={16} strokeWidth={2} />}
                <span>
                  {lowContrast
                    ? `Text may be hard to read on this background (contrast ${ratio.toFixed(1)} to 1). Aim for 4.5 or more.`
                    : `Text is easy to read on this background (contrast ${ratio.toFixed(1)} to 1).`}
                </span>
              </div>
            </section>

            <section className={s.card} aria-labelledby="type-title">
              <h2 id="type-title" className={s.cardTitle}><Type size={17} strokeWidth={2} /> Text</h2>
              <span className={s.subLbl} id="font-lbl">Font</span>
              <div className={s.fonts} role="radiogroup" aria-labelledby="font-lbl">
                {Object.entries(APP_FONTS).map(([k, f]) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={draft.font === k}
                    className={`${s.font} ${draft.font === k ? s.fontOn : ''}`}
                    style={{ ['--ff' as string]: f.family }}
                    onClick={() => set('font', k)}
                    disabled={!loaded}
                  >
                    <span className={s.fontSample}>Aa</span>
                    <span className={s.fontName}>{f.label}</span>
                  </button>
                ))}
              </div>

              <span className={s.subLbl} id="size-lbl">Size <span className={s.subVal}>{size.px}px</span></span>
              <div className={s.sizes} role="radiogroup" aria-labelledby="size-lbl">
                {FONT_SIZES.map((f, i) => (
                  <button
                    key={f.label}
                    type="button"
                    role="radio"
                    aria-checked={draft.sizeIdx === i}
                    aria-label={`${f.label}, ${f.px} pixels`}
                    className={`${s.size} ${draft.sizeIdx === i ? s.sizeOn : ''}`}
                    style={{ ['--fs' as string]: `${11 + i * 1.5}px` }}
                    onClick={() => set('sizeIdx', i)}
                    disabled={!loaded}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </section>
          </div>

          {/* ── Preview + save ───────────────────────────── */}
          <aside className={s.side}>
            <section className={s.preview} aria-labelledby="preview-title">
              <h2 id="preview-title" className={s.previewLbl}>Live preview</h2>
              <div className={s.pvBar}>
                <Sparkles size={15} strokeWidth={2} className={s.pvLogo} />
                <span className={s.pvBrand}><span className={s.pvYour}>your</span><span className={s.pvWorld}>world</span></span>
              </div>
              <div className={s.pvCard}>
                <div className={s.pvCardTitle}>The Barcelona trip</div>
                <p className={s.pvCardText}>I still can&apos;t believe we actually went. Sunsets, tapas and far too many stairs.</p>
                <div className={s.pvTags}>
                  <Tag color="var(--pu-l)">travel</Tag>
                  <Tag color="var(--or)">favourite</Tag>
                </div>
              </div>
              <div className={s.pvActions}>
                <Btn sm><Plus size={15} strokeWidth={2.25} /> Add entry</Btn>
                <Btn sm variant="ghost">Later</Btn>
              </div>
              <p className={s.pvMuted}>Muted text looks like this, and <span className={s.pvLink}>links look like this</span>.</p>
            </section>

            <div className={`${s.saveBar} ${dirty ? s.saveBarDirty : ''}`}>
              <div className={s.status} aria-live="polite">
                {dirty
                  ? <><span className={s.statusDot} /> Unsaved changes</>
                  : <><Check size={15} strokeWidth={2.5} className={s.statusOk} /> {loaded ? 'All changes saved' : 'Loading your theme'}</>}
              </div>
              <div className={s.saveActions}>
                <Btn variant="ghost" sm onClick={reset} disabled={!dirty || saving}><RotateCcw size={14} strokeWidth={2.25} /> Reset</Btn>
                <Btn sm onClick={save} disabled={!dirty || saving}><Save size={14} strokeWidth={2.25} /> {saving ? 'Saving' : 'Save'}</Btn>
              </div>
            </div>
            <p className={s.saveNote}>
              Changes preview across the whole app right away. Save to keep them on every device, or Reset to go back.
              {!isDefault && loaded && <> <button type="button" className={s.linkBtn} onClick={restoreDefaults}>Use the default look</button></>}
            </p>
          </aside>
        </div>
      </div>

      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}
