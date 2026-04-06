'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { colors as C, fonts, DEFAULT_MOODS } from '../../lib/token';
import {
  Btn, Lbl, Divider, InnerTabs, Topbar, EmptyState, Toast, useToast, FInput,
} from '@/components/ui';
import {
  getMoodDefs, addMoodDef, deleteMoodDef,
  getMoodLogs, addMoodLog, deleteMoodLog,
  DbMoodDef, DbMoodLog,
} from '@/lib/db';
import { ensureSession } from '@/lib/supabase';

interface MoodDef   { id?: string; name: string; color: string; isDefault?: boolean; }
interface MoodEntry { id: string; feeling: MoodDef; intensity: number; note: string; time: string; date: string; }
interface Bubble    { x:number; y:number; rx:number; ry:number; vx:number; vy:number; phase:number; ps:number; log:MoodEntry; alpha:number; }

const SWATCHES = ['#f59e0b','#f97316','#ef4444','#ec4899','#a855f7','#6366f1','#3b82f6','#22d3ee','#10b981','#84cc16','#f472b6','#fb923c'];
const DEFAULT_MOOD_NAMES = new Set((DEFAULT_MOODS as MoodDef[]).map(m => m.name));

function dbDefToMoodDef(d: DbMoodDef): MoodDef {
  return { id: d.id, name: d.name, color: d.color, isDefault: DEFAULT_MOOD_NAMES.has(d.name) };
}
function dbLogToEntry(l: DbMoodLog): MoodEntry {
  return { id: l.id, feeling: { name: l.feeling_name, color: l.feeling_color }, intensity: l.intensity, note: l.note ?? '', time: l.log_time ?? '', date: l.log_date };
}

