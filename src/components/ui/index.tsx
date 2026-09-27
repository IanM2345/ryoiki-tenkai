'use client';
import React, { useState, useEffect, useRef, useCallback, ReactNode, KeyboardEvent } from 'react';
import { Star, X, Search, CircleCheck, TriangleAlert, Check, Sparkles } from 'lucide-react';
import s from './ui.module.css';
import { Glyph } from './icons';
import type { DbSoul } from '@/lib/db';
import SoulAvatar from '@/components/souls/SoulAvatar';

export { Glyph, glyphIcon } from './icons';

/** Tint helper: works for hex colours and CSS variables alike. */
const tint = (c: string, pct: number) => `color-mix(in oklab, ${c} ${pct}%, transparent)`;

// ─── BUTTON ───────────────────────────────────────────────────
type BtnVariant = 'or' | 'purple' | 'ghost' | 'danger';
interface BtnProps {
  variant?: BtnVariant; sm?: boolean; full?: boolean; disabled?: boolean; children: ReactNode;
  onClick?: () => void; className?: string; type?: 'button' | 'submit' | 'reset'; ariaLabel?: string;
}

const VARIANT_CLASS: Record<BtnVariant, string> = {
  or: s.btnOr, purple: s.btnPurple, ghost: s.btnGhost, danger: s.btnDanger,
};

export function Btn({ variant = 'or', sm, full, disabled, children, onClick, className = '', type = 'button', ariaLabel }: BtnProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      className={`${s.btn} ${VARIANT_CLASS[variant]} ${sm ? s.btnSm : ''} ${full ? s.btnFull : ''} ${className}`}
    >
      {children}
    </button>
  );
}

// ─── LABEL ────────────────────────────────────────────────────
export function Lbl({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`${s.lbl} ${className}`}>{children}</span>;
}

// ─── TAG ──────────────────────────────────────────────────────
export function Tag({ color = 'var(--or)', children, onRemove }: { color?: string; children: ReactNode; onRemove?: () => void; }) {
  return (
    <span className={s.tag} style={{ background: tint(color, 14), color, borderColor: tint(color, 30) }}>
      {children}
      {onRemove && (
        <button type="button" className={s.tagRemoveBtn} onClick={onRemove} aria-label={`Remove ${String(children)}`}>
          <X size={12} strokeWidth={2.25} />
        </button>
      )}
    </span>
  );
}

// ─── PILL (filter chip) ───────────────────────────────────────
export function Pill({ children, active, color = 'var(--or)', onClick }: { children: ReactNode; active?: boolean; color?: string; onClick?: () => void; }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      className={`${s.pill} ${active ? s.pillActive : ''}`}
      style={active ? { background: color, borderColor: color } : undefined}
    >
      {children}
    </button>
  );
}

// ─── STARS ────────────────────────────────────────────────────
export function Stars({ n, onSet, size = 14 }: { n: number; onSet?: (v: number) => void; size?: number; }) {
  const [hover, setHover] = useState(0);
  const shown = hover || n;
  if (!onSet) {
    return (
      <span className={s.stars} aria-label={`${n} out of 5 stars`} role="img">
        {[1, 2, 3, 4, 5].map(i => (
          <Star key={i} size={size} strokeWidth={1.5} className={i <= n ? s.starOn : s.starOff} fill={i <= n ? 'currentColor' : 'none'} />
        ))}
      </span>
    );
  }
  return (
    <span className={s.stars} role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={n === i}
          aria-label={`${i} star${i > 1 ? 's' : ''}`}
          className={s.starBtn}
          onMouseEnter={() => setHover(i)}
          onClick={() => onSet(i === n ? 0 : i)}
        >
          <Star size={size} strokeWidth={1.5} className={i <= shown ? s.starOn : s.starOff} fill={i <= shown ? 'currentColor' : 'none'} />
        </button>
      ))}
    </span>
  );
}

// ─── PROGRESS BAR ─────────────────────────────────────────────
export function Bar({ pct, color = 'var(--or)', h = 6 }: { pct: number; color?: string; h?: number; }) {
  const v = Math.min(100, Math.max(0, pct));
  return (
    <div className={s.barTrack} style={{ height: h }} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className={s.barFill} style={{ transform: `scaleX(${v / 100})`, background: color }} />
    </div>
  );
}

// ─── BADGE ────────────────────────────────────────────────────
export function Badge({ color = 'var(--or)', children }: { color?: string; children: ReactNode; }) {
  return <span className={s.badge} style={{ background: tint(color, 14), color, borderColor: tint(color, 30) }}>{children}</span>;
}

// ─── DIVIDER ──────────────────────────────────────────────────
export function Divider() { return <div className={s.divider} role="separator" />; }

