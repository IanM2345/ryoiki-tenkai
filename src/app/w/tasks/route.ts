// Home Screen widget page (for apps like Widget Web that show a web page as a widget).
// Plain HTML with no site chrome; needs a widget key: /w/tasks?k=ywk_...
// Optional: &theme=light, &tap=0 (don't open the site when tapped).
import type { NextRequest } from 'next/server';
import { adminClient } from '@/lib/push-server';
import { userForKey, widgetTasks, type WidgetTask } from '@/lib/widget-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const PRIO = { high: '#f87171', medium: '#ff8c00', low: '#4ade80' } as const;

function page(body: string, light: boolean, refresh = true) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
${refresh ? '<meta http-equiv="refresh" content="300">' : ''}
<title>yourworld tasks</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Comic+Neue:wght@400;700&display=swap" rel="stylesheet">
<style>
:root{--bg:${light ? '#fbf6ec' : '#0d0a0f'};--card:${light ? '#f3eadb' : '#1a1320'};--tx:${light ? '#2a1d0e' : '#f5e6d0'};--mut:${light ? '#7a6650' : '#9c8c80'};--or:#ff8c00;--red:#f87171;--yel:${light ? '#b45309' : '#fbbf24'}}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:var(--bg);color:var(--tx);font-family:'Comic Neue','Chalkboard SE','Comic Sans MS',ui-rounded,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;overflow:hidden}
a.w{display:flex;flex-direction:column;height:100%;padding:clamp(10px,4vmin,18px);gap:clamp(6px,2.4vmin,10px);color:inherit;text-decoration:none;
 background:radial-gradient(120% 70% at 0% 0%,${light ? 'rgba(255,140,0,.10)' : 'rgba(168,85,247,.16)'},transparent 60%),radial-gradient(90% 60% at 100% 100%,rgba(255,140,0,.10),transparent 60%),var(--bg)}
.h{display:flex;align-items:center;gap:8px;font-weight:700;font-size:clamp(13px,4.6vmin,17px)}
.h .s{color:var(--or)}.h .n{margin-left:auto;font-size:.8em;color:var(--mut);font-weight:700}
.h .late{background:rgba(248,113,113,.18);color:var(--red);padding:1px 8px;border-radius:99px;font-size:.75em}
ul{list-style:none;display:flex;flex-direction:column;gap:clamp(4px,1.6vmin,7px);flex:1;min-height:0;overflow:hidden}
li{display:flex;align-items:center;gap:8px;padding:clamp(5px,1.8vmin,8px) 10px;border-radius:12px;background:var(--card);font-size:clamp(12px,4.2vmin,15px);line-height:1.2}
li i{width:7px;height:7px;border-radius:50%;flex-shrink:0}
li b{font-weight:400;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
li em{font-style:normal;font-weight:700;font-size:.82em;white-space:nowrap;padding:1px 7px;border-radius:99px;background:rgba(255,255,255,.06);color:var(--mut)}
li em.soon{color:var(--or);background:rgba(255,140,0,.16)}li em.today{color:var(--yel);background:rgba(251,191,36,.14)}
li em.over{color:var(--red);background:rgba(248,113,113,.16)}li em.now{color:#120a02;background:var(--or)}
@media (max-width:240px){li{display:grid;grid-template-columns:7px 1fr;column-gap:8px;row-gap:1px;padding:5px 9px}li em{grid-column:2;justify-self:start;padding:0;background:none!important;font-size:.78em}li em.now{color:var(--or)}}
.more{font-size:clamp(11px,3.4vmin,13px);color:var(--mut);font-weight:700}
.e{flex:1;display:flex;align-items:center;justify-content:center;text-align:center;color:var(--mut);font-size:clamp(12px,4.2vmin,15px);padding:6px}
</style></head><body>${body}</body></html>`;
}

function row(t: WidgetTask) {
  return `<li data-due="${t.due ?? ''}" data-timed="${t.time ? 1 : 0}"><i style="background:${PRIO[t.priority] ?? PRIO.medium}"></i><b>${esc(t.text)}</b><em></em></li>`;
}

// Runs in the widget: countdowns ("in 22 min", "2 days late"), and hides rows that don't fit.
const SCRIPT = `<script>
(function(){
  function span(m){return m<60?m+' min':m<1440?Math.floor(m/60)+'h'+(m%60?' '+m%60+'m':''):Math.round(m/1440)+(Math.round(m/1440)===1?' day':' days')}
  function tick(){
    var now=Date.now(),today=new Date();today.setHours(0,0,0,0);
    document.querySelectorAll('li[data-due]').forEach(function(li){
      var em=li.querySelector('em'),d=li.getAttribute('data-due');
      if(!d){em.style.display='none';return}
      var due=new Date(d).getTime(),ms=due-now,m=Math.round(Math.abs(ms)/60000),txt,cls='';
      if(li.getAttribute('data-timed')==='1'){
        if(ms<=-60000){txt=span(m)+' late';cls='over'}else if(ms<60000){txt='now';cls='now'}
        else{txt='in '+span(m);cls=m<=60?'soon':m<=1440?'today':''}
      }else{
        var day=new Date(due);day.setHours(0,0,0,0);var n=Math.round((day-today)/864e5);
        if(n<0){txt=(-n)+(n===-1?' day':' days')+' late';cls='over'}else if(n===0){txt='today';cls='today'}else if(n===1){txt='tomorrow'}else{txt='in '+n+' days'}
      }
      em.textContent=txt;em.className=cls;
    });
    var ul=document.querySelector('ul'),more=document.querySelector('.more');if(!ul)return;
    var items=[].slice.call(ul.children);items.forEach(function(li){li.style.display=''});
    var base=+(ul.getAttribute('data-extra')||0);if(more){more.textContent='+'+(base||1)+' more';more.style.display=base||ul.scrollHeight>ul.clientHeight+1?'':'none'}
    var hidden=0;for(var i=items.length-1;i>0&&ul.scrollHeight>ul.clientHeight+1;i--){items[i].style.display='none';hidden++}
    var extra=+(ul.getAttribute('data-extra')||0)+hidden;
    if(more){more.textContent=extra?'+'+extra+' more':'';more.style.display=extra?'':'none'}
  }
  tick();setInterval(tick,30000);window.addEventListener('resize',tick);if(document.fonts&&document.fonts.ready)document.fonts.ready.then(tick);
})();
</script>`;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const light = q.get('theme') === 'light';
  const html = (body: string, status = 200, refresh = true) => new Response(page(body, light, refresh), {
    status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' },
  });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return html('<div class="e">Widgets aren\'t set up on the site yet.</div>', 500, false);
  const db = adminClient();
  const user = await userForKey(db, q.get('k'));
  if (!user) return html('<div class="e">This widget key isn\'t valid any more. Make a new one in yourworld → App &amp; backup.</div>', 401, false);
  const data = await widgetTasks(db, user, process.env.APP_TIMEZONE || 'Europe/London');
  const href = q.get('tap') === '0' ? '#' : `${req.nextUrl.origin}/tasks`;
  const list = data.tasks.length
    ? `<ul data-extra="${data.total - data.tasks.length}">${data.tasks.map(row).join('')}</ul><div class="more"></div>`
    : '<div class="e">Nothing due this week ✦</div>';
  return html(`<a class="w" href="${href}" target="_top">
<div class="h"><span class="s">✦</span>Tasks${data.late ? `<span class="late">${data.late} late</span>` : ''}<span class="n">${data.total || ''}</span></div>
${list}</a>${SCRIPT}`);
}