export default function MoodBubblePage() {
  // Use plain mutable refs for canvas state — no useEffect needed
  const canvasRef   = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef  = useRef<HTMLDivElement | null>(null);
  const bubblesRef  = useRef<Bubble[]>([]);
  const animRef     = useRef<number | undefined>(undefined);
  const hovRef      = useRef<Bubble | null>(null);
  const logsRef     = useRef<MoodEntry[]>([]);
  const tabRef      = useRef<string>('today');
  const todayRef    = useRef<string>(new Date().toISOString().split('T')[0]);
  const startedRef  = useRef(false); // prevent double-start

  const [tab,        setTab]        = useState('today');
  const [selFeeling, setSelFeeling] = useState<MoodDef | null>(null);
  const [intensity,  setIntensity]  = useState(3);
  const [note,       setNote]       = useState('');
  const [tooltip,    setTooltip]    = useState<{ x:number; y:number; log:MoodEntry } | null>(null);
  const [newName,    setNewName]    = useState('');
  const [newColor,   setNewColor]   = useState('#f59e0b');
  const [moodDefs,   setMoodDefs]   = useState<MoodDef[]>([]);
  const [moodLogs,   setMoodLogs]   = useState<MoodEntry[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [toast, show] = useToast();

  const today = todayRef.current;

  useEffect(() => { logsRef.current = moodLogs; }, [moodLogs]);
  useEffect(() => { tabRef.current  = tab;       }, [tab]);

  // ── rebuild: place bubbles on the canvas ──────────────────
  const rebuild = useCallback(() => {
    const c = canvasRef.current;
    if (!c || c.width < 10 || c.height < 10) return;
    const logs = tabRef.current === 'today'
      ? logsRef.current.filter(m => m.date === todayRef.current)
      : logsRef.current;
    bubblesRef.current = logs.map((log, i) => {
      const radius = 24 + log.intensity * 12;
      const angle  = (i / Math.max(logs.length, 1)) * Math.PI * 2;
      const d      = 40 + Math.random() * 70;
      return {
        x:  Math.max(radius, Math.min(c.width  - radius, c.width  / 2 + Math.cos(angle) * d)),
        y:  Math.max(radius, Math.min(c.height - radius, c.height / 2 + Math.sin(angle) * d)),
        rx: radius, ry: radius * (.88 + Math.random() * .16),
        vx: (Math.random()-.5)*.35, vy: (Math.random()-.5)*.35,
        phase: Math.random()*Math.PI*2, ps: .005+Math.random()*.004,
        log, alpha: 0,
      };
    });
  }, []);

  // ── start canvas loop — called from callback ref ───────────
  const startCanvas = useCallback((canvas: HTMLCanvasElement, wrapper: HTMLDivElement) => {
    if (startedRef.current) return;
    startedRef.current = true;

    const syncSize = () => {
      const r = wrapper.getBoundingClientRect();
      const w = r.width  > 10 ? Math.round(r.width)  : window.innerWidth  - Math.round(r.left);
      const h = r.height > 10 ? Math.round(r.height) : window.innerHeight - Math.round(r.top);
      if (w > 10 && h > 10) {
        canvas.width  = w;
        canvas.height = h;
        rebuild();
      }
    };

    syncSize();
    setTimeout(syncSize, 100);
    setTimeout(syncSize, 400);
    window.addEventListener('resize', syncSize);

    const stars = Array.from({ length: 55 }, () => ({
      x: Math.random(), y: Math.random(),
      r: Math.random()*1.1+.2, a: Math.random()*.4+.1,
    }));

    const hexGlow = (h: string) => {
      try {
        const rv=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);
        return `rgba(${rv},${g},${b},.5)`;
      } catch { return 'rgba(255,140,0,.5)'; }
    };

    const sep = () => {
      const b = bubblesRef.current;
      for (let i=0;i<b.length;i++) for (let j=i+1;j<b.length;j++) {
        const [ai,bj]=[b[i],b[j]];
        const dx=bj.x-ai.x, dy=bj.y-ai.y, d=Math.sqrt(dx*dx+dy*dy)||.001;
        const min=(ai.rx+bj.rx)*.85;
        if (d<min) { const p=(min-d)*.018,nx=dx/d,ny=dy/d; ai.vx-=nx*p; ai.vy-=ny*p; bj.vx+=nx*p; bj.vy+=ny*p; }
      }
    };

    const drawBlob = (ctx: CanvasRenderingContext2D, b: Bubble) => {
      const {x,y,rx,ry,phase,log,alpha}=b;
      const hov=hovRef.current===b, sr=hov?1.08:1;
      ctx.save(); ctx.globalAlpha=alpha;
      const col=log.feeling.color, glow=hexGlow(col);
      const g1=ctx.createRadialGradient(x,y,rx*.08,x,y,rx*1.6);
      g1.addColorStop(0,glow.replace('.5','.2')); g1.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g1; ctx.beginPath();
      ctx.ellipse(x,y,rx*1.65*sr,ry*1.65*sr,0,0,Math.PI*2); ctx.fill();
      ctx.beginPath();
      for (let i=0;i<=14;i++) {
        const t=(i/14)*Math.PI*2, w=1+.16*Math.sin(3*t+phase)*Math.cos(2*t+phase*.7);
        const px=x+rx*sr*w*Math.cos(t), py=y+ry*sr*w*Math.sin(t);
        i===0?ctx.moveTo(px,py):ctx.lineTo(px,py);
      }
      ctx.closePath();
      const g2=ctx.createRadialGradient(x-rx*.25,y-ry*.28,rx*.08,x,y,rx*1.1);
      g2.addColorStop(0,col+'ee'); g2.addColorStop(.5,col+'99'); g2.addColorStop(1,col+'33');
      ctx.fillStyle=g2; ctx.fill();
      ctx.beginPath(); ctx.ellipse(x-rx*.28,y-ry*.28,rx*.26,ry*.15,-.4,0,Math.PI*2);
      ctx.fillStyle='rgba(255,255,255,.15)'; ctx.fill();
      const fs=Math.max(10,rx*.27);
      ctx.font=`bold ${fs}px 'Comic Sans MS',cursive`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle='rgba(255,255,255,.92)'; ctx.shadowColor='rgba(0,0,0,.5)'; ctx.shadowBlur=3;
      ctx.fillText(log.feeling.name,x,y+(log.note?-6:0));
      if (log.note) {
        ctx.font=`${Math.max(8,rx*.18)}px 'Comic Sans MS',cursive`;
        ctx.fillStyle='rgba(255,255,255,.5)';
        ctx.fillText(log.note.length>12?log.note.slice(0,10)+'...':log.note,x,y+8);
      }
      ctx.shadowBlur=0; ctx.restore();
    };

    const frame = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle='#0a0614'; ctx.fillRect(0,0,canvas.width,canvas.height);
      stars.forEach(s => {
        ctx.beginPath(); ctx.arc(s.x*canvas.width,s.y*canvas.height,s.r,0,Math.PI*2);
        ctx.fillStyle=`rgba(255,255,255,${s.a})`; ctx.fill();
      });
      sep();
      bubblesRef.current.forEach(b => {
        b.phase+=b.ps; b.x+=b.vx; b.y+=b.vy;
        b.vy+=Math.sin(b.phase*.5)*.003; b.vx+=Math.cos(b.phase*.4)*.002;
        b.vx*=.998; b.vy*=.998;
        if (b.x-b.rx<0)             {b.x=b.rx;             b.vx= Math.abs(b.vx);}
        if (b.x+b.rx>canvas.width)  {b.x=canvas.width-b.rx; b.vx=-Math.abs(b.vx);}
        if (b.y-b.ry<0)             {b.y=b.ry;             b.vy= Math.abs(b.vy);}
        if (b.y+b.ry>canvas.height) {b.y=canvas.height-b.ry;b.vy=-Math.abs(b.vy);}
        if (b.alpha<1) b.alpha=Math.min(1,b.alpha+.028);
        drawBlob(ctx,b);
      });
      animRef.current = requestAnimationFrame(frame);
    };
    frame();
  }, [rebuild]);

  // ── callback refs — fire the instant the DOM node exists ──
  const setCanvas = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    if (node && wrapperRef.current) startCanvas(node, wrapperRef.current);
  }, [startCanvas]);

  const setWrapper = useCallback((node: HTMLDivElement | null) => {
    wrapperRef.current = node;
    if (node && canvasRef.current) startCanvas(canvasRef.current, node);
  }, [startCanvas]);

  // rebuild when logs or tab change
  useEffect(() => { rebuild(); }, [moodLogs, tab, rebuild]);

  // ── load ──────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      await new Promise(r => setTimeout(r, 100));
      const ready = await ensureSession();
      if (!ready) { setLoading(false); return; }
      try {
        const [defs, logs] = await Promise.all([getMoodDefs(), getMoodLogs()]);
        console.log('[mood] defs:', defs.length, 'logs:', logs.length, logs);
        let resolvedDefs: DbMoodDef[] = defs;
        if (defs.length === 0) {
          resolvedDefs = await Promise.all(
            (DEFAULT_MOODS as MoodDef[]).map((m, i) =>
              addMoodDef({ name: m.name, color: m.color, sort_order: i })
            )
          );
        }
        setMoodDefs(resolvedDefs.map(dbDefToMoodDef));
        setMoodLogs(logs.map(dbLogToEntry));
      } catch(e) {
        console.error('[mood] load error:', e);
        show('Could not load mood data.', C.red);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const todayLogs = moodLogs.filter(m => m.date === today);

  // ── mutations ─────────────────────────────────────────────
  const logMood = async () => {
    if (!selFeeling) return;
    const time = new Date().toLocaleTimeString('en-IE', { hour:'2-digit', minute:'2-digit' });
    const tempId = `temp-${Date.now()}`;
    const sf=selFeeling, sn=note, si=intensity;
    const optimistic: MoodEntry = { id:tempId, feeling:sf, intensity:si, note:sn, time, date:today };
    const snapshot = [...moodLogs];
    setMoodLogs(l => [optimistic, ...l]);
    setSelFeeling(null); setNote(''); setIntensity(3);
    try {
      const saved = await addMoodLog({ mood_def_id:sf.id??null, feeling_name:sf.name, feeling_color:sf.color, intensity:si, note:sn||null, log_date:today, log_time:time });
      setMoodLogs(l => l.map(x => x.id===tempId ? dbLogToEntry(saved) : x));
      show(`"${sf.name}" logged!`);
    } catch { setMoodLogs(snapshot); show('Could not log mood.', C.red); }
  };

  const delLog = async (entry: MoodEntry) => {
    const snapshot = [...moodLogs];
    setMoodLogs(l => l.filter(x => x.id !== entry.id));
    try { await deleteMoodLog(entry.id); show('Removed.'); }
    catch { setMoodLogs(snapshot); show('Could not remove.', C.red); }
  };

  const addMood = async () => {
    if (!newName.trim()) return;
    const trimmed = newName.trim().toLowerCase();
    if (moodDefs.find(d => d.name === trimmed)) { show('Already exists!', C.red); return; }
    const tempId = `temp-${Date.now()}`;
    const snapshot = [...moodDefs];
    setMoodDefs(d => [...d, { id:tempId, name:trimmed, color:newColor }]);
    setNewName('');
    try {
      const saved = await addMoodDef({ name:trimmed, color:newColor, sort_order:moodDefs.length });
      setMoodDefs(d => d.map(x => x.id===tempId ? dbDefToMoodDef(saved) : x));
      show('Mood added!');
    } catch { setMoodDefs(snapshot); show('Could not add mood.', C.red); }
  };

  const delMood = async (def: MoodDef) => {
    const snapshot = [...moodDefs];
    setMoodDefs(d => d.filter(x => x.name !== def.name));
    if (selFeeling?.name === def.name) setSelFeeling(null);
    try { if (def.id) await deleteMoodDef(def.id); }
    catch { setMoodDefs(snapshot); show('Could not delete mood.', C.red); }
  };

  const onCanvasMove = (e: React.MouseEvent) => {
    const r = canvasRef.current?.getBoundingClientRect(); if (!r) return;
    const mx=e.clientX-r.left, my=e.clientY-r.top;
    let hit: Bubble|null=null;
    for (let i=bubblesRef.current.length-1;i>=0;i--) {
      const b=bubblesRef.current[i], dx=mx-b.x, dy=my-b.y;
      if ((dx*dx)/(b.rx*b.rx)+(dy*dy)/(b.ry*b.ry)<1.3) { hit=b; break; }
    }
    hovRef.current=hit;
    if (hit) setTooltip({ x:Math.min(mx+12,r.width-170), y:Math.max(my-50,8), log:hit.log });
    else setTooltip(null);
  };

  // cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animRef.current !== undefined) cancelAnimationFrame(animRef.current);
    };
  }, []);

  const card = { background:C.card, border:`1px solid ${C.bd}`, borderRadius:8, padding:12 } as const;

  if (loading) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <span style={{ fontFamily:fonts.main, color:C.txm, fontSize:13 }}>Loading moods…</span>
    </div>
  );

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }} className="animate-fade-up">
      <Topbar title="Mood Bubble ☁" sub={`${todayLogs.length} logged today`} />
      <InnerTabs tabs={[['today','Today'],['history','History'],['manage','My Moods']]} active={tab} onTab={setTab} />

      {/* Always in DOM so callback refs fire on first render */}
      <div style={{ flex:1, display: tab==='today'?'flex':'none', flexDirection:'row', overflow:'hidden', minHeight:0 }}>

        {/* Left panel */}
        <div style={{ width:192, flexShrink:0, borderRight:`1px solid ${C.bds}`, padding:12, display:'flex', flexDirection:'column', gap:8, overflowY:'auto' }}>
          <Lbl>Pick a feeling</Lbl>
          <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
            {moodDefs.map(f => (
              <div key={f.name} onClick={() => setSelFeeling(selFeeling?.name===f.name?null:f)}
                style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 10px', borderRadius:20, cursor:'pointer', transition:'all .15s', border:`1px solid ${selFeeling?.name===f.name?f.color:C.bds}`, background:selFeeling?.name===f.name?`${f.color}18`:'rgba(255,255,255,.02)' }}>
                <div style={{ width:9, height:9, borderRadius:'50%', background:f.color, boxShadow:`0 0 5px ${f.color}77`, flexShrink:0 }} />
                <span style={{ fontSize:12, color:selFeeling?.name===f.name?f.color:C.txs }}>{f.name}</span>
              </div>
            ))}
          </div>
          <Divider />
          <Lbl>Intensity</Lbl>
          <div style={{ display:'flex', alignItems:'center', gap:5 }}>
            <span style={{ fontSize:10 }}>😶</span>
            <input type="range" min={1} max={5} step={1} value={intensity} onChange={e => setIntensity(+e.target.value)} style={{ flex:1, accentColor:selFeeling?.color||C.or }} />
            <span style={{ fontFamily:fonts.mono, fontSize:10, color:selFeeling?.color||C.or, minWidth:12 }}>{intensity}</span>
          </div>
          <textarea rows={2} placeholder="add a note..." value={note} onChange={e => setNote(e.target.value)}
            style={{ background:'rgba(255,140,0,0.06)', border:`1px solid ${C.bd}`, borderRadius:8, padding:'9px 12px', fontSize:11, color:C.tx, outline:'none', fontFamily:fonts.main, resize:'none', minHeight:46 }} />
          <div style={{ opacity:selFeeling?1:.4 }}><Btn onClick={logMood} full>+ Log feeling</Btn></div>
          {todayLogs.length > 0 && (
            <>
              <Divider />
              <Lbl>Today ({todayLogs.length})</Lbl>
              {todayLogs.map(l => (
                <div key={l.id} style={{ display:'flex', alignItems:'center', gap:5, fontSize:10, color:C.txs }}
                  onMouseEnter={ev => { const el=ev.currentTarget.querySelector('.l-del') as HTMLElement|null; if(el) el.style.opacity='1'; }}
                  onMouseLeave={ev => { const el=ev.currentTarget.querySelector('.l-del') as HTMLElement|null; if(el) el.style.opacity='0'; }}>
                  <div style={{ width:7, height:7, borderRadius:'50%', background:l.feeling.color, flexShrink:0 }} />
                  <span style={{ flex:1 }}>{l.feeling.name}{l.note?` · ${l.note}`:''}</span>
                  <span style={{ fontFamily:fonts.mono, fontSize:8, opacity:.4 }}>{l.time}</span>
                  <button className="l-del" onClick={() => delLog(l)} style={{ background:'none', border:'none', color:C.red, cursor:'pointer', fontSize:11, opacity:0, transition:'opacity .15s', padding:0 }}>×</button>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Canvas — callback ref guarantees node is available immediately */}
        <div ref={setWrapper} style={{ flex:1, position:'relative', overflow:'hidden' }}
          onMouseMove={onCanvasMove} onMouseLeave={() => { hovRef.current=null; setTooltip(null); }}>
          <canvas ref={setCanvas} style={{ position:'absolute', top:0, left:0 }} />
          {todayLogs.length === 0 && (
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
              <div style={{ fontFamily:fonts.main, fontSize:13, color:C.txm, textAlign:'center', lineHeight:2, opacity:.4 }}>pick a feeling<br />and log it</div>
            </div>
          )}
          {tooltip !== null && (
            <div style={{ position:'absolute', left:tooltip.x, top:tooltip.y, background:'rgba(10,4,25,.96)', border:`1px solid rgba(255,140,0,.3)`, borderRadius:10, padding:'7px 12px', pointerEvents:'none', fontFamily:fonts.main, fontSize:11, color:C.tx, zIndex:20 }}>
              <strong style={{ color:tooltip.log.feeling.color }}>{tooltip.log.feeling.name}</strong> · intensity {tooltip.log.intensity}<br />
              <span style={{ fontFamily:fonts.mono, fontSize:9, color:C.txm }}>{tooltip.log.time}{tooltip.log.note?` · ${tooltip.log.note}`:''}</span>
            </div>
          )}
        </div>
      </div>

      {/* History */}
      {tab === 'history' && (
        <div style={{ flex:1, overflowY:'auto', padding:12, display:'flex', flexDirection:'column', gap:7 }}>
          {moodLogs.length === 0 ? <EmptyState icon="☁" msg="No mood logs yet." /> : moodLogs.map(l => (
            <div key={l.id} style={{ ...card, display:'flex', alignItems:'center', gap:9 }}
              onMouseEnter={ev => { const el=ev.currentTarget.querySelector('.hl-del') as HTMLElement|null; if(el) el.style.opacity='1'; }}
              onMouseLeave={ev => { const el=ev.currentTarget.querySelector('.hl-del') as HTMLElement|null; if(el) el.style.opacity='0'; }}>
              <div style={{ width:32, height:32, borderRadius:'50%', background:`radial-gradient(circle at 35% 35%,${l.feeling.color}cc,${l.feeling.color}33)`, border:`1px solid ${l.feeling.color}55`, flexShrink:0 }} />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:700, color:l.feeling.color }}>{l.feeling.name}</div>
                {l.note && <div style={{ fontSize:11, color:C.txs, opacity:.7 }}>{l.note}</div>}
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontFamily:fonts.mono, fontSize:9, color:C.txm }}>{l.date} · {l.time}</div>
                <div style={{ display:'flex', gap:2, justifyContent:'flex-end', marginTop:3 }}>
                  {Array.from({ length:l.intensity }).map((_,i) => <div key={i} style={{ width:5, height:5, borderRadius:'50%', background:l.feeling.color }} />)}
                </div>
              </div>
              <button className="hl-del" onClick={() => delLog(l)} style={{ background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.3)', color:C.red, borderRadius:5, padding:'3px 7px', fontSize:9, cursor:'pointer', opacity:0, transition:'opacity .15s', fontFamily:fonts.main }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Manage */}
      {tab === 'manage' && (
        <div style={{ flex:1, overflowY:'auto', padding:12 }}>
          <div style={{ ...card, marginBottom:12, padding:13 }}>
            <div style={{ fontSize:13, fontWeight:700, color:C.tx, marginBottom:10 }}>Create a custom mood</div>
            <FInput label="Mood name" value={newName} onChange={setNewName} placeholder="e.g. nostalgic" />
            <div style={{ marginBottom:10 }}>
              <Lbl>Colour</Lbl>
              <div style={{ display:'flex', gap:5, flexWrap:'wrap', alignItems:'center' }}>
                {SWATCHES.map(sw => (
                  <div key={sw} onClick={() => setNewColor(sw)} style={{ width:20, height:20, borderRadius:'50%', background:sw, border:`2px solid ${newColor===sw?'white':'transparent'}`, cursor:'pointer', transform:newColor===sw?'scale(1.2)':'scale(1)', transition:'transform .15s' }} />
                ))}
                <div style={{ position:'relative', width:20, height:20 }}>
                  <div style={{ width:20, height:20, borderRadius:'50%', background:'conic-gradient(red,#ff0,green,cyan,blue,#f0f,red)', cursor:'pointer' }} />
                  <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} style={{ position:'absolute', inset:0, opacity:0, cursor:'pointer', width:'100%', height:'100%' }} />
                </div>
                <div style={{ width:20, height:20, borderRadius:'50%', background:newColor, border:'2px solid rgba(255,255,255,.35)' }} />
              </div>
            </div>
            <Btn sm onClick={addMood}>Add mood</Btn>
          </div>
          <Lbl>Your moods ({moodDefs.length})</Lbl>
          <div style={{ display:'flex', flexDirection:'column', gap:5, marginTop:7 }}>
            {moodDefs.map(f => (
              <div key={f.name} style={{ ...card, display:'flex', alignItems:'center', gap:9, padding:9 }}>
                <div style={{ width:24, height:24, borderRadius:'50%', background:`radial-gradient(circle at 35% 35%,${f.color}cc,${f.color}44)`, flexShrink:0 }} />
                <span style={{ fontSize:12, fontWeight:700, color:f.color, flex:1 }}>{f.name}</span>
                <button onClick={() => delMood(f)} style={{ background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.3)', color:C.red, borderRadius:5, padding:'2px 7px', fontSize:9, cursor:'pointer', fontFamily:fonts.main }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {toast !== null && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}