'use client';
import React, { useState, useEffect } from 'react';
import s from './theme.module.css';
import { Btn, Lbl, Topbar, Toast, useToast } from '@/components/ui';
import { getSettings, saveSettings } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';

// ─── PRESETS ──────────────────────────────────────────────────

const PRESETS = [
  { name:'Default',  bg:'#0d0a0f', accent:'#ff8c00', secondary:'#7c3aed', text:'#f5e6d0' },
  { name:'Warm',     bg:'#f5f0e8', accent:'#c9736a', secondary:'#9b8ec4', text:'#1a1612' },
  { name:'Midnight', bg:'#0d0f1a', accent:'#7b8eff', secondary:'#c4b0ff', text:'#e8e0ff' },
  { name:'Sage',     bg:'#0a1a0a', accent:'#4ade80', secondary:'#a3e635', text:'#d4f5d4' },
  { name:'Rose',     bg:'#1a0a10', accent:'#f43f5e', secondary:'#fb7185', text:'#ffe4e8' },
  { name:'Ocean',    bg:'#04111a', accent:'#22d3ee', secondary:'#38bdf8', text:'#e0f2fe' },
];

const FONTS: Record<string, string> = {
  comic:   "'Comic Sans MS', cursive",
  georgia: 'Georgia, serif',
  mono:    "'Courier New', monospace",
  system:  'system-ui, sans-serif',
};

const FONT_SIZES: { label: string; px: number }[] = [
  { label: 'XS',  px: 11 },
  { label: 'S',   px: 12 },
  { label: 'M',   px: 13 },
  { label: 'L',   px: 14 },
  { label: 'XL',  px: 15 },
  { label: 'XXL', px: 17 },
];

const DEFAULT_SIZE_IDX = 2;
const DEFAULT_THEME = PRESETS[0];
const DEFAULT_FONT  = 'comic';

type ThemeKey = 'bg' | 'accent' | 'secondary' | 'text';
interface Theme { name: string; bg: string; accent: string; secondary: string; text: string; }

// ─── HELPERS ──────────────────────────────────────────────────

function applyFontSize(px: number) {
  document.documentElement.style.fontSize = `${px}px`;
}

function applyThemeVars(theme: Theme, fontFamily: string) {
  const r = document.documentElement.style;
  r.setProperty('--bg',   theme.bg);
  r.setProperty('--surf', theme.bg);
  r.setProperty('--card', theme.bg === '#0d0a0f' ? '#1a1025' : `${theme.bg}cc`);
  r.setProperty('--or',   theme.accent);
  r.setProperty('--or-l', theme.accent);
  r.setProperty('--pu-l', theme.secondary);
  r.setProperty('--tx',   theme.text);
  r.setProperty('--font', fontFamily);
}

// Find which font key matches a stored font family string
function fontKeyFromFamily(family: string): string {
  const match = Object.entries(FONTS).find(([, v]) => v === family);
  return match ? match[0] : DEFAULT_FONT;
}

// Find which size index matches a stored px value
function sizeIdxFromPx(px: number): number {
  const idx = FONT_SIZES.findIndex(f => f.px === px);
  return idx > -1 ? idx : DEFAULT_SIZE_IDX;
}

// ─── PAGE ──────────────────────────────────────────────────────

