// The Scriptable script for her Home Screen / Lock Screen task widget.
// Generated on her device with her private key built in (it never passes through anything else).
export function scriptableScript(origin: string, key: string): string {
  const feed = `${origin}/api/widget/tasks?k=${encodeURIComponent(key)}`;
  const open = `${origin}/tasks`;
  return `// yourworld · Tasks widget for Scriptable
// Made in yourworld → App & backup. Keep it private: the key below can read your task list (and nothing else).
const FEED = ${JSON.stringify(feed)};
const OPEN = ${JSON.stringify(open)};

const C = {
  bg: new Color("#0d0a0f"), card: new Color("#1a1320"), tx: new Color("#f5e6d0"), mut: new Color("#9c8c80"),
  or: new Color("#ff8c00"), red: new Color("#f87171"), yel: new Color("#fbbf24"), pu: new Color("#a855f7"),
};
const PRIO = { high: new Color("#f87171"), medium: new Color("#ff8c00"), low: new Color("#4ade80") };

const fm = FileManager.local();
const cache = fm.joinPath(fm.cacheDirectory(), "yourworld-tasks.json");

async function load() {
  const host = FEED.split("/")[2] || "";
  if (/^(localhost|127\\.|10\\.|192\\.168\\.|0\\.0\\.0\\.0)|\\.local(:|$)/.test(host))
    return { error: "This was made on a test copy (" + host + "), which a phone can't reach. Make a new widget from the live site." };
  let r, text;
  try {
    r = new Request(FEED); r.timeoutInterval = 15;
    text = await r.loadString();
  } catch (e) {
    // no connection at all: show the last copy if there is one
    if (fm.fileExists(cache)) { const d = JSON.parse(fm.readString(cache)); d.offline = true; return d; }
    return { error: "Can't reach " + host + " right now. It will update when you're back online." };
  }
  const code = r.response ? r.response.statusCode : 0;
  let d = null; try { d = JSON.parse(text); } catch (e) { /* not JSON */ }
  const seen = (text + " " + (r.response && r.response.url || "")).toLowerCase();
  if (!d && (seen.indexOf("vercel.com/login") >= 0 || seen.indexOf("vercel.com/sso") >= 0 || seen.indexOf("vercel authentication") >= 0))
    return { error: "This link is locked by Vercel (it's a one-deploy link). Make a new widget from the site's main address." };
  if (!d) return { error: code === 404 ? "The site doesn't have widgets yet. Deploy the latest update, then try again." : "The site sent something unexpected (" + code + "). Try again in a minute." };
  if (code !== 200) return { error: d.error || "Couldn't load your tasks (" + code + ")." };
  fm.writeString(cache, JSON.stringify(d));
  return d;
}

function dayLabel(t) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(t.due); day.setHours(0, 0, 0, 0);
  const n = Math.round((day - today) / 864e5);
  if (n < 0) return [(-n) + (n === -1 ? " day" : " days") + " late", C.red];
  if (n === 0) return ["today", C.yel];
  if (n === 1) return ["tomorrow", C.mut];
  return ["in " + n + " days", C.mut];
}

// The little countdown: live for timed tasks (iOS keeps it ticking), a word for date-only ones.
function addWhen(stack, t, size) {
  if (!t.due) return;
  if (t.time) {
    const due = new Date(t.due), ms = due - Date.now();
    const col = ms < 0 ? C.red : ms < 3600e3 ? C.or : ms < 864e5 ? C.yel : C.mut;
    const pre = stack.addText(ms < 0 ? "" : "in "); pre.font = Font.boldSystemFont(size); pre.textColor = col;
    const d = stack.addDate(due); d.applyRelativeStyle(); d.font = Font.boldSystemFont(size); d.textColor = col; d.lineLimit = 1;
    if (ms < 0) { const post = stack.addText(" late"); post.font = Font.boldSystemFont(size); post.textColor = col; }
  } else {
    const [txt, col] = dayLabel(t);
    const s = stack.addText(txt); s.font = Font.boldSystemFont(size); s.textColor = col;
  }
}

function header(w, data, size) {
  const h = w.addStack(); h.centerAlignContent();
  const star = h.addText("✦ "); star.textColor = C.or; star.font = Font.boldSystemFont(size);
  const t = h.addText("Tasks"); t.textColor = C.tx; t.font = Font.boldSystemFont(size);
  if (data.late) { h.addSpacer(6); const l = h.addText(data.late + " late"); l.textColor = C.red; l.font = Font.boldSystemFont(size - 3); }
  h.addSpacer();
  if (data.offline) { const o = h.addText("offline"); o.textColor = C.mut; o.font = Font.systemFont(size - 4); h.addSpacer(6); }
  const n = h.addText(String(data.total || "")); n.textColor = C.mut; n.font = Font.boldSystemFont(size - 2);
}

function row(w, t, compact) {
  const r = w.addStack(); r.centerAlignContent();
  r.backgroundColor = C.card; r.cornerRadius = 10;
  r.setPadding(compact ? 4 : 6, 8, compact ? 4 : 6, 8);
  const dot = r.addText("●"); dot.font = Font.systemFont(8); dot.textColor = PRIO[t.priority] || C.or;
  r.addSpacer(6);
  if (compact) {
    const col = r.addStack(); col.layoutVertically();
    const tx = col.addText(t.text); tx.font = Font.systemFont(12); tx.textColor = C.tx; tx.lineLimit = 1;
    if (t.due) { const wn = col.addStack(); addWhen(wn, t, 10); }
  } else {
    const tx = r.addText(t.text); tx.font = Font.systemFont(14); tx.textColor = C.tx; tx.lineLimit = 1;
    r.addSpacer(8);
    const wn = r.addStack(); addWhen(wn, t, 12);
  }
}

const data = await load();
const fam = config.widgetFamily || "medium";
const w = new ListWidget();
w.url = OPEN;
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

if (fam.startsWith("accessory")) {
  // Lock Screen
  const next = (data.tasks || [])[0];
  if (data.error) { w.addText("yourworld: " + data.error); }
  else if (fam === "accessoryInline") {
    w.addText(next ? "✦ " + next.text : "✦ Nothing due this week");
  } else if (fam === "accessoryCircular") {
    const n = w.addText(String(data.total || 0)); n.font = Font.boldSystemFont(22); n.centerAlignText();
    const l = w.addText("tasks"); l.font = Font.systemFont(10); l.centerAlignText();
  } else {
    const h = w.addText("✦ " + (data.total ? data.total + " tasks" + (data.late ? ", " + data.late + " late" : "") : "No tasks")); h.font = Font.boldSystemFont(12);
    if (next) {
      const tx = w.addText(next.text); tx.font = Font.systemFont(14); tx.lineLimit = 1;
      if (next.due) { const s = w.addStack(); addWhen(s, next, 12); }
    }
  }
} else {
  w.backgroundColor = C.bg;
  const g = new LinearGradient(); g.colors = [new Color("#1d1328"), C.bg]; g.locations = [0, 1]; w.backgroundGradient = g;
  const small = fam === "small", large = fam === "large" || fam === "extraLarge";
  w.setPadding(small ? 12 : 14, small ? 12 : 14, small ? 12 : 14, small ? 12 : 14);
  if (data.error) {
    header(w, { total: 0 }, small ? 14 : 16); w.addSpacer();
    const e = w.addText(data.error); e.textColor = C.mut; e.font = Font.systemFont(12); w.addSpacer();
  } else {
    header(w, data, small ? 14 : 16);
    w.addSpacer(small ? 6 : 8);
    const tasks = data.tasks || [];
    const max = small ? 3 : large ? 9 : 4;
    if (!tasks.length) { w.addSpacer(); const e = w.addText("Nothing due this week ✦"); e.textColor = C.mut; e.font = Font.systemFont(13); }
    tasks.slice(0, max).forEach((t, i) => { if (i) w.addSpacer(small ? 4 : 5); row(w, t, small); });
    const more = (data.total || 0) - Math.min(max, tasks.length);
    w.addSpacer();
    if (more > 0) { const m = w.addText("+" + more + " more"); m.textColor = C.mut; m.font = Font.boldSystemFont(11); }
  }
}

Script.setWidget(w);
if (config.runsInApp) await w.presentMedium();
Script.complete();
`;
}
