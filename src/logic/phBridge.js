/* Bridge between PulseLogic (the original state holder) and the Precision Health layer.
   PulseLogic keeps the page, tab and params. Everything clinical, operational and numeric
   comes from the PH store, so the old chat, agent and ontology views stay consistent with the
   new pages. Overrides are merged over the flat view object after renderVals runs. */
import { PAGE_BY_ID, defaultTab, hashFor, parseHash, isPhScreen, tabLabel } from "../ph/model/nav";
import {
  navAttention, storyViews, reviewStats, batchStats, followUpList, reminderStats, taskViews, approvalViews, persona as phPersona, answerQuery, suggestedPrompts,
  visibleFiles, linkFor, greetingFor, fmtDateLong, fmtTime, todayStats, todaySessions, sessionStats, visibleTasks, fmtWhen, ontologyModel, ONTO_CLUSTER_DEFS, PH_FILES,
} from "../ph/model";
import { phStore } from "../ph/store";

/** Tab counts shown in the top bar. All derived from the shared store. */
function tabCount(state, page, tab) {
  try {
    if (page === "Results") {
      if (tab === "imports") { const q = state.importRows.filter(r => r.state === "quarantined").length; return q ? String(q) : ""; }
      if (tab === "review") { const n = reviewStats(state).ready; return n ? String(n) : ""; }
      if (tab === "follow-up") { const n = followUpList(state).filter(f => f.followUp.status === "open").length; return n ? String(n) : ""; }
    }
    if (page === "Participants" && tab === "communications") { const n = reminderStats(state).failed; return n ? String(n) : ""; }
    if (page === "Work") {
      if (tab === "tasks") { const n = taskViews(state).filter(t => t.visible && t.status !== "done").length; return n ? String(n) : ""; }
      if (tab === "approvals") { const n = approvalViews(state).filter(a => a.visible && a.status === "pending").length; return n ? String(n) : ""; }
    }
  } catch (e) { /* counts are decoration; never break the header */ }
  return "";
}

/** Replaces the top-bar tabs, hint and search label for every page from the PH registry. */
export function phContext(logic, page, seg, contextNav, contextHint, searchHint) {
  const def = PAGE_BY_ID[page];
  if (!def) return { contextNav, contextHint, searchHint };
  const state = phStore.getState();
  const tab = logic.tabFor(page);
  if (!def.tabs.length) {
    return { contextNav: [seg(def.label, true, () => {})], contextHint: "CHAT FIRST · DEMO", searchHint: "Search everything you can see" };
  }
  const tabs = def.tabs.map(t => seg(t.label, t.id === tab, () => logic.phGo({ page, tab: t.id }), tabCount(state, page, t.id)));
  const label = tabLabel(page, tab);
  return {
    contextNav: tabs,
    contextHint: (def.label + " · " + label).toUpperCase(),
    searchHint: "Search " + (label ? label.toLowerCase() : def.label.toLowerCase()),
  };
}

const NOTIF_TONE = { bad: "var(--bad)", warn: "var(--warn)", ok: "var(--ok)", info: "var(--accent)", neutral: "var(--neutral)" };

function notificationsFor(state, logic) {
  const items = [];
  const st = storyViews(state);
  const p = phPersona(state);
  const tone = { "ST-01": "warn", "ST-02": "warn", "ST-03": "info", "ST-04": "bad", "ST-05": "bad", "ST-06": "info" };
  st.filter(s => s.open).forEach(s => {
    if (s.def.clinical && s.restricted && s.def.id !== "ST-04") return;
    items.push({ text: s.headline, when: s.dueAt ? "Due " + fmtTime(s.dueAt) : "Open", event: s.def.id + " · " + s.ownerName, dot: NOTIF_TONE[tone[s.def.id]] || NOTIF_TONE.info, target: s.target });
  });
  if (!items.length) items.push({ text: "Nothing needs attention right now.", when: "Now", event: "All stories resolved", dot: NOTIF_TONE.ok });
  void p;
  return items.map((n, i) => ({
    dot: n.dot, text: n.text, when: n.when, event: n.event,
    open: () => { if (n.target) logic.phGo(n.target); logic.setState({ showNotifs: false }); },
    cardStyle: "position:relative;flex:none;display:flex;align-items:flex-start;gap:11px;padding:13px 15px;border-radius:var(--r-md,16px);cursor:pointer;"
      + "background:var(--surface);border:1px solid var(--border);"
      + "transition:background .2s var(--ease),border-color .2s var(--ease),transform .22s var(--ease);"
      + "animation:notifCard .62s cubic-bezier(.16,1,.28,1) " + (110 + i * 62) + "ms both",
    washStyle: "position:absolute;left:0;top:0;bottom:0;width:58%;pointer-events:none;border-radius:var(--r-md,16px) 0 0 16px;"
      + "background:linear-gradient(90deg," + n.dot + "14, transparent 78%)",
    dotStyle: "position:relative;width:7px;height:7px;border-radius:50%;flex:none;margin-top:5px;background:" + n.dot,
  }));
}

