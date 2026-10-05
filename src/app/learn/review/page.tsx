'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Layers, PartyPopper, RotateCcw, Eye, Keyboard, CornerDownLeft, Sparkles } from 'lucide-react';
import { Btn, Topbar, EmptyState, Toast, useToast } from '@/components/ui';
import { updateStudyCard, addStudyReview, type DbStudyCard } from '@/lib/db';
import { GRADES, fmtInterval, isDue, pathTo, schedule, subtreeIds, SUBJECT_COLORS, subjectOf, type Grade } from '@/lib/study';
import { checkAnswer, isShortAnswer, wasCorrect, type AnswerCheck, type Piece } from '@/lib/answerCheck';
import { useStudy } from '../useStudy';
import s from '../learn.module.css';

interface Session { ids: string[]; scope: string | null; all: boolean }

const TYPE_KEY = 'yw-learn-type';
function readTypePref(): boolean {
  try { return localStorage.getItem(TYPE_KEY) !== '0'; } catch { return true; }
}

/** Her words or the card's, with the matching parts highlighted. */
function Marked({ pieces, tone }: { pieces: Piece[]; tone: 'answer' | 'mine' }) {
  return (
    <span className={s.marked}>
      {pieces.map((p, i) => (p.key || p.hit
        ? <span key={i} className={p.hit ? s.hit : tone === 'answer' ? s.miss : s.extra}>{p.text}</span>
        : <React.Fragment key={i}>{p.text}</React.Fragment>))}
    </span>
  );
}

/**
 * Flashcard review: the cards that are due (everywhere, or just one subject or topic),
 * one at a time. She types the answer (or just thinks of it), sees how close she was,
 * and says how it went. The site suggests a grade from her typing; she has the final say.
 */
