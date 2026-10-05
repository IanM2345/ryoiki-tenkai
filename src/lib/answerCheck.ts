/**
 * answerCheck.ts — compares what she typed with the card's answer, without AI.
 *
 * Short answers (a word, a name, a formula) are compared letter by letter, forgiving capitals,
 * accents, punctuation and small typos. Long answers are compared by their key words, so the
 * score says how much of the answer she covered; she has the final say on the grade.
 */
import type { Grade } from './study';

const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for', 'by', 'with', 'is', 'are', 'was', 'were', 'be', 'it', 'its',
  'that', 'this', 'as', 'from', 'into', 'so', 'than', 'then', 'they', 'their', 'them', 'you', 'your', 'we', 'our', 'can', 'do', 'does',
  'el', 'la', 'los', 'las', 'un', 'una', 'de', 'y', 'le', 'les', 'des', 'et', 'der', 'die', 'das', 'und',
]);

/** lower case, no accents, no punctuation, single spaces */
export function normalise(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/×/g, 'x')
    .replace(/[^\p{L}\p{N}\s+\-*/=<>^.]/gu, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function similar(a: string, b: string): number {
  // spacing doesn't matter: "p(a)x p(b)" is "P(A) × P(B)"
  a = a.replace(/\s/g, ''); b = b.replace(/\s/g, '');
  const max = Math.max(a.length, b.length);
  return max ? 1 - levenshtein(a, b) / max : 1;
}

/** Two words count as the same with a typo or two, more slack for long words. */
function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 4) return false;
  const allowed = a.length >= 8 ? 2 : 1;
  return levenshtein(a, b) <= allowed || a.startsWith(b) || b.startsWith(a);
}

export interface Piece { text: string; hit: boolean; key: boolean }

export interface AnswerCheck {
  /** 0–100 */
  score: number;
  /** compared letter by letter (short answer) or by key words (long answer) */
  kind: 'short' | 'long';
  /** the card's answer, with the parts she got marked */
  expected: Piece[];
  /** what she typed, with the parts that matched marked */
  typed: Piece[];
  suggested: Grade;
}

/** "is it short enough to expect the exact thing?" */
export function isShortAnswer(answer: string): boolean {
  const words = normalise(answer).split(' ').filter(Boolean);
  return answer.length <= 24 || (words.length <= 4 && answer.length <= 40);
}

function split(text: string): string[] {
  // keep the original words (with punctuation) for display
  return text.split(/(\s+)/).filter(Boolean);
}

export function checkAnswer(typedRaw: string, answerRaw: string): AnswerCheck {
  const typed = normalise(typedRaw);
  // "colour / color", "tengo; yo tengo": any one of them is fine
  const options = answerRaw.split(/\s\/\s|;|\bor\b/i).map(s => s.trim()).filter(Boolean);
  const short = isShortAnswer(answerRaw);

  if (short) {
    const best = Math.max(...(options.length ? options : [answerRaw]).map(o => similar(typed, normalise(o))), similar(typed, normalise(answerRaw)));
    let score = Math.round(Math.max(0, best) * 100);
    // "Ebbinghaus" for "Hermann Ebbinghaus": part of it, nothing wrong added
    const aw = normalise(answerRaw).split(' ').filter(w => w && !STOP.has(w));
    const tw = typed.split(' ').filter(w => w && !STOP.has(w));
    const partial = aw.length > 1 && tw.length > 0 && tw.every(t => aw.some(a => wordsMatch(t, a)));
    if (partial) score = Math.max(score, Math.round((aw.filter(a => tw.some(t => wordsMatch(t, a))).length / aw.length) * 100));
    // Mark word by word, strictly: in a short answer one wrong letter usually means a different word.
    const strict = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 8 && levenshtein(a, b) <= 1);
    const tWords = typed.split(' ').filter(Boolean);
    const aWords = normalise(answerRaw).split(' ').filter(Boolean);
    const whole = score === 100;
    const mark = (text: string, against: string[]): Piece[] => split(text).map(p => {
      const w = normalise(p);
      if (!w) return { text: p, hit: false, key: false };
      return { text: p, hit: whole || against.some(x => strict(x, w)), key: !STOP.has(w) };
    });
    return {
      score,
      kind: 'short',
      expected: mark(answerRaw, tWords),
      typed: mark(typedRaw, aWords),
      // short answers need to be right: one wrong letter in "tengo" is a different word
      suggested: score === 100 ? 3 : score >= 85 || partial ? 2 : 1,
    };
  }

  // Long answer: how many of the answer's key words did she cover?
  const typedWords = typed.split(' ').filter(Boolean);
  const pieces = split(answerRaw);
  let keys = 0, hits = 0;
  const expected: Piece[] = pieces.map(p => {
    const w = normalise(p);
    if (!w || /^\s+$/.test(p)) return { text: p, hit: false, key: false };
    const key = !STOP.has(w);
    const hit = typedWords.some(t => wordsMatch(t, w));
    if (key) { keys++; if (hit) hits++; }
    return { text: p, hit, key };
  });
  const answerWords = normalise(answerRaw).split(' ').filter(Boolean);
  const typedPieces: Piece[] = split(typedRaw).map(p => {
    const w = normalise(p);
    if (!w || /^\s+$/.test(p)) return { text: p, hit: false, key: false };
    return { text: p, hit: answerWords.some(a => wordsMatch(a, w)), key: !STOP.has(w) };
  });
  const score = keys ? Math.round((hits / keys) * 100) : 0;
  return {
    score,
    kind: 'long',
    expected,
    typed: typedPieces,
    suggested: score >= 75 ? 3 : score >= 45 ? 2 : 1,
  };
}

/** Counts as "got it" for accuracy: a typed score of 60+ or, when not typed, Good or Easy. */
export function wasCorrect(r: { grade: number; score?: number | null }): boolean {
  return r.score != null ? r.score >= 60 : r.grade >= 3;
}