/* ---- Home chat ---- */
const PRIMARY = {bg:"var(--accent-fill,var(--accent))", color:"var(--on-accent)", border:"transparent"};
const SECONDARY = {bg:"none", color:"var(--ink)", border:"var(--border)"};

function answerView(logic, state, m) {
  const a = answerQuery(state, m.q);
  const cols = a.cols || [];
  return {
    isUser:false, isHelios:true, text:a.text, typing:false,
    hasTool:true, tool:a.tool, toolEffect:"· " + a.effect, toolDot:"var(--accent)",
    hasTable: cols.length > 0 && (a.rows || []).length > 0, cols, tableCols:"repeat(" + Math.max(1, cols.length) + ",minmax(0,1fr))",
    rows:(a.rows || []).map(r => ({cells:r.map((c, i) => ({v:c, color: i === 0 ? "var(--ink)" : "var(--dim)", font: i === 0 ? "inherit" : "var(--mono)"}))})),
    hasConfirm:false, confirmSummary:"", confirmHash:"",
    hasActions:(a.actions || []).length > 0,
    actions:(a.actions || []).map(x => Object.assign({label:x.label}, x.primary ? PRIMARY : SECONDARY, {
      run: () => { if (x.target) logic.phGo(x.target); else if (x.ask) logic.ask(x.ask); }
    }))
  };
}

function homeOverrides(logic, state, p) {
  const st = logic.state;
  const prompts = suggestedPrompts(state);
  const rv = reviewStats(state);
  const rem = reminderStats(state);
  const quar = state.importRows.filter(r => r.state === "quarantined").length;
  const D = todayStats(state);
  const first = p.name.split(" ")[0];
  const pill = p.perms.has("clinical.review")
    ? rv.ready + " REPORTS TO REVIEW · " + quar + " IMPORT EXCEPTIONS"
    : p.role === "operations" ? quar + " IMPORT EXCEPTIONS · " + rem.failed + " FAILED REMINDERS"
    : D.booked + " APPOINTMENTS TODAY · " + D.available + " SLOTS FREE";
  const has = (id) => st.widgets.indexOf(id) > -1;
  const thread = st.thread.map(m => m.role === "user"
    ? {isUser:true, isHelios:false, text:m.text}
    : answerView(logic, state, m));
  return {
    greetingPrefix: greetingFor(state.clock.nowUtc),
    greetingName: first,
    homeSubline: fmtDateLong(state.clock.nowUtc) + ", " + fmtTime(state.clock.nowUtc) + " in Dublin. Ask about clinics, lab imports, reviews or programme reports.",
    approvalsPill: pill,
    goApprovals: () => logic.ask(prompts[0]),
    phPrompts: prompts.map(label => ({label, run: () => logic.ask(label)})),
    thread,
    threadTitle: (st.thread.find(m => m.role === "user") || {}).text || "",
    show: {clinics: has("clinics"), imports: has("imports"), review: has("review"), capacity: has("capacity"), work: has("work"), activity: has("activity")},
    removeWidget: (id) => logic.toggleIn("widgets", id),
    phPaletteClose: () => logic.setState({paletteOpen:false}),
    phPaletteGo: (t) => { logic.setState({paletteOpen:false}); logic.phGo(t); },
    phPaletteAsk: (q) => logic.ask(q),
  };
}