export default function ReviewPage() {
  const [toast, show] = useToast();
  const onError = useCallback((m: string) => show(m, 'var(--red)'), [show]);
  const { cards, setCards, tree, loading, missing } = useStudy(onError);

  const [session, setSession] = useState<Session | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [tally, setTally] = useState<Record<Grade, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });
  // Typing the answer (on by default; remembered per device)
  const [typeMode, setTypeMode] = useState(() => (typeof window === 'undefined' ? true : readTypePref()));
  const [typed, setTyped] = useState('');
  const [check, setCheck] = useState<AnswerCheck | null>(null);
  const [results, setResults] = useState<{ grade: number; score: number | null }[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Build the pile once, when the cards first arrive (later syncs don't reshuffle it).
  if (!loading && !session) {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const scope = params.get('node');
    const all = params.get('all') === '1';
    const inScope = scope && tree.byId.has(scope) ? subtreeIds(tree, scope) : null;
    const now = startedAt;
    const pile = cards
      .filter(c => !inScope || inScope.has(c.node_id))
      .filter(c => all || isDue(c, now))
      .sort((a, b) => (a.reps === 0 ? 1 : 0) - (b.reps === 0 ? 1 : 0) || a.due_at.localeCompare(b.due_at));
    setSession({ ids: pile.map(c => c.id), scope: inScope ? scope : null, all });
  }

  const card: DbStudyCard | undefined = session ? cards.find(c => c.id === session.ids[pos]) : undefined;
  const total = session?.ids.length ?? 0;
  const done = !!session && pos >= total;
  const scopeNode = session?.scope ? tree.byId.get(session.scope) : null;
  const backHref = scopeNode ? `/learn/${scopeNode.id}` : '/learn';

  const grade = useCallback(async (g: Grade) => {
    if (!card || !session) return;
    const next = schedule(card, g);
    setCards(l => l.map(c => (c.id === card.id ? { ...c, ...next } : c)));
    setTally(t => ({ ...t, [g]: t[g] + 1 }));
    const score = check ? check.score : null;
    setResults(r => [...r, { grade: g, score }]);
    setFlipped(false);
    setTyped('');
    setCheck(null);
    // "Again" puts the card back at the end of this session
    if (g === 1) setSession(ss => (ss ? { ...ss, ids: [...ss.ids, card.id] } : ss));
    setPos(p => p + 1);
    try {
      await Promise.all([updateStudyCard(card.id, next), addStudyReview({ card_id: card.id, node_id: card.node_id, grade: g, score })]);
    } catch { show("That answer didn't save. Check your connection.", 'var(--red)'); }
  }, [card, session, setCards, show, check]);

  const submitTyped = () => {
    if (!card) return;
    if (typed.trim()) setCheck(checkAnswer(typed, card.back));
    setFlipped(true);
  };

  // Put the cursor in the answer box for each new card
  const cardId = card?.id;
  useEffect(() => {
    if (typeMode && cardId && !flipped) inputRef.current?.focus({ preventScroll: true });
  }, [typeMode, cardId, flipped]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!card || (e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (!flipped && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); setFlipped(true); return; }
      if (flipped && ['1', '2', '3', '4'].includes(e.key)) { e.preventDefault(); grade(Number(e.key) as Grade); }
      if (flipped && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); grade(check ? check.suggested : 3); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card, flipped, grade, check]);

  const where = card ? pathTo(tree, card.node_id) : [];
  const color = card ? subjectOf(tree, card.node_id)?.color ?? SUBJECT_COLORS[0] : SUBJECT_COLORS[0];
  const reviewed = tally[1] + tally[2] + tally[3] + tally[4];
  const accuracy = results.length ? Math.round((results.filter(wasCorrect).length / results.length) * 100) : null;
  const typedScores = results.filter(r => r.score != null).map(r => r.score!);
  const avgMatch = typedScores.length ? Math.round(typedScores.reduce((a, b) => a + b, 0) / typedScores.length) : null;
  const toggleType = () => {
    const v = !typeMode;
    setTypeMode(v);
    try { localStorage.setItem(TYPE_KEY, v ? '1' : '0'); } catch { /* private mode */ }
  };
  const short = card ? isShortAnswer(card.back) : true;

  return (
    <div className={s.page}>
      <Topbar
        title={scopeNode ? `Review: ${scopeNode.title}` : 'Review'}
        sub={!session ? 'Getting your cards' : done ? 'All done' : `${Math.min(pos + 1, total)} of ${total}`}
        maxWidth={760}
        action={<Link href={backHref} className={s.backBtn}><ChevronLeft size={16} /> {scopeNode ? scopeNode.title : 'Study map'}</Link>}
      />
      <div className={`${s.wrap} ${s.wrapReview}`}>
        {missing ? (
          <EmptyState icon={<Layers size={26} />} msg="Learn needs a quick database update first. See DEPLOY.md." />
        ) : !session ? (
          <div className={`skeleton ${s.skelCard}`} />
        ) : total === 0 ? (
          <EmptyState
            icon={<PartyPopper size={26} />}
            msg={session.all ? 'No flashcards here yet. Add some on the topic page.' : 'Nothing due right now. Cards come back just before you would forget them.'}
            action={scopeNode ? <Link href={`/learn/review?node=${scopeNode.id}&all=1`} className={s.ghostBtn}><RotateCcw size={15} /> Study them all anyway</Link> : undefined}
          />
        ) : done ? (
          <section className={s.doneCard}>
            <PartyPopper size={32} />
            <h2>Done! {reviewed} {reviewed === 1 ? 'answer' : 'answers'}.</h2>
            {accuracy != null && (
              <div className={s.accuracy} style={{ ['--m' as string]: `${accuracy}%` }}>
                <b>{accuracy}%</b>
                <span>right{avgMatch != null ? `. Your typed answers matched ${avgMatch}% on average` : ''}</span>
              </div>
            )}
            <div className={s.tally}>
              {GRADES.map(g => <div key={g.grade} className={s[`g${g.grade}`]}><b>{tally[g.grade]}</b><span>{g.label}</span></div>)}
            </div>
            <p>Cards you found hard come back sooner; easy ones wait longer.</p>
            <div className={s.rowCenter}>
              <Link href={backHref} className={s.primaryLink}>Back to {scopeNode ? scopeNode.title : 'the study map'}</Link>
            </div>
          </section>
        ) : card ? (
          <>
            <div className={s.progress} aria-hidden><span style={{ width: `${(pos / total) * 100}%` }} /></div>
            <section className={`${s.flash} ${flipped ? s.flashOn : ''}`} style={{ ['--c' as string]: color }} aria-live="polite">
              <p className={s.flashWhere}>{where.map(n => n.title).join(' › ')}</p>
              <p className={s.flashFront}>{card.front}</p>
              {flipped ? (
                <>
                  <hr className={s.flashRule} />
                  {check ? (
                    <div className={s.compare}>
                      <div className={`${s.matchBadge} ${check.score >= 85 ? s.matchGood : check.score >= 45 ? s.matchSome : s.matchLow}`}>
                        {check.score}% match
                      </div>
                      <p className={s.cmpLabel}>Answer</p>
                      <p className={s.flashBack}><Marked pieces={check.expected} tone="answer" /></p>
                      <p className={s.cmpLabel}>You wrote</p>
                      <p className={s.cmpMine}><Marked pieces={check.typed} tone="mine" /></p>
                      {check.kind === 'long' && <p className={s.cmpNote}>Long answers are matched on key words, so a good answer in your own words can score low. You decide.</p>}
                    </div>
                  ) : (
                    <p className={s.flashBack}>{card.back}</p>
                  )}
                </>
              ) : typeMode ? (
                <form className={s.typeForm} onSubmit={e => { e.preventDefault(); submitTyped(); }}>
                  <textarea
                    ref={inputRef}
                    value={typed}
                    onChange={e => setTyped(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitTyped(); } }}
                    rows={short ? 1 : 3}
                    placeholder={short ? 'Type the answer' : 'Type what you remember, or just show the answer'}
                    aria-label="Your answer"
                    autoCapitalize="off"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <div className={s.typeActions}>
                    <button type="button" className={s.linkBtn} onClick={() => setFlipped(true)}><Eye size={14} /> Just show me</button>
                    <button type="submit" className={s.flipBtn}><CornerDownLeft size={17} /> {typed.trim() ? 'Check' : 'Show answer'}</button>
                  </div>
                </form>
              ) : (
                <button type="button" className={s.flipBtn} onClick={() => setFlipped(true)}><Eye size={17} /> Show answer</button>
              )}
            </section>
            {flipped && (
              <div className={s.grades} role="group" aria-label="How did that go?">
                {GRADES.map(g => (
                  <button key={g.grade} type="button" className={`${s.gradeBtn} ${s[`g${g.grade}`]} ${check?.suggested === g.grade ? s.gradeSuggested : ''}`} onClick={() => grade(g.grade)}>
                    {check?.suggested === g.grade && <span className={s.suggestTag}><Sparkles size={11} /> Suggested</span>}
                    <b>{g.label}</b>
                    <small>{fmtInterval(schedule(card, g.grade).interval_days)}</small>
                  </button>
                ))}
              </div>
            )}
            <div className={s.reviewFoot}>
              <button type="button" className={`${s.typeToggle} ${typeMode ? s.typeToggleOn : ''}`} onClick={toggleType} aria-pressed={typeMode}>
                <Keyboard size={15} /> {typeMode ? 'Typing answers' : 'Type answers'}
              </button>
              <p className={s.keysHint}>{typeMode && !flipped ? 'Enter to check.' : flipped ? `Keys: 1 to 4, or Enter for ${check ? GRADES[check.suggested - 1].label : 'Good'}.` : 'Keys: Space to flip.'}</p>
            </div>
          </>
        ) : (
          // The card was deleted on another device mid-session: skip it.
          <div className={s.rowCenter}><Btn onClick={() => setPos(p => p + 1)}>Next card</Btn></div>
        )}
      </div>
      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}
