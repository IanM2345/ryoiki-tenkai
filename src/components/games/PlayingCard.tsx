'use client';
import React from 'react';
import { Club, Crown, Diamond, Heart, Spade, X } from 'lucide-react';
import { SUITS, isRedSuit, rankShort, cardName, type Card, type Suit } from '@/lib/cards';
import s from './PlayingCard.module.css';

const SUIT_ICON = { hearts: Heart, diamonds: Diamond, clubs: Club, spades: Spade } as const;

/** A filled suit symbol drawn with lucide icons. */
export function SuitIcon({ suit, size = 16, className }: { suit: Suit; size?: number; className?: string }) {
  const Icon = SUIT_ICON[suit];
  return <Icon size={size} fill="currentColor" strokeWidth={1.5} className={className} aria-hidden />;
}

type Size = 'sm' | 'md' | 'lg';

/**
 * One playing card. Renders a button when onClick is given, otherwise a plain div.
 * Face down cards show the themed back. `flip` animates the card turning over when it mounts.
 */
export function PlayingCard({
  card, faceDown = false, size = 'md', playable, dim, flip, onClick, disabled, label, className,
}: {
  card?: Card;
  faceDown?: boolean;
  size?: Size;
  playable?: boolean;
  dim?: boolean;
  flip?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const cls = [
    s.card, s[size],
    faceDown || !card ? s.back : card.rank === 'JOKER' ? s.joker : s.face,
    card && !faceDown ? (card.red ? s.red : s.dark) : '',
    playable ? s.playable : '', dim ? s.dim : '', flip ? s.flip : '', className ?? '',
  ].filter(Boolean).join(' ');

  const inner = faceDown || !card ? <span className={s.backArt} aria-hidden /> : <CardFace card={card} />;
  const name = label ?? (faceDown || !card ? 'Face down card' : cardName(card));

  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} disabled={disabled} aria-label={name}>
        {inner}
      </button>
    );
  }
  return <div className={cls} role="img" aria-label={name}>{inner}</div>;
}

function CardFace({ card }: { card: Card }) {
  if (card.rank === 'JOKER' || card.suit === null) {
    return (
      <>
        <span className={`${s.corner} ${s.tl}`} aria-hidden><span className={s.jokerWord}>JOKER</span></span>
        <span className={s.centre} aria-hidden><Crown className={s.jokerCrown} strokeWidth={1.75} /></span>
        <span className={`${s.corner} ${s.br}`} aria-hidden><span className={s.jokerWord}>JOKER</span></span>
      </>
    );
  }
  return (
    <>
      <span className={`${s.corner} ${s.tl}`} aria-hidden>
        <span className={s.rank}>{rankShort(card)}</span>
        <SuitIcon suit={card.suit} className={s.cornerSuit} />
      </span>
      <span className={s.centre} aria-hidden>
        {['J', 'Q', 'K'].includes(card.rank)
          ? <span className={s.court}><span className={s.courtRank}>{card.rank}</span><SuitIcon suit={card.suit} className={s.courtSuit} /></span>
          : <SuitIcon suit={card.suit} className={s.bigSuit} />}
      </span>
      <span className={`${s.corner} ${s.br}`} aria-hidden>
        <span className={s.rank}>{rankShort(card)}</span>
        <SuitIcon suit={card.suit} className={s.cornerSuit} />
      </span>
    </>
  );
}

/** Horizontal hand of cards. Overlaps and scrolls sideways on narrow screens. */
export function CardHand({ children, label, compact }: { children: React.ReactNode; label: string; compact?: boolean }) {
  return (
    <div className={`${s.hand} ${compact ? s.handCompact : ''}`} role="group" aria-label={label}>
      {children}
    </div>
  );
}

/** Four suit buttons for declaring a suit after an Ace. */
export function SuitPicker({ onPick, onCancel, title = 'Pick a suit' }: {
  onPick: (suit: Suit) => void; onCancel?: () => void; title?: string;
}) {
  return (
    <div className={s.picker} role="group" aria-label={title}>
      <p className={s.pickerTitle}>{title}</p>
      <div className={s.pickerRow}>
        {SUITS.map(suit => (
          <button
            key={suit}
            type="button"
            className={`${s.suitBtn} ${isRedSuit(suit) ? s.suitRed : s.suitDark}`}
            onClick={() => onPick(suit)}
          >
            <SuitIcon suit={suit} size={20} />
            <span>{suit}</span>
          </button>
        ))}
        {onCancel && (
          <button type="button" className={s.cancelBtn} onClick={onCancel} aria-label="Cancel and keep the Ace">
            <X size={18} strokeWidth={2.25} />
          </button>
        )}
      </div>
    </div>
  );
}