/* ---- mini chat ---- */
function miniOverrides(logic, state, p) {
  const st = logic.state;
  const first = p.name.split(" ")[0];
  const prompts = suggestedPrompts(state).slice(0, 3);
  const D = todayStats(state);
  const sess = todaySessions(state).map(s => sessionStats(state, s.id));
  const tasks = visibleTasks(state).filter(t => t.status !== "done").slice(0, 4);
  const notes = notificationsFor(state, logic).slice(0, 3);
  const toggle = (key) => () => logic.setState(prev => ({miniWorkOpen: prev.miniWorkOpen === key ? null : key}));
  const wrap = "background:var(--surface);border:1px solid var(--border);border-radius:var(--card-r,18px);overflow:hidden";
  return {
    miniGreeting: greetingFor(state.clock.nowUtc) + ", " + first,
    miniSuggestions: prompts.map(label => ({label, run: () => logic.askMini(label)})),
    miniThread: st.miniThread.map(m => {
      const text = m.role === "user" ? m.text : answerQuery(state, m.q).text;
      return {
        text,
        wrapStyle: "display:flex;margin-bottom:12px;" + (m.role === "user" ? "justify-content:flex-end" : "justify-content:flex-start"),
        bubbleStyle: "max-width:84%;padding:11px 14px;font-size:13px;line-height:1.6;border-radius:" + (m.role === "user" ? "16px 16px 5px 16px" : "16px 16px 16px 5px") + ";"
          + (m.role === "user" ? "background:var(--accent-fill,var(--accent));color:var(--on-accent);box-shadow:var(--accent-glow,none)" : "background:var(--surface);border:1px solid var(--border);color:var(--body)")
      };
    }),
    miniWorkSections: [
      {num:"01", title:"Clinics today", icon:"M8 4v3 M16 4v3 M4.5 9.5h15 M6.4 6h11.2A1.9 1.9 0 0 1 19.5 8v10a1.9 1.9 0 0 1-1.9 1.9H6.4A1.9 1.9 0 0 1 4.5 18V8A1.9 1.9 0 0 1 6.4 6Z",
        statusText: D.booked + " booked", statusColor:"var(--accent)", open:(st.miniWorkOpen || "meetings") === "meetings", toggle:toggle("meetings"),
        isEmpty:sess.length === 0, emptyText:"No clinics today.",
        rows: sess.map(x => ({isCheck:false, title:x.programme.code + " " + x.session.siteName + ": " + x.booked + "/" + x.slots, hasTag:false})),
        hasLink:true, linkLabel:"Open clinics", linkGo: () => { logic.setState({miniOpen:false}); logic.phGo({page:"Clinics", tab:"overview"}); }, wrapStyle:wrap},
      {num:"02", title:"Tasks", icon:"M5 6.5h2l1.4 1.4L11 5.5 M5 12.5h2l1.4 1.4 2.6-2.4 M5 18.5h2l1.4 1.4 2.6-2.4 M15 6.5h4 M15 12.5h4 M15 18.5h4",
        statusText: tasks.length + " open", statusColor:"var(--accent)", open:st.miniWorkOpen === "tasks", toggle:toggle("tasks"),
        isEmpty:tasks.length === 0, emptyText:"Nothing open.",
        rows: tasks.map(t => ({isCheck:true, title:t.title, hasTag:true, tag:t.task.priority, tagStyle:"flex:none;padding:2px 9px;border-radius:var(--chip-r,6px);font-size:11px;background:var(--track);color:var(--dim)"})),
        hasLink:true, linkLabel:"All tasks", linkGo: () => { logic.setState({miniOpen:false}); logic.phGo({page:"Work", tab:"tasks"}); }, wrapStyle:wrap},
      {num:"03", title:"Needs attention", icon:"M12 4a5.5 5.5 0 0 0-5.5 5.5v3.2L5 16h14l-1.5-3.3V9.5A5.5 5.5 0 0 0 12 4Z M9.8 19a2.2 2.2 0 0 0 4.4 0",
        statusText: notes.length + " open", statusColor:"var(--warn)", open:st.miniWorkOpen === "notifications", toggle:toggle("notifications"),
        isEmpty:false, emptyText:"", rows: notes.map(n => ({isCheck:false, title:n.text, hasTag:false})),
        hasLink:true, linkLabel:"All notifications", linkGo: () => logic.setState({showNotifs:true, miniOpen:false}), wrapStyle:wrap}
    ],
  };
}