export default function ThemePage() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [custom,    setCustom]    = useState<Theme>({ ...DEFAULT_THEME });
  const [font,      setFont]      = useState(DEFAULT_FONT);
  const [sizeIdx,   setSizeIdx]   = useState(DEFAULT_SIZE_IDX);
  const [saving,    setSaving]    = useState(false);
  const [toast, show] = useToast();

  // ── Load saved settings on mount ──────────────────────────
  useEffect(() => {
    async function load() {
      const ready = await ensureSession();
      if (!ready) return;
      try {
        const settings = await getSettings();
        if (!settings) return; // no saved settings yet — keep defaults

        const loadedTheme: Theme = {
          name:      'Custom',
          bg:        settings.theme_bg        || DEFAULT_THEME.bg,
          accent:    settings.theme_accent    || DEFAULT_THEME.accent,
          secondary: settings.theme_secondary || DEFAULT_THEME.secondary,
          text:      settings.theme_text      || DEFAULT_THEME.text,
        };

        // Check if loaded theme matches a preset
        const presetIdx = PRESETS.findIndex(p =>
          p.bg === loadedTheme.bg &&
          p.accent === loadedTheme.accent &&
          p.secondary === loadedTheme.secondary &&
          p.text === loadedTheme.text
        );

        setCustom(loadedTheme);
        setActiveIdx(presetIdx > -1 ? presetIdx : -1);
        setFont(fontKeyFromFamily(settings.theme_font || FONTS[DEFAULT_FONT]));
        setSizeIdx(sizeIdxFromPx(settings.theme_font_size || FONT_SIZES[DEFAULT_SIZE_IDX].px));

        // Apply immediately so the app reflects saved theme on page load
        applyThemeVars(loadedTheme, settings.theme_font || FONTS[DEFAULT_FONT]);
        applyFontSize(settings.theme_font_size || FONT_SIZES[DEFAULT_SIZE_IDX].px);
      } catch(e) {
        console.error('[theme] load error:', e);
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──────────────────────────────────────────────
  const applyPreset = (p: Theme, i: number) => {
    setActiveIdx(i);
    setCustom({ ...p });
  };

  const setColor = (key: ThemeKey, val: string) => {
    setCustom(c => ({ ...c, [key]: val }));
    setActiveIdx(-1);
  };

  const handleSizeChange = (idx: number) => {
    setSizeIdx(idx);
    applyFontSize(FONT_SIZES[idx].px);
  };

  // ── Save ──────────────────────────────────────────────────
  const save = async () => {
    setSaving(true);
    // Apply immediately
    applyThemeVars(custom, FONTS[font]);
    applyFontSize(FONT_SIZES[sizeIdx].px);
    try {
      await saveSettings({
        theme_bg:        custom.bg,
        theme_accent:    custom.accent,
        theme_secondary: custom.secondary,
        theme_text:      custom.text,
        theme_font:      FONTS[font],
        theme_font_size: FONT_SIZES[sizeIdx].px,
      });
      show('Theme saved! ✓');
    } catch(e) {
      console.error('[theme] save error:', e);
      show('Could not save theme.', '#f87171');
    } finally {
      setSaving(false);
    }
  };

  const currentSize = FONT_SIZES[sizeIdx];

  return (
    <div className={`${s.page} aFadeUp`}>
      <Topbar title="Theme & Colors ◑" sub="Make this space truly yours" />

      <div className={s.grid}>

        {/* ── Left: controls ───────────────────────────────── */}
        <div>

          {/* Preset swatches */}
          <Lbl>Preset Themes</Lbl>
          <div className={s.presetGrid}>
            {PRESETS.map((p, i) => (
              <div key={p.name} className={s.presetItem} onClick={() => applyPreset(p, i)}>
                <div className={`${s.presetSwatch} ${activeIdx === i ? s.presetSwatchActive : ''}`} style={{ background: p.bg }}>
                  <div className={s.presetDots}>
                    <div className={s.presetDot} style={{ background: p.accent }} />
                    <div className={s.presetDot} style={{ background: p.secondary }} />
                  </div>
                  {activeIdx === i && <div className={s.previewCheck}>✓</div>}
                </div>
                <div className={s.presetName}>{p.name}</div>
              </div>
            ))}
          </div>

          {/* Custom colour pickers */}
          <Lbl>Custom Colors</Lbl>
          {([
            ['Background', 'bg'],
            ['Accent',     'accent'],
            ['Secondary',  'secondary'],
            ['Text',       'text'],
          ] as [string, ThemeKey][]).map(([label, key]) => (
            <div key={key} className={s.colorRow}>
              <span className={s.colorLabel}>{label}</span>
              <div className={s.colorRight}>
                <div className={s.colorSwatch} style={{ background: custom[key] }}>
                  <input
                    type="color"
                    className={s.colorSwatchInput}
                    value={custom[key]}
                    onChange={e => setColor(key, e.target.value)}
                  />
                </div>
                <span className={s.colorHex}>{custom[key]}</span>
              </div>
            </div>
          ))}

          {/* Font family */}
          <Lbl>Font</Lbl>
          <div className={s.fontRow}>
            {Object.entries(FONTS).map(([k, v]) => (
              <span
                key={k}
                className={`${s.fontChip} ${font === k ? s.fontChipActive : ''}`}
                style={{ fontFamily: v }}
                onClick={() => setFont(k)}
              >{k}</span>
            ))}
          </div>

          {/* Font size */}
          <div className={s.sizeSection}>
            <div className={s.sizeLabelRow}>
              <Lbl>Font Size</Lbl>
              <span className={s.sizeValue}>{currentSize.label} · {currentSize.px}px</span>
            </div>
            <div className={s.sizeSteps}>
              {FONT_SIZES.map((f, i) => (
                <button
                  key={f.label}
                  className={`${s.sizeStep} ${sizeIdx === i ? s.sizeStepActive : ''}`}
                  onClick={() => handleSizeChange(i)}
                  style={{ fontSize: `${10 + i}px` }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className={s.sliderRow}>
              <span className={s.sliderA}>A</span>
              <input
                type="range"
                min={0}
                max={FONT_SIZES.length - 1}
                step={1}
                value={sizeIdx}
                onChange={e => handleSizeChange(Number(e.target.value))}
                className={s.sizeSlider}
              />
              <span className={s.sliderB}>A</span>
            </div>
            <div className={s.sizeHint}>
              Changes take effect immediately across the whole app
            </div>
          </div>
        </div>

        {/* ── Right: live preview ───────────────────────────── */}
        <div>
          <Lbl>Live Preview</Lbl>
          <div
            className={s.preview}
            style={{
              background: custom.bg,
              fontFamily: FONTS[font],
              fontSize:   `${currentSize.px}px`,
            }}
          >
            <div className={s.previewBar} style={{ background: 'rgba(0,0,0,0.4)' }}>
              <div className={s.previewLogo} style={{ color: custom.text }}>
                ✦ <span style={{ color: custom.accent }}>your</span>
                   <span style={{ color: custom.secondary }}>world</span>
              </div>
            </div>

            <div className={s.previewStats}>
              {([[127,'Saved',custom.accent],[34,'Places',custom.secondary],[12,'Journal',custom.text]] as [number,string,string][]).map(([n,l,c]) => (
                <div key={l} className={s.previewStat}>
                  <div className={s.previewStatNum} style={{ color: c }}>{n}</div>
                  <div className={s.previewStatLabel} style={{ color: 'rgba(255,255,255,0.35)' }}>{l}</div>
                </div>
              ))}
            </div>

            <div className={s.previewBtn} style={{ background: custom.accent, color: '#000' }}>
              + Add Entry
            </div>

            <div className={s.previewCard}>
              <div className={s.previewCardTitle} style={{ color: custom.text }}>
                The Barcelona trip
              </div>
              <div className={s.previewCardText}>
                I can&apos;t believe we actually went...
              </div>
            </div>

            <div className={s.previewSizeTag} style={{ color: custom.accent }}>
              {currentSize.label} · {currentSize.px}px
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <Btn full onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save Theme'}
            </Btn>
          </div>
          <div className={s.saveNote}>
            Saves colours, font &amp; size · applies to whole app instantly
          </div>
        </div>
      </div>

      {toast !== null && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}