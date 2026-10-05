'use client';
import React, { type ReactNode } from 'react';
import s from './markdown.module.css';

/**
 * Renders light markdown safely as React elements (no raw HTML):
 * # headings, - bullets, 1. numbers, - [ ] checklists, > quotes, ``` code, **bold**, *italic*, `code`, [links](https://…).
 * `onToggle(line)` makes checklist boxes tickable.
 */
export default function Markdown({ text, onToggle }: { text: string; onToggle?: (lineIndex: number) => void }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: ReactNode[] = [];
  let i = 0, key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push(<pre key={key++} className={s.pre}><code>{body.join('\n')}</code></pre>);
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const Tag = (`h${h[1].length + 1}`) as 'h2' | 'h3' | 'h4';
      out.push(<Tag key={key++} className={s[`h${h[1].length}` as 'h1']}>{inline(h[2])}</Tag>);
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      out.push(<blockquote key={key++} className={s.quote}>{inline(body.join(' '))}</blockquote>);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const idx = i;
        const raw = lines[i++].replace(/^\s*[-*]\s+/, '');
        const box = /^\[( |x|X)\]\s*(.*)$/.exec(raw);
        if (box) {
          const done = box[1] !== ' ';
          items.push(
            <li key={idx} className={`${s.check} ${done ? s.checkDone : ''}`}>
              <input type="checkbox" checked={done} disabled={!onToggle} onChange={() => onToggle?.(idx)} aria-label={box[2] || 'Checklist item'} />
              <span>{inline(box[2])}</span>
            </li>,
          );
        } else {
          items.push(<li key={idx}>{inline(raw)}</li>);
        }
      }
      out.push(<ul key={key++} className={s.ul}>{items}</ul>);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(<li key={i}>{inline(lines[i++].replace(/^\s*\d+[.)]\s+/, ''))}</li>);
      out.push(<ol key={key++} className={s.ol}>{items}</ol>);
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>|```|\s*[-*]\s+|\s*\d+[.)]\s+)/.test(lines[i])) para.push(lines[i++]);
    out.push(<p key={key++} className={s.p}>{para.map((l, j) => <React.Fragment key={j}>{j > 0 && <br />}{inline(l)}</React.Fragment>)}</p>);
  }
  return <div className={s.md}>{out}</div>;
}

const TOKEN = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`|\[[^\]]+\]\((?:https?:\/\/|mailto:)[^)\s]+\)|https?:\/\/[^\s)]+)/g;

function inline(text: string): ReactNode[] {
  const parts = text.split(TOKEN);
  return parts.map((p, i) => {
    if (!p) return null;
    if (i % 2 === 0) return p;
    if (p.startsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('`')) return <code key={i} className={s.code}>{p.slice(1, -1)}</code>;
    if (p.startsWith('*') || p.startsWith('_')) return <em key={i}>{p.slice(1, -1)}</em>;
    const md = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p);
    const href = md ? md[2] : p;
    return <a key={i} href={href} target="_blank" rel="noopener noreferrer" className={s.a}>{md ? md[1] : p.replace(/^https?:\/\/(www\.)?/, '')}</a>;
  });
}