// ─── CARD ─────────────────────────────────────────────────────
export function Card({ children, hover, className = '' }: { children: ReactNode; hover?: boolean; className?: string; }) {
  return <div className={`${s.card} ${hover ? s.cardHov : ''} ${className}`}>{children}</div>;
}

// ─── TOAST ────────────────────────────────────────────────────
export function Toast({ msg, color = 'var(--gr)' }: { msg: string; color?: string; }) {
  const isError = /red|f87171|ef4444/i.test(color);
  return (
    <div className={s.toast} style={{ borderColor: tint(color, 40) }} role="status" aria-live="polite">
      {isError
        ? <TriangleAlert size={16} strokeWidth={2} style={{ color }} />
        : <CircleCheck size={16} strokeWidth={2} style={{ color }} />}
      <span>{msg}</span>
    </div>
  );
}

// ─── MODAL ────────────────────────────────────────────────────
export function Modal({ children, onClose }: { children: ReactNode; onClose?: () => void; }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') closeRef.current?.(); };
    window.addEventListener('keydown', onKey);
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = 'hidden';
    // Move focus into the dialog (first field if there is one).
    const first = boxRef.current?.querySelector<HTMLElement>('input, textarea, select, button');
    first?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      html.style.overflow = prevOverflow;
      prev?.focus?.({ preventScroll: true });
    };
  }, []);

  return (
    <div className={s.overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div ref={boxRef} className={s.modalBox} role="dialog" aria-modal="true">
        {onClose && (
          <button type="button" className={s.modalClose} onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2} />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

export function ModalTitle({ children }: { children: ReactNode }) {
  return <h2 className={s.modalTitle}>{children}</h2>;
}

export function ModalFooter({ onCancel, onSave, saveLabel = 'Save', danger }: { onCancel: () => void; onSave: () => void; saveLabel?: string; danger?: boolean; }) {
  return (
    <div className={s.modalFooter}>
      <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
      <Btn variant={danger ? 'danger' : 'or'} onClick={onSave}>{saveLabel}</Btn>
    </div>
  );
}

// ─── CONFIRM ──────────────────────────────────────────────────
export function Confirm({ msg, onConfirm, onCancel }: { msg: string; onConfirm: () => void; onCancel: () => void; }) {
  return (
    <div className={s.confirm} role="alertdialog" aria-labelledby="confirm-title">
      <div className={s.confirmIcon}><TriangleAlert size={22} strokeWidth={1.75} /></div>
      <div id="confirm-title" className={s.confirmTitle}>Are you sure?</div>
      <div className={s.confirmMsg}>{msg}</div>
      <div className={s.confirmActions}>
        <Btn variant="ghost" onClick={onCancel}>Keep it</Btn>
        <Btn variant="danger" onClick={onConfirm}>Yes, delete</Btn>
      </div>
    </div>
  );
}

// ─── FIELD INPUT ──────────────────────────────────────────────
let fieldSeq = 0;
function useFieldId() {
  const ref = useRef<string>('');
  if (!ref.current) ref.current = `f${++fieldSeq}`;
  return ref.current;
}

interface FInputProps { label?: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; style?: React.CSSProperties; }
export function FInput({ label, value, onChange, placeholder, type = 'text', style }: FInputProps) {
  const id = useFieldId();
  return (
    <div className={s.fieldWrap} style={style}>
      {label && <label htmlFor={id} className={s.lbl}>{label}</label>}
      <input id={id} type={type} className={s.fieldInput} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

// ─── FIELD TEXTAREA ───────────────────────────────────────────
export function FArea({ label, value, onChange, placeholder, rows = 4 }: { label?: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; }) {
  const id = useFieldId();
  return (
    <div className={s.fieldWrap}>
      {label && <label htmlFor={id} className={s.lbl}>{label}</label>}
      <textarea id={id} rows={rows} className={s.fieldArea} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

// ─── TAG INPUT ────────────────────────────────────────────────
export function TagInput({ tags, onAdd, onRemove, color = 'var(--or)' }: { tags: string[]; onAdd: (t: string) => void; onRemove: (t: string) => void; color?: string; }) {
  const [v, setV] = useState('');

  const commit = () => {
    const trimmed = v.trim().replace(/,$/, '');
    if (trimmed && !tags.includes(trimmed)) onAdd(trimmed);
    setV('');
  };

  const handle = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      e.stopPropagation(); // keep Enter from reaching the modal's Save button
      commit();
    }
    if (e.key === 'Backspace' && !v && tags.length) onRemove(tags[tags.length - 1]);
  };

  return (
    <div className={s.tagInputWrap}>
      {tags.map(t => <Tag key={t} color={color} onRemove={() => onRemove(t)}>{t}</Tag>)}
      <input
        className={s.tagInlineInput}
        placeholder={tags.length ? 'Add another' : 'Add a tag and press Enter'}
        value={v}
        onChange={e => setV(e.target.value)}
        onKeyDown={handle}
        onBlur={commit}
        aria-label="Add tag"
      />
    </div>
  );
}

// ─── SEARCH BAR ───────────────────────────────────────────────
export function SearchBar({ value, onChange, placeholder = 'Search', className = '' }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; }) {
  return (
    <div className={`${s.searchBar} ${className}`}>
      <Search size={16} strokeWidth={2} className={s.searchIcon} aria-hidden />
      <input className={s.searchInput} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder.replace(/\.\.\.$|…$/, '')} aria-label={placeholder} type="search" />
      {value && (
        <button type="button" className={s.searchClear} onClick={() => onChange('')} aria-label="Clear search">
          <X size={14} strokeWidth={2.25} />
        </button>
      )}
    </div>
  );
}

// ─── INNER TABS ───────────────────────────────────────────────
export function InnerTabs({ tabs, active, onTab }: { tabs: [string, string][]; active: string; onTab: (k: string) => void; }) {
  return (
    <div className={s.innerTabs} role="tablist">
      {tabs.map(([k, l]) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={active === k}
          onClick={() => onTab(k)}
          className={`${s.innerTab} ${active === k ? s.innerTabActive : ''}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

// ─── TOPBAR ───────────────────────────────────────────────────
export function Topbar({ title, sub, action, maxWidth }: { title: string; sub?: string; action?: ReactNode; maxWidth?: number; }) {
  return (
    <header className={s.topbar} style={maxWidth ? { maxWidth } : undefined}>
      <div className={s.topbarLeft}>
        <h1 className={s.topbarTitle}>{title}</h1>
        {sub && <p className={s.topbarSub}>{sub}</p>}
      </div>
      {action && <div className={s.topbarAction}>{action}</div>}
    </header>
  );
}

// ─── EMPTY STATE ──────────────────────────────────────────────
export function EmptyState({ icon = '✦', msg, action }: { icon?: ReactNode; msg: string; action?: ReactNode; }) {
  return (
    <div className={s.emptyState}>
      <div className={s.emptyIcon}>
        {typeof icon === 'string' ? <Glyph g={icon} size={26} strokeWidth={1.5} /> : icon ?? <Sparkles size={26} />}
      </div>
      <p className={s.emptyMsg}>{msg}</p>
      {action}
    </div>
  );
}

// ─── TOGGLE ───────────────────────────────────────────────────
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string; }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`${s.toggle} ${checked ? s.toggleOn : ''}`}
    >
      <span className={s.toggleThumb} />
    </button>
  );
}

// ─── USE TOAST ────────────────────────────────────────────────
export function useToast(): [{ msg: string; color?: string } | null, (msg: string, color?: string) => void] {
  const [toast, setToast] = useState<{ msg: string; color?: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = useCallback((msg: string, color?: string) => {
    clearTimeout(timer.current);
    setToast({ msg: msg.replace(/^[✓✔]\s*/, ''), color });
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  return [toast, show];
}

// ─── SOUL PICKER ──────────────────────────────────────────────
export interface SoulPickerProps {
  souls: DbSoul[];                    // all available souls
  linkedIds: string[];                // currently linked soul ids
  onToggle: (soulId: string) => void; // parent flips the id in or out of linkedIds
}

export function SoulPicker({ souls, linkedIds, onToggle }: SoulPickerProps) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filtered = !q ? souls : souls.filter(x => x.name.toLowerCase().includes(q) || (x.role ?? '').toLowerCase().includes(q));

  return (
    <div className={s.soulPicker}>
      <div className={s.searchBar}>
        <Search size={15} strokeWidth={2} className={s.searchIcon} aria-hidden />
        <input
          className={s.searchInput}
          type="search"
          placeholder="Find someone"
          aria-label="Find someone"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.stopPropagation()}
        />
      </div>

      <div className={s.soulList}>
        {filtered.length === 0 && <p className={s.soulEmpty}>Nobody matches that yet</p>}
        {filtered.map(soul => {
          const linked = linkedIds.includes(soul.id);
          return (
            <button
              key={soul.id}
              type="button"
              aria-pressed={linked}
              onClick={e => { e.stopPropagation(); onToggle(soul.id); }}
              className={`${s.soulRow} ${linked ? s.soulRowOn : ''}`}
              style={linked ? { background: tint(soul.color, 14), borderColor: tint(soul.color, 60) } : undefined}
            >
              <SoulAvatar soul={soul} size={30} />
              <span className={s.soulText}>
                <span className={s.soulName}>{soul.name}</span>
                {soul.role && <span className={s.soulRole}>{soul.role}</span>}
              </span>
              {linked && <Check size={16} strokeWidth={2.5} style={{ color: soul.color }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