/* ---- files, as the tree the Files tab renders ---- */
const VIS = {all_staff:"All staff", clinical:"Clinical roles only", reporting:"Reporting roles"};
export function phFileTree(state) {
  const files = visibleFiles(state);
  const folders = Array.from(new Set(files.map(f => f.folder)));
  const rows = [];
  const b = batchStats(state, "BATCH-20261002-01");
  folders.forEach(folder => {
    rows.push({type:"folder", id:"f-" + folder, name:folder, depth:0});
    files.filter(f => f.folder === folder).forEach(f => {
      const body = [f.summary];
      if (f.id === "file-eurofins") {
        body.push("Header: Specimen ID, Surname and initial, DOB, Analyte, Result, Unit, Result date.");
        body.push(b.rows + " observation rows across " + b.specimens + " specimens: " + b.imported + " imported, " + b.duplicates + " duplicates skipped, " + b.quarantined + " quarantined. Rows are not people.");
      }
      if (f.id === "file-consent") body.push("Retention wording in this sample is flagged for review in Settings, Governance. It is not applied to future records.");
      rows.push({type:"file", id:f.id, name:f.name, depth:1, parent:"f-" + folder, indexed:true, path:folder + " / " + f.type, title:f.name,
        facts:[["TYPE", f.type], ["OWNER", f.owner], ["VERSION", f.version], ["VISIBILITY", VIS[f.visibility]]],
        body, links:[[f.linked.label, f.linked.kind, f.linked.id]]});
    });
  });
  return rows;
}

function filesOverrides(logic, state, v) {
  const rows = phFileTree(state);
  const files = rows.filter(r => r.type === "file");
  const active = files.find(r => r.id === logic.state.treeFile) || files[0];
  return {
    tree: Object.assign({}, v.tree, {
      links: active ? active.links.map(l => ({label:l[0], open: () => logic.phGo(linkFor(l[1], l[2]))})) : [],
    }),
  };
}

/* ---- ontology: PH clusters, real counts, a relationship drawer ---- */
function ontologyOverrides(logic, state, v, p) {
  const model = ontologyModel(state);
  const clinical = p.perms.has("clinical.view");
  const sel = logic.state.ontoCluster;
  const fmt = (n) => n.toLocaleString("en-IE");
  return {
    graph: Object.assign({}, v.graph, {
      nodeCount: fmt(model.totalRecords), edgeCount: fmt(model.totalRelationships),
      legend: ONTO_CLUSTER_DEFS.map((c, i) => {
        const restricted = !clinical && [4, 5, 6, 7].indexOf(i) > -1;
        return {label: restricted ? "Restricted" : c.name, bg: restricted ? "var(--track)" : c.color, count: restricted ? "" : fmt(model.clusterCounts[i]),
          pick: () => logic.setState(prev => ({ontoCluster: prev.ontoCluster === i ? null : i}))};
      }),
    }),
    onto: Object.assign({}, v.onto, {drawer: {open: sel !== null && sel !== undefined, cluster: sel, close: () => logic.setState({ontoCluster:null})}}),
  };
}

/** Everything PH wants to say over the base view object. */
export function phOverrides(logic, v) {
  const st = logic.state;
  const state = phStore.getState();
  const page = st.page;
  const tab = logic.tabFor(page);
  const screen = isPhScreen(page, tab);
  const persona = phPersona(state);
  const attention = navAttention(state);
  const notes = notificationsFor(state, logic);
  return {
    phNav: logic.phNavObject(),
    phScreen: screen,
    phPersona: { initials: persona.initials, name: persona.displayName, title: persona.title },
    portalOpen: !!st.portalOpen,
    closePortal: () => logic.closePortal(),
    /* The old page models are not used for these screens. */
    isDashboard: false, isWork: false, isActivity: false, isSettings: false,
    isRecords: page === "Records" && !screen,
    isAgents: page === "Agents" && tab === "conversations",
    showPillNav: true,
    showRecordsWash: page === "Records" && !screen && tab !== "ontology",
    rec: Object.assign({}, v.rec, {
      hasHero: v.rec.hasHero && !screen,
      contacts: (v.rec.contacts || []).map(c => Object.assign({}, c, {open: () => logic.phGo({page:"Records", tab:"companies", params:{company: contactCompany(c.name)}})})),
    }),
    notifications: notes,
    inboxCount: String(notes.filter(n => n.dot !== NOTIF_TONE.ok).length),
    phAttention: attention,
    ...homeOverrides(logic, state, persona),
    ...miniOverrides(logic, state, persona),
    ...filesOverrides(logic, state, v),
    ...ontologyOverrides(logic, state, v, persona),
    density: st.density || "comfortable",
    reduceMotion: !!st.reduceMotion,
  };
}

import { CONTACTS as PH_CONTACT_LIST } from "../ph/model";
function contactCompany(name) {
  const c = PH_CONTACT_LIST.find(x => x.name === name);
  return c ? c.companyId : "";
}

export function applyHash(logic, hash) {
  const t = parseHash(hash || "");
  if (!t) return false;
  logic.phApply(t, false);
  return true;
}

export { defaultTab, hashFor, batchStats, PH_FILES, fmtWhen };
