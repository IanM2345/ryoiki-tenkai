'use client';
import React, { useState, ReactNode, KeyboardEvent } from 'react';
import s from './ui.module.css';
import type { DbSoul } from '@/lib/db';

// ─── BUTTON ───────────────────────────────────────────────────
type BtnVariant = 'or' | 'purple' | 'ghost' | 'danger';
interface BtnProps { variant?: BtnVariant; sm?: boolean; full?: boolean; disabled?: boolean; children: ReactNode; onClick?: () => void; className?: string; type?: 'button'|'submit'|'reset'; }

const VARIANT_CLASS: Record<BtnVariant, string> = {
  or: s.btnOr, purple: s.btnPurple, ghost: s.btnGhost, danger: s.btnDanger,
};

export function Btn({ variant='or', sm, full, disabled, children, onClick, className='', type='button' }: BtnProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${s.btn} ${VARIANT_CLASS[variant]} ${sm ? s.btnSm : ''} ${full ? s.btnFull : ''} ${className}`}
    >
      {children}
    </button>
  );
}

// ─── LABEL ────────────────────────────────────────────────────
export function Lbl({ children, className='' }: { children: ReactNode; className?: string }) {
  return <span className={`${s.lbl} ${className}`}>{children}</span>;
}

// ─── TAG ──────────────────────────────────────────────────────
export function Tag({ color='#ff8c00', children, onRemove }: { color?: string; children: ReactNode; onRemove?: () => void; }) {
  return (
    <span className={s.tag} style={{ background:`${color}22`, color, border:`1px solid ${color}44` }}>
      {children}
      {onRemove && <button className={s.tagRemoveBtn} onClick={onRemove} style={{ color }}>×</button>}
    </span>
  );
}

// ─── PILL ─────────────────────────────────────────────────────
export function Pill({ children, active, color='#ff8c00', onClick }: { children: ReactNode; active?: boolean; color?: string; onClick?: () => void; }) {
  return (
    <span
      onClick={onClick}
      className={s.pill}
      style={active ? { background: color, borderColor: color, color: '#000', fontWeight: 700 } : {}}
    >
      {children}
    </span>
  );
}

// ─── STARS ────────────────────────────────────────────────────
export function Stars({ n, onSet, size=13 }: { n: number; onSet?: (v: number) => void; size?: number; }) {
  return (
    <span className={s.stars}>
      {[1,2,3,4,5].map(i => (
        <span
          key={i}
          className={`${s.star} ${onSet ? s.starClickable : ''}`}
          style={{ color: i<=n ? '#ff8c00' : 'rgba(255,140,0,0.15)', fontSize: size }}
          onClick={() => onSet?.(i)}
          onMouseEnter={e => { if (onSet) (e.target as HTMLElement).style.color = '#ffb347'; }}
          onMouseLeave={e => { if (onSet) (e.target as HTMLElement).style.color = i<=n ? '#ff8c00' : 'rgba(255,140,0,0.15)'; }}
        >★</span>
      ))}
    </span>
  );
}

// ─── PROGRESS BAR ─────────────────────────────────────────────
export function Bar({ pct, color='#ff8c00', h=4 }: { pct: number; color?: string; h?: number; }) {
  return (
    <div className={s.barTrack} style={{ height: h }}>
      <div className={s.barFill} style={{ width:`${Math.min(100,Math.max(0,pct))}%`, background: color }} />
    </div>
  );
}

// ─── BADGE ────────────────────────────────────────────────────
export function Badge({ color='#ff8c00', children }: { color?: string; children: ReactNode; }) {
  return <span className={s.badge} style={{ background:`${color}22`, color, border:`1px solid ${color}44` }}>{children}</span>;
}

// ─── DIVIDER ──────────────────────────────────────────────────
export function Divider() { return <div className={s.divider} />; }

// ─── CARD ─────────────────────────────────────────────────────
export function Card({ children, hover, className='' }: { children: ReactNode; hover?: boolean; className?: string; }) {
  return <div className={`${s.card} ${hover ? s.cardHov : ''} ${className}`}>{children}</div>;
}

// ─── TOAST ────────────────────────────────────────────────────
export function Toast({ msg, color='#4ade80' }: { msg: string; color?: string; }) {
  return (
    <div className={s.toast} style={{ borderColor:`${color}55`, color }}>
      ✓ {msg}
    </div>
  );
}

// ─── MODAL ────────────────────────────────────────────────────
export function Modal({ children, onClose }: { children: ReactNode; onClose?: () => void; }) {
  return (
    <div className={`${s.overlay} aFadeIn`} onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`${s.modalBox} aFadeUp`}>
        {children}
      </div>
    </div>
  );
}

export function ModalTitle({ children }: { children: ReactNode }) {
  return <div className={s.modalTitle}>{children}</div>;
}

export function ModalFooter({ onCancel, onSave, saveLabel='Save', danger }: { onCancel: ()=>void; onSave: ()=>void; saveLabel?: string; danger?: boolean; }) {
  return (
    <div className={s.modalFooter}>
      <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
      <Btn variant={danger ? 'danger' : 'or'} onClick={onSave}>{saveLabel}</Btn>
    </div>
  );
}

// ─── CONFIRM ──────────────────────────────────────────────────
export function Confirm({ msg, onConfirm, onCancel }: { msg: string; onConfirm: ()=>void; onCancel: ()=>void; }) {
  return (
    <div className={s.confirm}>
      <div className={s.confirmIcon}>⚠️</div>
      <div className={s.confirmTitle}>Are you sure?</div>
      <div className={s.confirmMsg}>{msg}</div>
      <div className={s.confirmActions}>
        <Btn variant="ghost" onClick={onCancel}>Keep it</Btn>
        <Btn variant="danger" onClick={onConfirm}>Yes, delete</Btn>
      </div>
    </div>
  );
}

// ─── FIELD INPUT ──────────────────────────────────────────────
interface FInputProps { label?: string; value: string; onChange: (v:string)=>void; placeholder?: string; type?: string; style?: React.CSSProperties; }
export function FInput({ label, value, onChange, placeholder, type='text', style }: FInputProps) {
  return (
    <div className={s.fieldWrap} style={style}>
      {label && <Lbl>{label}</Lbl>}
      <input type={type} className={s.fieldInput} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

// ─── FIELD TEXTAREA ───────────────────────────────────────────
export function FArea({ label, value, onChange, placeholder, rows=4 }: { label?: string; value: string; onChange: (v:string)=>void; placeholder?: string; rows?: number; }) {
  return (
    <div className={s.fieldWrap}>
      {label && <Lbl>{label}</Lbl>}
      <textarea rows={rows} className={s.fieldArea} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{ minHeight: rows*26 }} />
    </div>
  );
}

// ─── TAG INPUT ────────────────────────────────────────────────
export function TagInput({ tags, onAdd, onRemove, color='#ff8c00' }: { tags: string[]; onAdd:(t:string)=>void; onRemove:(t:string)=>void; color?: string; }) {
  const [v, setV] = useState('');

  const commit = () => {
    const trimmed = v.trim();
    if (trimmed && !tags.includes(trimmed)) onAdd(trimmed);
    setV('');
  };

  const handle = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      e.stopPropagation(); // ← stops Enter bubbling up to modal Save button
      commit();
    }
    if (e.key === 'Backspace' && !v && tags.length) {
      onRemove(tags[tags.length - 1]);
    }
  };

  return (
    <div className={s.tagInputWrap}>
      {tags.map(t => <Tag key={t} color={color} onRemove={() => onRemove(t)}>{t}</Tag>)}
      <input
        className={s.tagInlineInput}
        placeholder="tag + ↵"
        value={v}
        onChange={e => setV(e.target.value)}
        onKeyDown={handle}
        // Also commit on blur so typing a tag and clicking Save still works
        onBlur={commit}
      />
    </div>
  );
}

// ─── SEARCH BAR ───────────────────────────────────────────────
export function SearchBar({ value, onChange, placeholder='Search...', className='' }: { value: string; onChange:(v:string)=>void; placeholder?: string; className?: string; }) {
  return (
    <div className={`${s.searchBar} ${className}`}>
      <span className={s.searchIcon}>⌕</span>
      <input className={s.searchInput} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} />
      {value && <button className={s.searchClear} onClick={()=>onChange('')}>×</button>}
    </div>
  );
}

// ─── INNER TABS ───────────────────────────────────────────────
export function InnerTabs({ tabs, active, onTab }: { tabs:[string,string][]; active:string; onTab:(k:string)=>void; }) {
  return (
    <div className={s.innerTabs}>
      {tabs.map(([k,l]) => (
        <div key={k} onClick={()=>onTab(k)} className={`${s.innerTab} ${active===k ? s.innerTabActive : ''}`}>{l}</div>
      ))}
    </div>
  );
}

// ─── TOPBAR ───────────────────────────────────────────────────
export function Topbar({ title, sub, action }: { title: string; sub?: string; action?: ReactNode; }) {
  return (
    <div className={s.topbar}>
      <div className={s.topbarLeft}>
        <div className={s.topbarTitle}>{title}</div>
        {sub && <div className={s.topbarSub}>{sub}</div>}
      </div>
      {action}
    </div>
  );
}

// ─── EMPTY STATE ──────────────────────────────────────────────
export function EmptyState({ icon='✦', msg }: { icon?: string; msg: string; }) {
  return (
    <div className={s.emptyState}>
      <div className={s.emptyIcon}>{icon}</div>
      <div className={s.emptyMsg}>{msg}</div>
    </div>
  );
}

// ─── TOGGLE ───────────────────────────────────────────────────
export function Toggle({ checked, onChange }: { checked: boolean; onChange:(v:boolean)=>void; }) {
  return (
    <div onClick={()=>onChange(!checked)} className={`${s.toggle} ${checked ? s.toggleOn : s.toggleOff}`}>
      <div className={`${s.toggleThumb} ${checked ? s.toggleThumbOn : s.toggleThumbOff}`} />
    </div>
  );
}

// ─── USE TOAST ────────────────────────────────────────────────
export function useToast(): [{ msg:string; color?:string }|null, (msg:string, color?:string)=>void] {
  const [toast, setToast] = useState<{ msg:string; color?:string }|null>(null);
  const show = (msg: string, color?: string) => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 2200);
  };
  return [toast, show];
}


export interface SoulPickerProps {
  souls:     DbSoul[];        // all available souls (pass from parent's loaded list)
  linkedIds: string[];        // currently linked soul ids
  onToggle:  (soulId: string) => void;  // parent flips the id in/out of linkedIds
}

export function SoulPicker({ souls, linkedIds, onToggle }: SoulPickerProps) {
  const [query, setQuery] = React.useState('');

  const filtered = query.trim() === ''
    ? souls
    : souls.filter(s =>
        s.name.toLowerCase().includes(query.toLowerCase()) ||
        (s.role ?? '').toLowerCase().includes(query.toLowerCase())
      );

  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      gap:           '6px',
    }}>
      {/* Filter input */}
      <input
        type="text"
        placeholder="Search souls…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => e.stopPropagation()} // never bubble to modal
        style={{
          background:   'var(--bg)',
          border:       '1px solid var(--border)',
          borderRadius: '6px',
          color:        'var(--text)',
          fontFamily:   'var(--font)',
          fontSize:     '13px',
          padding:      '6px 10px',
          outline:      'none',
          width:        '100%',
          boxSizing:    'border-box',
        }}
      />

      {/* Soul rows */}
      <div style={{
        display:       'flex',
        flexDirection: 'column',
        gap:           '2px',
        maxHeight:     '180px',
        overflowY:     'auto',
      }}>
        {filtered.length === 0 && (
          <p style={{
            color:      'var(--text-muted)',
            fontSize:   '12px',
            fontFamily: 'var(--font)',
            padding:    '6px 4px',
            margin:     0,
          }}>
            No souls found
          </p>
        )}

        {filtered.map(soul => {
          const linked = linkedIds.includes(soul.id);
          return (
            <button
              key={soul.id}
              type="button"
              onClick={e => {
                e.stopPropagation();
                onToggle(soul.id);
              }}
              style={{
                display:         'flex',
                alignItems:      'center',
                gap:             '8px',
                background:      linked ? `${soul.color}22` : 'transparent',
                border:          `1px solid ${linked ? soul.color : 'transparent'}`,
                borderRadius:    '8px',
                cursor:          'pointer',
                padding:         '5px 8px',
                textAlign:       'left',
                transition:      'background 0.15s, border-color 0.15s',
                width:           '100%',
              }}
            >
              {/* Emoji avatar */}
              <span style={{
                background:   soul.color + '33',
                borderRadius: '50%',
                fontSize:     '14px',
                flexShrink:   0,
                lineHeight:   1,
                padding:      '4px',
              }}>
                {soul.emoji}
              </span>

              {/* Name + role */}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{
                  color:      'var(--text)',
                  display:    'block',
                  fontFamily: 'var(--font)',
                  fontSize:   '13px',
                  fontWeight: linked ? 600 : 400,
                  overflow:   'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {soul.name}
                </span>
                {soul.role && (
                  <span style={{
                    color:      'var(--text-muted)',
                    display:    'block',
                    fontFamily: 'var(--font)',
                    fontSize:   '11px',
                    overflow:   'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {soul.role}
                  </span>
                )}
              </span>

              {/* Checkmark */}
              {linked && (
                <span style={{
                  color:      soul.color,
                  flexShrink: 0,
                  fontSize:   '14px',
                }}>
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}