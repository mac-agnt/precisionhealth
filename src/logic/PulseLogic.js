import React from "react";
import { DCLogic } from "../runtime/logic";
import {
  INK,
  BODY,
  DIM,
  LIME,
  GREEN,
  AMBER,
  RED,
  NEUTRAL,
  MONO,
  ICONS,
  REC_SECTIONS as REC_SECTIONS_RAW,
  CONTACTS,
  FILE_TREE,
  ONTO_NODES,
  ONTO_EDGES,
  PEOPLE,
  BG_DEFS,
  THEMES,
  ADMIN_CARDS,
  ADMIN_GROUPS,
  STREAM_DEFS,
  NAV as NAV_RAW,
  ITEMS,
  ORDER,
  ORGS,
  AGENT_DEFS,
  ASPECT_DEFS,
  OPS_DEFS,
  WORK_SECTIONS,
  WORK_TASKS,
  WIDGET_DEFS,
  PERSONALITIES,
  ANSWER_STYLES,
  TRAIN_PHASES,
  BRIEF_QUESTIONS,
  STATE_LABELS,
  FACE_SHAPES,
  FACE_TINTS,
  CLUSTERS,
  mulberry,
  hexRGB,
  buildGraph
} from "./data";
import { phStore, dispatch as phDispatch } from "../ph/store";
import { act as phAct, defaultTab, hashFor, navAttention } from "../ph/model";
import { phContext, phOverrides, applyHash, phFileTree } from "./phBridge";
import { answerQuery as phAnswer, agentReply as phAgentReply, agentSuggestions as phAgentSuggestions, toDublin as phToDublin } from "../ph/model";

/* ── Locked layout ──────────────────────────────────────────────────────────
   These two rules hold for every client build, whatever data.js says:
   1. Records always opens on Ontology, and Ontology is always the first tab.
      If a customisation drops or renames it, the stock Ontology tab is put back.
   2. Agents always sits directly under Home in the side rail.
   Re-theme and re-label freely; don't remove these guards. */
const ONTOLOGY_SECTION = {id:"ontology", label:"Ontology", blurb:"How every record connects: entities, predicates and the paths between them."};
const REC_SECTIONS = [REC_SECTIONS_RAW.find(s => s.id === "ontology") || ONTOLOGY_SECTION]
  .concat(REC_SECTIONS_RAW.filter(s => s.id !== "ontology"));
const NAV = (() => {
  const items = NAV_RAW.filter(n => n.page !== "Home" && n.page !== "Agents");
  const home = NAV_RAW.find(n => n.page === "Home") || {label:"Home", icon:"helios", page:"Home"};
  const agents = NAV_RAW.find(n => n.page === "Agents") || {label:"Agents", icon:"navAgents", page:"Agents"};
  // Leading dividers would otherwise sit between Agents and the next item.
  while (items.length && items[0].divider) items.shift();
  return [home, agents].concat(items);
})();

/* All state and behaviour for Pulse. renderVals() returns the flat object the views render from. */
export default class PulseLogic extends DCLogic {
  state = { w: typeof window === "undefined" ? 1440 : window.innerWidth, theme:"harbour", page:"Home", draft:"", query:"", thread:[], typed:0, paletteOpen:false, showNotifs:false, palScope:"All", palSel:0, palRecent:["Aisling Byrne","BATCH-20261002-01"],
            done:{}, resolved:{}, approved:{}, inboxFilter:"All", approvalFilter:"Awaiting you", open:null, range:"30d",
            workDoc:null, workDocTab:"work",
            queue:"mine", recordTab:"Overview", record:"person", hovered:null, hoverLabel:"", hoverHint:"", hoverTop:0,
            flags:{approvals:true, automations:true, insights:true, customEntities:false, whatsapp:true, composio:false},
            workSection:"tasks", workViews:{}, addedTasks:[], newTask:"", newPriority:"Medium",
            timerRunning:false, timerTask:null, timerPreset:null, scheduleOff:{},
            adminCard:null, adminFlags:{},
            adminOpen:null, adminFlags:{}, adminGroup:null,
            actPaused:false, actHover:null, actKpi:"all", actQuery:"", actOpen:null, actTick:0,
            recSection:"ontology", recAsk:"", treeOpen:true, treeExpanded:{}, treeFile:"fl-1", treeQuery:"",
            ontoNode:"Organisation", ontoHover:null, ontoLayout:"Force",
            newRecOpen:false, newRecName:"", newRecTemplate:"Field sheet", newRecCat:"All",
            opsFilter:"all", opsOff:{}, opsOpen:null, opsScope:"week", opsDay:26, opsOrder:null, opsDrag:null,
            opsBuilderOpen:false, opsBuilderMode:"workflow", builderText:"", builderGenerated:false,
            railOpen: typeof window === "undefined" || window.innerWidth >= 1100, barOpen:true, chatRailPinned:false, widgetEdit:false, widgets:["clinics","imports","review","capacity","work"],
            kpiEdit:false, kpiKeys:["revenue","cash","overdue","margin","jobs"],
            aspect:"sales", filterMenuOpen:false, customFilter:"", extraFilters:[],
            workWidget:"queue", miniOpen:false, miniThread:[], miniDraft:"", miniTab:"chat", miniTone:"plain", miniWorkOpen:"tasks",
            agents:AGENT_DEFS, agentId:"briefing", groupNames:{}, agentQuery:"", agentDraft:"", agentExtra:{},
            builderOpen:false, builderMode:"new", trained:false, training:false, trainPhase:0,
            briefThread:[], briefDraft:"", briefPicks:{},
            agentSpec:{name:"", shape:"crown-pebble", tint:"#191c1f", persona:"", personality:"Straight-talking",
                   answer:"Short answers", context:["Organisations","Tasks"], skills:["Search records","Summarise activity"], tasks:[]},
            phTab:{}, phParams:{}, portalOpen:false, density:"comfortable", reduceMotion:false };

  /* One event per stream on its own cadence, so the three columns never move in
     lockstep. A hovered column and a paused view are both simply skipped. */
  seedActivity(){
    const now = Date.now();
    this._actId = 0;
    const seed = (def, count) => def.pool.slice(0, count).map((e, i) => this.mkEvent(def, e, now - (i + 1) * def.every * 1.4));
    this.feeds = {};
    STREAM_DEFS.forEach(d => { this.feeds[d.id] = seed(d, 5); this._actCursor = 0; });
    this._nextPush = {};
    STREAM_DEFS.forEach(d => { this._nextPush[d.id] = now + d.every * (0.4 + Math.random() * 0.6); });
  }

  mkEvent(def, tpl, at){
    const status = tpl[5];
    return {id: "e" + (++this._actId), stream: def.id, title: tpl[0], note: tpl[1],
      actor: tpl[2], rel: tpl[3], src: tpl[4], status,
      progress: status === "working" ? 8 + Math.random() * 22 : 100,
      at: at === undefined ? Date.now() : at, fresh: at === undefined};
  }

  tickActivity(){
    if (!this.feeds) return;
    const now = Date.now();
    let dirty = false;
    for (const def of STREAM_DEFS){
      const list = this.feeds[def.id];
      for (const e of list){
        if (e.status === "working"){
          e.progress = Math.min(100, e.progress + 2.4 + Math.random() * 3);
          if (e.progress >= 100){ e.status = "completed"; dirty = true; }
        }
        if (e.fresh && now - e.at > 1400){ e.fresh = false; dirty = true; }
      }
      if (this.state.actPaused || this.state.actHover === def.id) continue;
      if (now >= this._nextPush[def.id]){
        const tpl = def.pool[Math.floor(Math.random() * def.pool.length)];
        list.unshift(this.mkEvent(def, tpl));
        if (list.length > 7) list.pop();
        this._nextPush[def.id] = now + def.every * (0.7 + Math.random() * 0.7);
        dirty = true;
      }
    }
    if (dirty || now - (this._actStamp || 0) > 900){
      this._actStamp = now;
      try { this.setState({actTick: now}); } catch (e) {}
    }
  }

  /* Several shortest-path searches run at once, each with its own hue. The
     settling order and parent tree are solved up front; the animation only
     reveals them, so every spark follows a route the graph really has. */
  QUERY_HUES(){ return ["#c8f04b", "#6ad0f0", "#9d8cf5", "#f0c04b", "#f07a9d", "#5fe0a8"]; }

  /* Keyword search: match the query against cluster names, then trace a real
     path between two matches (or around one, if only a single cluster hits)
     using the same Dijkstra the ambient sparks use — so the result is an
     actual route through the graph, not a fake highlight. */
  matchClusters(q){
    const words = q.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    if (!words.length) return [];
    const hit = [];
    CLUSTERS.forEach((c, i) => {
      if (this.phClinicalCluster(i)) return;
      const name = c[0].toLowerCase();
      if (words.some(w => name.includes(w) || w.includes(name.split(" ")[0]))) hit.push(i);
    });
    return hit;
  }

  runOntoQuery(){
    const q = (this.state.ontoQuery || "").trim();
    if (!q || !this.graph) { this.setState({ontoResult:null}); return; }
    const g = this.graph, hits = this.matchClusters(q);
    if (!hits.length){ this.setState({ontoResult:{empty:true, query:q}}); return; }

    const hubOf = (ci) => g.hubs.filter(h => g.nodes[h].cluster === ci);
    const hues = this.QUERY_HUES();

    if (hits.length > 1){
      const source = hubOf(hits[0])[Math.floor(Math.random() * hubOf(hits[0]).length)];
      const pool = hubOf(hits[1]);
      const target = pool[Math.floor(Math.random() * pool.length)];
      const search = this.makeTargetedSearch(source, target, 0, hues[0]);
      search.pinned = true;
      this.searches = [search];
      this.setState({ontoResult:{
        empty:false, query:q, mode:"path",
        from: CLUSTERS[g.nodes[source].cluster][0], to: CLUSTERS[g.nodes[target].cluster][0],
        hops: search.path.length ? search.path.length - 1 : null,
        found: search.path.length > 0
      }});
      return;
    }

    // A single match fans out several routes at once — everything the graph
    // has connected to that topic, not just one path to one other record.
    const hub = hubOf(hits[0]);
    const fanCount = Math.min(5, Math.max(3, hub.length));
    const touched = new Set();
    const runs = [];
    for (let i = 0; i < fanCount; i++){
      const source = this.rimNode();
      const target = this.centreNode();
      const search = this.makeTargetedSearch(source, target, i, hues[i % hues.length]);
      search.pinned = true;
      if (search.path.length){ touched.add(CLUSTERS[g.nodes[target].cluster][0]); }
      runs.push(search);
    }
    this.searches = runs;
    touched.delete(CLUSTERS[hits[0]][0]);
    this.setState({ontoResult:{
      empty:false, query:q, mode:"fan",
      from: CLUSTERS[hits[0]][0],
      connected: Array.from(touched),
      found: runs.some(s => s.path.length > 0)
    }});
  }

  makeTargetedSearch(source, target, slot, hue){
    const g = this.graph, n = g.nodes.length;
    const dist = new Float64Array(n).fill(Infinity);
    const parent = new Int32Array(n).fill(-1), pEdge = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n), order = [];
    dist[source] = 0;
    const heap = [[0, source]];
    const push = (d, v) => { heap.push([d, v]); let i = heap.length - 1;
      while (i > 0){ const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break;
        const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop();
      if (heap.length){ heap[0] = last; let i = 0;
        for(;;){ const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break; const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m; } }
      return top; };
    while (heap.length){
      const [d, v] = pop();
      if (done[v]) continue;
      done[v] = 1;
      order.push({v, edge: pEdge[v]});
      if (v === target) break;
      for (const [w, cost, id] of g.adj[v]){
        const nd = d + cost;
        if (nd < dist[w]){ dist[w] = nd; parent[w] = v; pEdge[w] = id; push(nd, w); }
      }
    }
    const path = [];
    if (done[target]){ let v = target; while (v !== -1){ path.push(v); v = parent[v]; } path.reverse(); }
    return {slot, hue, source, target, order, path,
      reveal: 0, cursor: 0, speed: 0.14,
      phase: "sweep", pathReveal: 0, hold: 0, fade: 0,
      delay: 0, sparks: [], traces: []};
  }

  clearOntoQuery(){ this.setState({ontoQuery:"", ontoResult:null}); this.planSearch(); }

  /* The node closest to the origin — every inbound trace converges here. */
  centreNode(){
    if (this._centre !== undefined) return this._centre;
    const nodes = this.graph.nodes;
    let best = 0, bd = Infinity;
    const pool = this.graph.coreIds && this.graph.coreIds.length ? this.graph.coreIds : nodes.map((_, i) => i);
    for (const i of pool){
      const nd = nodes[i];
      const d = nd.x * nd.x + nd.y * nd.y + nd.z * nd.z;
      if (d < bd){ bd = d; best = i; }
    }
    return (this._centre = best);
  }
  /* A leaf out on the rim, biased to the far edge of the structure. */
  rimNode(){
    const nodes = this.graph.nodes;
    let best = 0, bd = -1;
    for (let k = 0; k < 40; k++){
      const i = Math.floor(Math.random() * nodes.length);
      const nd = nodes[i];
      if (nd.kind === "core") continue;
      const d = nd.x * nd.x + nd.y * nd.y + nd.z * nd.z;
      if (d > bd){ bd = d; best = i; }
    }
    return best;
  }
  makeSearch(slot){
    const g = this.graph, n = g.nodes.length, rnd = Math.random;
    // Fire inward: out on the rim, home to the nucleus.
    const source = this.rimNode();
    const target = this.centreNode();

    const dist = new Float64Array(n).fill(Infinity);
    const parent = new Int32Array(n).fill(-1), pEdge = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n), order = [];
    dist[source] = 0;
    const heap = [[0, source]];
    const push = (d, v) => { heap.push([d, v]); let i = heap.length - 1;
      while (i > 0){ const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break;
        const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop();
      if (heap.length){ heap[0] = last; let i = 0;
        for(;;){ const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break; const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m; } }
      return top; };
    while (heap.length){
      const [d, v] = pop();
      if (done[v]) continue;
      done[v] = 1;
      order.push({v, edge: pEdge[v]});
      if (v === target) break;
      for (const [w, cost, id] of g.adj[v]){
        const nd = d + cost;
        if (nd < dist[w]){ dist[w] = nd; parent[w] = v; pEdge[w] = id; push(nd, w); }
      }
    }
    const path = [];
    if (done[target]){ let v = target; while (v !== -1){ path.push(v); v = parent[v]; } path.reverse(); }

    return {slot, hue: this.QUERY_HUES()[slot % 6], source, target, order, path,
      reveal: 0, cursor: 0, speed: 0.34 + Math.random() * 0.16,
      phase: "sweep", pathReveal: 0, hold: 0, fade: 0,
      delay: 2400 + Math.random() * 2600, sparks: [], traces: []};
  }

  /* One throwaway Dijkstra to find a record a short hop-count away. */
  

  planSearch(){
    if (!this.graph) return;
    this.searches = [this.makeSearch(0)];
    this.clock = 0;
  }

  advance(dt){
    if (!this.searches) return;
    this.clock = (this.clock || 0) + dt;
    for (let i = 0; i < this.searches.length; i++){
      const s = this.searches[i];
      if (s.delay > 0){ s.delay -= dt; continue; }

      if (s.phase === "sweep"){
        s.reveal += dt * s.speed;
        // Each newly settled edge throws a spark that runs its length.
        while (s.cursor < Math.min(s.order.length, Math.floor(s.reveal))){
          const step = s.order[s.cursor++];
          if (step.edge >= 0){
            if ((s.cursor & 3) === 0 && s.sparks.length < 90)
              s.sparks.push({e: step.edge, t: 0, life: 420 + Math.random() * 300});
            if (s.traces.length < 700) s.traces.push({e: step.edge, age: 0});
          }
        }
        if (s.reveal >= s.order.length){ s.phase = "path"; s.pathReveal = 0; }
      } else if (s.phase === "path"){
        s.pathReveal += dt * 0.020;
        if (s.pathReveal >= s.path.length + 1){ s.phase = "hold"; s.hold = 0; }
      } else if (s.phase === "hold"){
        s.hold += dt;
        if (s.hold > 900 + s.slot * 260) s.phase = "fade";
      } else if (s.phase === "fade"){
        if (s.pinned){ s.fade = Math.min(1, s.fade + dt * 0.0016); continue; }
        s.fade += dt * 0.0016;
        if (s.fade >= 1) this.searches[i] = this.makeSearch(s.slot);
      }

      for (let k = s.sparks.length - 1; k >= 0; k--){
        const sp = s.sparks[k];
        sp.t += dt / sp.life;
        if (sp.t >= 1) s.sparks.splice(k, 1);
      }
      for (let k = s.traces.length - 1; k >= 0; k--){
        s.traces[k].age += dt;
        if (s.traces[k].age > 1000) s.traces.splice(k, 1);
      }
    }
  }

  // A cached radial sprite per colour. shadowBlur is the most expensive call
  // in a per-node loop; a pre-rendered gradient drawn with drawImage is free.
  glowSprite(hex, dark){
    const cache = this._sprites || (this._sprites = {});
    const key = hex + (dark === false ? "-l" : "-d");
    if (cache[key]) return cache[key];
    const S = 64, cv = document.createElement("canvas");
    cv.width = S; cv.height = S;
    const c = cv.getContext("2d");
    let rgb = hexRGB(hex);
    const gr = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    if (dark === false){
      // On paper the same light has to read as ink: darken the hue and drop the
      // white core, so a source-over stamp deepens the ground instead of washing it.
      rgb = [Math.round(rgb[0] * 0.52), Math.round(rgb[1] * 0.52), Math.round(rgb[2] * 0.52)];
      gr.addColorStop(0, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",.62)");
      gr.addColorStop(0.3, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",.3)");
      gr.addColorStop(1, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0)");
    } else {
      gr.addColorStop(0, "rgba(255,255,255,.95)");
      gr.addColorStop(0.18, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",.9)");
      gr.addColorStop(0.5, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",.26)");
      gr.addColorStop(1, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0)");
    }
    c.fillStyle = gr; c.fillRect(0, 0, S, S);
    cache[key] = cv;
    return cv;
  }
  // Low-res bloom bed: everything bright is stamped here, then scaled up
  // additively over the scene.
  bloomBuffer(w, h, dark, pageCtx){
    if (dark === false) return {light:true, ctx:pageCtx, k:1};
    const q = 0.3;
    const bw = Math.max(8, Math.round(w * q)), bh = Math.max(8, Math.round(h * q));
    const b = this._bloom || (this._bloom = {cv: document.createElement("canvas")});
    if (b.cv.width !== bw || b.cv.height !== bh){ b.cv.width = bw; b.cv.height = bh; }
    b.ctx = b.cv.getContext("2d");
    b.k = q;
    b.ctx.setTransform(1, 0, 0, 1, 0, 0);
    b.ctx.clearRect(0, 0, bw, bh);
    b.ctx.globalCompositeOperation = "lighter";
    return b;
  }
  stamp(b, sprite, x, y, r, alpha){
    if (alpha <= 0.012 || r <= 0) return;
    const c = b.ctx, d = r * 2 * b.k;
    if (b.light){
      const prev = c.globalCompositeOperation, pa = c.globalAlpha;
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = Math.min(1, alpha * 0.85);
      c.drawImage(sprite, x - r, y - r, r * 2, r * 2);
      c.globalCompositeOperation = prev; c.globalAlpha = pa;
      return;
    }
    c.globalAlpha = Math.min(1, alpha);
    c.drawImage(sprite, x * b.k - d / 2, y * b.k - d / 2, d, d);
  }

  drawGraph(){
    const cv = this.canvas, g = this.graph;
    if (!cv || !g || !this.searches) return;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const box = cv.getBoundingClientRect();
    if (!box.width || !box.height) return;
    if (cv.width !== Math.round(box.width * dpr) || cv.height !== Math.round(box.height * dpr)){
      cv.width = Math.round(box.width * dpr); cv.height = Math.round(box.height * dpr);
    }
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, box.width, box.height);

    const now = this.clock || 0;
    if (!this._css || now - this._cssAt > 600){
      const cs = getComputedStyle(cv);
      const dk = cs.getPropertyValue("--ink").trim() !== "#16181c";
      this._css = {dark:dk, pathInk: dk ? "#ffffff" : "#16181c",
        matchInk: cs.getPropertyValue("--accent").trim() || "#c8f04b"};
      this._cssAt = now;
    }
    const dark = this._css.dark, pathInk = this._css.pathInk, matchInk = this._css.matchInk;

    // Adaptive quality: a rolling frame cost sheds the expensive layers before
    // the frame rate drops rather than after.
    const tStart = performance.now();
    if (this._cost === undefined) this._cost = 8;
    const heavy = this._cost < 13, mid = this._cost < 22;
    const bloom = this.bloomBuffer(box.width, box.height, dark, ctx);

    /* ---- camera: slow yaw, fixed tilt, perspective projection ----
       Everything downstream reads from the cached projection, so nodes,
       edges, sparks and rings all share one depth model. */
    const bd = g.bounds;
    const cam = this.cam || (this.cam = {yaw:0, pitch:0.42, zoom:1, vy:0, vp:0, drag:false, spin:0});
    if (!cam.drag){
      cam.yaw += cam.vy; cam.pitch += cam.vp;
      cam.vy *= 0.94; cam.vp *= 0.94;
      if (Math.abs(cam.vy) < 0.0004) cam.spin += 0.00013;   // idle drift resumes
    }
    cam.pitch = Math.max(-1.35, Math.min(1.35, cam.pitch));
    const yaw = cam.yaw + cam.spin;
    const pitch = cam.pitch;
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
    const FOV = 1.62, R = bd.reach || bd.radius || 1;
    const pad = 30;
    const scale = cam.zoom * Math.min((box.width - pad * 2), (box.height - pad * 2)) / (R * 2.02);
    const cx = box.width / 2, cy = box.height / 2;

    const n = g.nodes.length;
    if (!this._px || this._px.length !== n){
      this._px = new Float32Array(n); this._py = new Float32Array(n);
      this._pd = new Float32Array(n); this._pz = new Float32Array(n);
    }
    const px = this._px, py = this._py, pd = this._pd, pz = this._pz;
    for (let i = 0; i < n; i++){
      const nd = g.nodes[i];
      const x0 = nd.x, y0 = nd.y, z0 = nd.z;
      const x1 = x0 * cosY + z0 * sinY;
      const z1 = z0 * cosY - x0 * sinY;
      const y2 = y0 * cosP - z1 * sinP;
      const z2 = z1 * cosP + y0 * sinP;
      const depth = FOV * R / (FOV * R + z2);      // >1 near, <1 far
      px[i] = cx + x1 * scale * depth;
      py[i] = cy + y2 * scale * depth;
      pd[i] = depth;
      pz[i] = z2;
    }
    // fog: 0 at the back of the cloud, 1 at the front
    const fog = (i) => {
      const t = (pz[i] + R) / (2 * R);
      return 0.16 + 0.84 * Math.max(0, Math.min(1, t));
    };

    // project any point in the same camera, for the sphere's guide circles
    const project = (x0, y0, z0) => {
      const x1 = x0 * cosY + z0 * sinY;
      const z1 = z0 * cosY - x0 * sinY;
      const y2 = y0 * cosP - z1 * sinP;
      const z2 = z1 * cosP + y0 * sinP;
      const depth = FOV * R / (FOV * R + z2);
      return [cx + x1 * scale * depth, cy + y2 * scale * depth, z2];
    };
    const greatCircle = (tiltX, tiltZ, rad, alphaFront) => {
      const STEPS = 96;
      for (let k = 0; k < STEPS; k++){
        const t0 = (k / STEPS) * 6.2832, t1 = ((k + 1) / STEPS) * 6.2832;
        const p = (t) => {
          const x = Math.cos(t) * rad, y = Math.sin(t) * rad * tiltX, z = Math.sin(t) * rad * tiltZ;
          return project(x, y, z);
        };
        const A = p(t0), B = p(t1);
        const front = ((A[2] + B[2]) / 2 + R) / (2 * R);
        ctx.strokeStyle = dark
          ? "rgba(190,232,255," + (alphaFront * (0.12 + front * 0.88)).toFixed(3) + ")"
          : "rgba(20,22,28," + (alphaFront * (0.12 + front * 0.88)).toFixed(3) + ")";
        ctx.lineWidth = 0.5 + front * 0.5;
        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      }
    };
    /* ---- volumetric cluster nebulae: each cluster's hub centroid carries a
       big additive bloom in its own hue, so the cloud reads as lit gas rather
       than flat dots. Depth drives both size and alpha. ---- */
    ctx.globalCompositeOperation = "lighter";
    for (let ci = 0; ci < CLUSTERS.length; ci++){
      const hubs = g.hubs.filter(h => g.nodes[h].cluster === ci);
      if (!hubs.length) continue;
      let sx = 0, sy = 0, sz = 0, sd = 0;
      for (const h of hubs){ sx += px[h]; sy += py[h]; sz += pz[h]; sd += pd[h]; }
      const mx = sx / hubs.length, my = sy / hubs.length;
      const depth = sd / hubs.length, front = ((sz / hubs.length) + R) / (2 * R);
      const rad = Math.max(30, R * scale * 0.22 * depth);
      const a = (dark ? 0.17 : 0.1) * (0.35 + front * 0.65);
      this.stamp(bloom, this.glowSprite(CLUSTERS[ci][1], dark), mx, my, rad, a);
    }
    ctx.globalCompositeOperation = "source-over";

    /* ---- starfield: a fixed dust shell outside the graph, projected in the
       same camera so orbiting the cloud parallaxes it. ---- */
    if (!this._dust){
      const rnd = mulberry(77712);
      const d = [];
      for (let i = 0; i < 220; i++){
        const u = rnd() * 2 - 1, th = rnd() * 6.2832, rr = R * (1.18 + rnd() * 0.55);
        const sq = Math.sqrt(1 - u * u);
        d.push([sq * Math.cos(th) * rr, u * rr, sq * Math.sin(th) * rr, 0.3 + rnd() * 0.7, rnd() * 6.28]);
      }
      this._dust = d;
    }
    ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
    const dustStep = heavy ? 1 : mid ? 2 : 3;
    let dustI = 0;
    for (const p of this._dust){
      if (dustI++ % dustStep) continue;
      const q = project(p[0], p[1], p[2]);
      const front = (q[2] + R * 1.8) / (R * 3.6);
      const tw = 0.55 + 0.45 * Math.sin(now / 900 + p[4]);
      const a = (dark ? 0.5 : 0.22) * p[3] * tw * (0.25 + front * 0.75);
      if (a <= 0.01) continue;
      ctx.fillStyle = dark ? "rgba(214,238,255," + a.toFixed(3) + ")" : "rgba(40,60,90," + a.toFixed(3) + ")";
      const rr = p[3] * (front > 0.55 ? 1.25 : 0.8);
      ctx.fillRect(q[0] - rr / 2, q[1] - rr / 2, rr, rr);
    }
    ctx.globalCompositeOperation = "source-over";

    greatCircle(0.06, 1, R * 0.40, 0.26);
    greatCircle(0.9, 0.42, R * 0.40, 0.17);
    greatCircle(0.06, 1, R * 0.95, 0.10);

    /* ---- resting field, drawn back to front in depth bands ----
       This is the most expensive layer (10.7k segments). The camera drifts a
       fraction of a degree per frame, so it renders into its own layer on
       alternate frames and is blitted on the others. */
    let edgeCtx = ctx, blitOnly = false;
    {
      const ew = Math.round(box.width * dpr), eh = Math.round(box.height * dpr);
      let L = this._edgeLayer;
      if (!L || L.cv.width !== ew || L.cv.height !== eh){
        const c2 = document.createElement("canvas");
        c2.width = ew; c2.height = eh;
        L = this._edgeLayer = {cv:c2, ctx:c2.getContext("2d"), frame:-1};
      }
      this._frameNo = (this._frameNo || 0) + 1;
      if (this._frameNo % 2 === 0 && L.frame >= 0) blitOnly = true;
      else {
        L.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        L.ctx.clearRect(0, 0, box.width, box.height);
        edgeCtx = L.ctx;
        L.frame = this._frameNo;
      }
    }
    const BANDS = 7;
    if (!this._bands){
      this._bands = [];
      for (let b = 0; b < BANDS; b++) this._bands.push(new Int32Array(g.edges.length));
      this._bandN = new Int32Array(BANDS);
    }
    const bands = this._bands, bandN = this._bandN;
    for (let b = 0; b < BANDS; b++) bandN[b] = 0;
    const W = box.width, H = box.height, MARGIN = 80;
    for (let e = 0; !blitOnly && e < g.edges.length; e++){
      const ed = g.edges[e];
      const ax = px[ed.a], ay = py[ed.a], bx = px[ed.b], by = py[ed.b];
      // cheap screen-space cull: skip anything wholly outside the viewport
      if ((ax < -MARGIN && bx < -MARGIN) || (ax > W + MARGIN && bx > W + MARGIN)
       || (ay < -MARGIN && by < -MARGIN) || (ay > H + MARGIN && by > H + MARGIN)) continue;
      const t = ((pz[ed.a] + pz[ed.b]) / 2 + R) / (2 * R);
      const bi = Math.max(0, Math.min(BANDS - 1, Math.floor(t * BANDS)));
      bands[bi][bandN[bi]++] = e;
    }
    for (let b = 0; b < BANDS; b++){
      const t = (b + 0.5) / BANDS;
      const c = CLUSTERS[b % CLUSTERS.length][1];
      const cc = hexRGB(c);
      // a faint cluster-hue wash mixed into the resting field, instead of flat grey
      const mixT = 0.26 + t * 0.16;
      const rr = Math.round(cc[0] * mixT + (dark ? 150 : 20) * (1 - mixT));
      const gg = Math.round(cc[1] * mixT + (dark ? 164 : 22) * (1 - mixT));
      const bb = Math.round(cc[2] * mixT + (dark ? 176 : 28) * (1 - mixT));
      if (blitOnly) break;
      edgeCtx.strokeStyle = "rgba(" + rr + "," + gg + "," + bb + "," + (dark ? (0.045 + t * 0.17) : (0.03 + t * 0.14)).toFixed(3) + ")";
      edgeCtx.lineWidth = 0.3 + t * 0.5;
      const arr = bands[b], cnt = bandN[b];
      if (!cnt) continue;
      edgeCtx.beginPath();
      for (let k = 0; k < cnt; k++){
        const ed = g.edges[arr[k]];
        edgeCtx.moveTo(px[ed.a], py[ed.a]); edgeCtx.lineTo(px[ed.b], py[ed.b]);
      }
      edgeCtx.stroke();
    }
    if (this._edgeLayer){
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this._edgeLayer.cv, 0, 0);
      ctx.restore();
    }

    // node order: far first, so near nodes occlude
    // Bucketed depth order: O(n) per frame instead of an n log n sort.
    const OB = 24;
    if (!this._buckets){
      this._buckets = [];
      for (let b = 0; b < OB; b++) this._buckets.push([]);
      this._order = new Array(n);
    }
    const bk = this._buckets;
    for (let b = 0; b < OB; b++) bk[b].length = 0;
    for (let i = 0; i < n; i++){
      const t = (pz[i] + R) / (2 * R);
      bk[Math.max(0, Math.min(OB - 1, OB - 1 - Math.floor(t * OB)))].push(i);
    }
    const order = this._order;
    let oi = 0;
    for (let b = 0; b < OB; b++){ const arr = bk[b]; for (let k = 0; k < arr.length; k++) order[oi++] = arr[k]; }
    if (order.length !== oi) order.length = oi;

    /* Nodes are filled in batches rather than one draw call each: within a depth
       bucket the fog value barely varies, so every node of a cluster can share
       one colour and one path. ~5,400 style changes per frame become ~200. */
    if (!this._colCache) this._colCache = {};
    const colCache = this._colCache;
    const nodeColour = (cluster, fwQ) => {
      const key = cluster + "|" + fwQ + "|" + (dark ? 1 : 0);
      let v = colCache[key];
      if (v) return v;
      const fw = fwQ / 16;
      if (cluster < 0){
        v = dark ? "rgba(198,233,255," + (fw * 0.74).toFixed(3) + ")"
                 : "rgba(24,48,90," + (fw * 0.56).toFixed(3) + ")";
      } else {
        const c = hexRGB(CLUSTERS[cluster][1]);
        const mix = Math.max(0, (fw - 0.62) / 0.38);
        v = dark
          ? "rgba(" + Math.round(c[0] + (255 - c[0]) * mix * 0.55) + ","
            + Math.round(c[1] + (255 - c[1]) * mix * 0.55) + ","
            + Math.round(c[2] + (255 - c[2]) * mix * 0.55) + "," + (fw * 0.78).toFixed(3) + ")"
          : "rgba(" + Math.round(c[0] * 0.7) + "," + Math.round(c[1] * 0.7) + ","
            + Math.round(c[2] * 0.7) + "," + (fw * 0.6).toFixed(3) + ")";
      }
      colCache[key] = v;
      return v;
    };
    const zoomK = 0.72 + cam.zoom * 0.28;
    const speculars = [];
    if (!this._batch) this._batch = new Map();
    const batch = this._batch;
    for (let b = 0; b < OB; b++){
      const arr = bk[b];
      if (!arr.length) continue;
      batch.clear();
      for (let k = 0; k < arr.length; k++){
        const i = arr[k];
        const nd = g.nodes[i];
        if (nd.kind === "hub" || nd.kind === "sub") continue;
        const x = px[i], y = py[i];
        if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue;
        const fw = fog(i);
        if (fw < 0.02) continue;
        const key = (nd.kind === "core" ? -1 : nd.cluster) * 32 + Math.round(fw * 16);
        let list = batch.get(key);
        if (!list){ list = []; batch.set(key, list); }
        list.push(i);
        if (fw > 0.92 && nd.r > 3) speculars.push(i);
      }
      batch.forEach((list, key) => {
        const fwQ = ((key % 32) + 32) % 32;
        const cluster = Math.round((key - fwQ) / 32);
        ctx.fillStyle = nodeColour(cluster, fwQ);
        ctx.beginPath();
        for (let k = 0; k < list.length; k++){
          const i = list[k];
          const r = Math.max(0.3, g.nodes[i].r * 0.56 * Math.pow(pd[i], 1.55) * zoomK);
          if (r < 1.1) ctx.rect(px[i] - r, py[i] - r, r * 2, r * 2);
          else { ctx.moveTo(px[i] + r, py[i]); ctx.arc(px[i], py[i], r, 0, 6.2832); }
        }
        ctx.fill();
      });
    }
    // the nearest nodes catch a specular cap, drawn once as a group
    if (speculars.length){
      ctx.fillStyle = dark ? "rgba(255,255,255,.26)" : "rgba(255,255,255,.7)";
      ctx.beginPath();
      for (const i of speculars){
        const r = Math.max(0.3, g.nodes[i].r * 0.56 * Math.pow(pd[i], 1.55) * zoomK);
        ctx.moveTo(px[i] - r * 0.28 + r * 0.42, py[i] - r * 0.3);
        ctx.arc(px[i] - r * 0.28, py[i] - r * 0.3, r * 0.42, 0, 6.2832);
      }
      ctx.fill();
    }

    ctx.lineCap = "round";
    for (const s of this.searches){
      if (s.delay > 0) continue;
      const alive = 1 - s.fade;

      for (const tr of s.traces){
        const e = g.edges[tr.e];
        const fw = (fog(e.a) + fog(e.b)) / 2;
        ctx.globalAlpha = alive * fw * Math.max(0, 0.20 * (1 - tr.age / 1500));
        ctx.strokeStyle = s.hue; ctx.lineWidth = 0.5 + fw * 0.5;
        ctx.beginPath(); ctx.moveTo(px[e.a], py[e.a]); ctx.lineTo(px[e.b], py[e.b]); ctx.stroke();
      }

      ctx.shadowColor = s.hue;
      for (const sp of s.sparks){
        const e = g.edges[sp.e];
        const fw = (fog(e.a) + fog(e.b)) / 2;
        const dep = (pd[e.a] + pd[e.b]) / 2;
        const ease = sp.t < 0.5 ? 2 * sp.t * sp.t : 1 - Math.pow(-2 * sp.t + 2, 2) / 2;
        const tail = Math.max(0, ease - 0.46);
        const ax = px[e.a], ay = py[e.a], bx = px[e.b], by = py[e.b];
        const hx = ax + (bx - ax) * ease, hy = ay + (by - ay) * ease;
        const tx = ax + (bx - ax) * tail, ty = ay + (by - ay) * tail;
        const fadeIn = Math.min(1, sp.t * 6), fadeOut = 1 - Math.max(0, (sp.t - 0.7) / 0.3);
        const vis = alive * Math.min(fadeIn, fadeOut) * fw;
        ctx.globalAlpha = vis * 0.95;
        ctx.strokeStyle = s.hue; ctx.lineWidth = (0.9 + fw * 1.1) * dep; ctx.shadowBlur = 9 * dep;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.globalAlpha = vis;
        ctx.fillStyle = dark ? "#ffffff" : s.hue; ctx.shadowBlur = 12 * dep;
        ctx.beginPath(); ctx.arc(hx, hy, 1.4 * dep, 0, 6.2832); ctx.fill();
      }
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;

      if (s.phase !== "sweep"){
        const lit = Math.min(s.path.length, Math.floor(s.pathReveal));
        for (let i = 1; i < lit; i++){
          const a = s.path[i - 1], b = s.path[i];
          const fw = (fog(a) + fog(b)) / 2, dep = (pd[a] + pd[b]) / 2;
          ctx.strokeStyle = pathInk;
          ctx.globalAlpha = alive * fw * (dark ? 0.9 : 1);
          ctx.lineWidth = (dark ? 1.5 : 2.0) * dep;
          ctx.shadowColor = s.hue; ctx.shadowBlur = 11 * dep;
          ctx.beginPath(); ctx.moveTo(px[a], py[a]); ctx.lineTo(px[b], py[b]); ctx.stroke();
        }
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        if (lit > 0 && lit < s.path.length){
          const h = s.path[lit - 1];
          ctx.fillStyle = pathInk; ctx.shadowColor = s.hue; ctx.shadowBlur = 16;
          ctx.globalAlpha = alive * fog(h);
          ctx.beginPath(); ctx.arc(px[h], py[h], 2.6 * pd[h], 0, 6.2832); ctx.fill();
          ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        }
      }

      const ring = (idx, col, r) => {
        ctx.globalAlpha = alive * 0.9 * fog(idx);
        ctx.strokeStyle = col; ctx.lineWidth = 1.2 * pd[idx];
        ctx.shadowColor = col; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(px[idx], py[idx], r * pd[idx], 0, 6.2832); ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      };
      ring(s.source, s.hue, 7 + Math.sin((this.clock + s.slot * 400) / 240) * 1.5);
      if (s.phase !== "sweep") ring(s.target, matchInk, 8.5);
    }

    /* ---- scan plane: a slow sweep through the volume that ignites what it
       passes, so the cloud reads as something being read ---- */
    const scanZ = Math.sin(now / 5200) * R * 0.95;

    /* ---- hubs and sub-hubs as lit spheres, far to near ---- */
    for (const i of order){
      const nd = g.nodes[i];
      if (nd.kind === "leaf" || nd.kind === "core") continue;
      const col = CLUSTERS[nd.cluster][1];
      const fw = fog(i), dep = pd[i];
      const r = Math.max(0.85, nd.r * (nd.kind === "hub" ? 0.42 : 0.37) * Math.pow(dep, 1.4));
      if (nd.kind === "hub"){
        // Only the nearest hubs carry any halo at all, and it is a soft
        // brightening of the surrounding field rather than a lamp.
        if (fw > 0.82) this.stamp(bloom, this.glowSprite(col, dark), px[i], py[i], r * 2.4, (fw - 0.82) * 0.28);
        const flash = Math.max(0, 1 - Math.abs(pz[i] - scanZ) / (R * 0.08));
        if (flash > 0.02) this.stamp(bloom, this.glowSprite(col, dark), px[i], py[i], r * 3.2, flash * 0.1);
        ctx.globalAlpha = 0.45 + fw * 0.45;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(px[i], py[i], r, 0, 6.2832); ctx.fill();
        if (fw > 0.86){
          ctx.globalAlpha = (fw - 0.86) * 2;
          ctx.fillStyle = "rgba(255,255,255,.4)";
          ctx.beginPath(); ctx.arc(px[i] - r * 0.26, py[i] - r * 0.28, r * 0.38, 0, 6.2832); ctx.fill();
        }
      } else {
        ctx.globalAlpha = fw * 0.5;
        ctx.fillStyle = dark ? "rgba(226,242,255,.36)" : "rgba(20,22,28,.3)";
        ctx.beginPath(); ctx.arc(px[i], py[i], r, 0, 6.2832); ctx.fill();
      }
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;

    /* ---- leader-line labels on the front hub of each cluster ---- */
    ctx.globalCompositeOperation = "source-over";
    ctx.font = "500 10px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.textBaseline = "middle";
    for (let ci = 0; ci < CLUSTERS.length; ci++){
      const hubs = g.hubs.filter(h => g.nodes[h].cluster === ci);
      if (!hubs.length) continue;
      let i = hubs[0];
      for (const h of hubs) if (pz[h] > pz[i]) i = h;
      const f = fog(i);
      if (f < 0.66) continue;
      const col = CLUSTERS[ci][1], a = Math.min(1, (f - 0.66) / 0.26);
      const right = px[i] < cx;
      const lx = px[i] + (right ? 15 : -15), ly = py[i] - 13;
      ctx.globalAlpha = a * 0.45;
      ctx.strokeStyle = col; ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(px[i], py[i]); ctx.lineTo(lx, ly); ctx.lineTo(lx + (right ? 24 : -24), ly);
      ctx.stroke();
      ctx.globalAlpha = a * 0.92;
      ctx.textAlign = right ? "left" : "right";
      ctx.fillStyle = dark ? "rgba(238,247,255,.94)" : "rgba(20,22,28,.92)";
      ctx.fillText(this.phClusterLabel(ci), lx + (right ? 29 : -29), ly);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";

    // the bloom bed, scaled back over the scene (dark themes only — on paper the
    // stamps already landed source-over)
    if (!bloom.light){
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.34;
      ctx.drawImage(bloom.cv, 0, 0, box.width, box.height);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    this._cost = this._cost * 0.88 + (performance.now() - tStart) * 0.12;

    // vignette: pulls the eye to the centre of the cloud the way a long lens would
    const vig = ctx.createRadialGradient(cx, cy, Math.min(box.width, box.height) * 0.28,
                                         cx, cy, Math.max(box.width, box.height) * 0.78);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, dark ? "rgba(0,0,0,.5)" : "rgba(24,28,34,.16)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, box.width, box.height);
  }

  /* Orbit and zoom. Pointer state lives on the instance, not in React state,
     so dragging never triggers a re-render. */
  bindGraphInput(cv){
    if (cv._pulseBound) return;
    cv._pulseBound = true;
    const cam = this.cam || (this.cam = {yaw:0, pitch:0.42, zoom:1, vy:0, vp:0, drag:false, spin:0});
    let lx = 0, ly = 0, id = null;
    cv.style.cursor = "grab";
    cv.style.touchAction = "none";
    cv.addEventListener("pointerdown", (e) => {
      id = e.pointerId; cam.drag = true; lx = e.clientX; ly = e.clientY;
      cam.vy = 0; cam.vp = 0;
      cv.style.cursor = "grabbing";
      try { cv.setPointerCapture(id); } catch (err) {}
    });
    cv.addEventListener("pointermove", (e) => {
      if (!cam.drag || e.pointerId !== id) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      cam.yaw += dx * 0.006;
      cam.pitch += dy * 0.006;
      cam.vy = dx * 0.0016; cam.vp = dy * 0.0016;
    });
    const release = (e) => {
      if (id !== null && e && e.pointerId !== id) return;
      cam.drag = false; id = null; cv.style.cursor = "grab";
    };
    cv.addEventListener("pointerup", release);
    cv.addEventListener("pointercancel", release);
    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      const k = Math.pow(0.9988, e.deltaY);
      cam.zoom = Math.max(0.45, Math.min(6, cam.zoom * k));
    }, {passive:false});
    cv.addEventListener("dblclick", () => {
      cam.yaw = 0; cam.pitch = 0.42; cam.zoom = 1; cam.vy = 0; cam.vp = 0; cam.spin = 0;
    });
  }

  refreshStats(){
    if (!this.searches) return;
    const now = Math.floor((this.clock || 0) / 1000);
    if (now === this._lastStat) return;
    this._lastStat = now;
    try { this.setState({gTick: now}); } catch (e) {}
  }

  // Split-flap board. Each tile keeps the character it last showed, so a change
  // (the minute rolling over, or the boot scramble settling) drops the old
  // character down and swings the new one up. Results are cached per stamp so
  // repeat renders inside one tick don't cancel a flip mid-air.
  buildFlipUnits(BODY, INK, LIME){
    const dp = phToDublin(phStore.getState().clock.nowUtc);
    const DAY = ["SUN","MON","TUE","WED","THU","FRI","SAT"][dp.dow];
    const MON = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][dp.m - 1];
    const target = (DAY + String(dp.d).padStart(2,"0") + MON
      + String(dp.h).padStart(2,"0") + String(dp.mi).padStart(2,"0")).split("");
    if (!this._flapMount) this._flapMount = Date.now();
    const el = Date.now() - this._flapMount;
    const settleAt = i => 200 + i * 75 + 200;
    const scrambling = el < settleAt(target.length - 1);
    const stamp = scrambling ? "s" + Math.floor(el / 75) : target.join("");
    if (this._flapStamp === stamp && this._flapCache) return this._flapCache;
    this._flapStamp = stamp;
    const NUM = "0123456789", ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const prev = this._flapPrev || (this._flapPrev = []);
    const seq = this._flapSeq || (this._flapSeq = []);
    const faces = target.map((c, i) => {
      if (scrambling && el < settleAt(i)) {
        const pool = /[0-9]/.test(c) ? NUM : ALPHA;
        return pool[Math.floor(Math.random() * pool.length)];
      }
      return c;
    }).map((v, i) => {
      const p = prev[i];
      const changed = p !== undefined && p !== v;
      if (changed) seq[i] = (seq[i] || 0) + 1;
      prev[i] = v;
      const k = (seq[i] || 0) % 2 ? "B" : "A";
      return {isTile:true, isColon:false, v, prev: changed ? p : v,
        flapShow: changed ? "block" : "none",
        topAnim: changed ? "flapDown" + k + " .16s cubic-bezier(.5,.05,.9,.4) both" : "none",
        botAnim: changed ? "flapUp" + k + " .24s cubic-bezier(.2,.85,.3,1) .16s both" : "none"};
    });
    const base = {w:"21px", h:"30px", size:"13px", cornerW:"17px", cornerSize:"11px", color:BODY};
    const big = {w:"22px", h:"31px", size:"14px", cornerW:"18px", cornerSize:"12px", color:INK};
    const time = {w:"22px", h:"31px", size:"14px", cornerW:"18px", cornerSize:"12px", color:LIME};
    const mk = (i, opts) => Object.assign({}, base, faces[i], opts || {});
    const out = [
      {tiles:[mk(0), mk(1), mk(2)]},
      {tiles:[mk(3, big), mk(4, big)]},
      {tiles:[mk(5), mk(6), mk(7)]},
      {tiles:[mk(8, time), mk(9, time), {isTile:false, isColon:true}, mk(10, time), mk(11, time)]}
    ];
    this._flapCache = out;
    return out;
  }

  /* The brief is a two-question interview: you say the job, it asks what to
     cover and when it should land, then turns the answers into tasks. */
  sendBrief(){
    const text = (this.state.briefDraft || "").trim();
    if (!text) return;
    this.setState(prev => {
      const thread = (prev.briefThread || []).slice();
      const asked = thread.filter(m => m.kind === "card").length;
      if (!thread.length) thread.push({kind:"msg", role:"agent", text:"Good to meet you. What is the main thing you want help with?"});
      thread.push({kind:"msg", role:"you", text});
      if (asked < BRIEF_QUESTIONS.length){
        thread.push({kind:"msg", role:"agent",
          text: asked === 0
            ? "\u201c" + text + "\u201d — I can do that. First, what should it cover?"
            : "Noted. One more: when should it land?"});
        thread.push({kind:"card", q:asked, done:false});
      } else {
        thread.push({kind:"msg", role:"agent", text:"Added. Train me and I will write my own prompt from the records you granted."});
      }
      return {briefThread:thread, briefDraft:""};
    });
  }
  pickBrief(qi, label){
    this.setState(prev => {
      const picks = Object.assign({}, prev.briefPicks || {});
      const list = (picks[qi] || []).slice();
      const at = list.indexOf(label);
      if (at > -1) list.splice(at, 1); else list.push(label);
      picks[qi] = list;
      return {briefPicks:picks};
    });
  }
  confirmBrief(qi){
    this.setState(prev => {
      const picks = (prev.briefPicks || {})[qi] || [];
      const thread = prev.briefThread.map(m => m.kind === "card" && m.q === qi ? Object.assign({}, m, {done:true}) : m);
      const spec = Object.assign({}, prev.agentSpec);
      const tasks = (spec.tasks || []).slice();
      if (qi === 0 && picks.length) tasks.push({title:"Daily briefing", meta:"Covers " + picks.join(", ").toLowerCase()});
      if (qi === 1 && picks.length){
        if (tasks.length) tasks[tasks.length - 1] = Object.assign({}, tasks[tasks.length - 1], {meta: tasks[tasks.length - 1].meta + " · " + picks[0].toLowerCase()});
        else tasks.push({title:"Scheduled run", meta:picks[0].toLowerCase()});
      }
      spec.tasks = tasks;
      if (qi + 1 < BRIEF_QUESTIONS.length){
        thread.push({kind:"msg", role:"agent", text:"Got it. When should it land?"});
        thread.push({kind:"card", q:qi + 1, done:false});
      } else {
        thread.push({kind:"msg", role:"agent", text:"That is enough to work from. Train me and I will write my own prompt from the records you granted."});
      }
      return {briefThread:thread, agentSpec:spec};
    });
  }
  /* Tuning by prompt: the change is described in words and lands on the pinned
     prompt, so the agent's behaviour and its prompt never drift apart. */
  /* KPI figures count in from zero whenever the filter changes, so a switch
     between aspects reads as the numbers moving rather than swapping. */
  
  goPage(page, extra){
    this.setState(Object.assign({page}, extra || {}));
    if (page === "Dashboard") this.startKpiCount();
  }
  /* A timer, not rAF: background/hidden frames throttle rAF to nothing and the
     count would freeze part-way through. */
  /* Shared by the picker, drag-and-drop and paste — the file dialog can be
     blocked in an embedded frame, so there is always another way in. */
  readBgFile(f){
    if (!f || !/^image\//.test(f.type || "")) return;
    const fr = new FileReader();
    fr.onload = () => this.setState(p => {
      const list = (p.bgUploads || []).concat([fr.result]);
      return {bgUploads:list, bgCat:"Your photos", bgGalleryOpen:true,
        homeBg:"up" + (list.length - 1),
        homeBgCss:"background:url(" + fr.result + ") center/cover"};
    });
    fr.readAsDataURL(f);
  }
  startKpiCount(){
    clearInterval(this._kpiTimer);
    const t0 = Date.now();
    this.setState({kpiT:0});
    this._kpiTimer = setInterval(() => {
      const t = Math.min(1, (Date.now() - t0) / 900);
      this.setState({kpiT:t});
      if (t >= 1) clearInterval(this._kpiTimer);
    }, 40);
  }
  systemPrompt(st){
    const s = st || this.state;
    if (s.sysPrompt !== undefined && s.sysPrompt !== null) return s.sysPrompt;
    return "You are " + (s.agentSpec.name || "this agent") + " inside Pulse for Precision Health.\n"
      + "Voice: " + s.agentSpec.personality.toLowerCase() + ". " + s.agentSpec.answer.toLowerCase() + ".\n"
      + "You read the shared store through registered tools only, filtered by the role of whoever is asking.\n"
      + "This client says participant, programme and episode. Money is in euro and times are Europe/Dublin.\n"
      + "Never act on anything with an effect. Propose it and wait for a human yes. Demo content, no model connected.";
  }
  sendTune(){
    const text = (this.state.tuneDraft || "").trim();
    if (!text) return;
    this.setState(prev => ({
      tuneDraft:"",
      tuneThread: (prev.tuneThread || []).concat([
        {role:"you", text},
        {role:"agent", text:"Done — I pinned that to my prompt. It takes effect on the next run."}
      ]),
      sysPrompt: this.systemPrompt(prev) + "\n" + text
    }));
  }

  startTraining(){
    clearInterval(this._trainTimer);
    this.setState({training:true, trained:false, trainPhase:0});
    this._trainTimer = setInterval(() => {
      this.setState(prev => {
        const next = (prev.trainPhase || 0) + 1;
        if (next >= TRAIN_PHASES.length){
          clearInterval(this._trainTimer);
          return {trainPhase:TRAIN_PHASES.length, training:false, trained:true};
        }
        return {trainPhase:next};
      });
    }, 1150);
  }

  openPalette(){
    this._palOpenedAt = Date.now();
    this.setState({paletteOpen:true, showNotifs:false, query:"", palSel:0, palScope:"All"});
  }

  componentDidMount(){
    requestAnimationFrame(() => this.syncRailThumb());
    setTimeout(() => this.syncRailThumb(), 700);
    setTimeout(() => { const nav = document.querySelector('nav[data-rail-nav]');
      if (nav && window.ResizeObserver){ this._railRO = new ResizeObserver(() => this.syncRailThumb()); this._railRO.observe(nav); } }, 50);
    this.seedActivity();
    if (this.state.page === "Dashboard") this.startKpiCount();
    this._actTimer = setInterval(() => { if (this.state.page === "Activity") this.tickActivity(); }, 700);
    this._flapBoot = setInterval(() => this.forceUpdate(), 70);
    setTimeout(() => clearInterval(this._flapBoot), 1500);
    // One frame driver, fed by rAF where it runs and by a timer where it does not
    // Warm the graph up in idle time: by the time the Ontology tab is opened the
    // nodes, edges and adjacency already exist, so the first frame paints.
    const warm = () => { if (!this.graph){ this.graph = buildGraph(); this.planSearch(); } };
    if (typeof requestIdleCallback === "function") requestIdleCallback(warm, {timeout:2500});
    else this._warmTimer = setTimeout(warm, 1200);

    // (throttled or hidden frames), so the graph is never left unpainted.
    let last = performance.now();
    this._frame = () => this.graphFrame();
    const loop = () => {
      const onGraph = this.state.page === "Records" && this.state.recSection === "ontology";
      if (onGraph){ this._raf = requestAnimationFrame(loop); this._frame(); }
      else { this._raf = null; this.canvas = null; }
    };
    this._startLoop = (force) => {
      if (force) { cancelAnimationFrame(this._raf); this._raf = null; }
      if (!this._raf) this._raf = requestAnimationFrame(loop);
    };
    // A watchdog, not just a poll: a stale _raf handle from a previous mount
    // used to leave the loop permanently unscheduled, so restart when the
    // ontology is open and no frame has landed for a while.
    this._fallback = setInterval(() => {
      if (this.state.page !== "Records" || this.state.recSection !== "ontology") return;
      const stale = !this._beat || performance.now() - this._beat > 600;
      this._startLoop(stale);
    }, 250);
    this._startLoop(true);
    // Precision Health: stay in step with the shared store, and make every screen linkable.
    this._phUnsub = phStore.subscribe(() => this.forceUpdate());
    this._hash = () => { if (!applyHash(this, window.location.hash)) this.phSyncHash(true); };
    window.addEventListener("hashchange", this._hash);
    window.addEventListener("popstate", this._hash);
    this._hash();
    // Tablet widths give the nav room by collapsing the rail once, as the window crosses below 1100px.
    this._resize = () => this.setState(prev => {
      const w = window.innerWidth;
      return prev.railOpen && w < 1100 && prev.w >= 1100 ? {w, railOpen:false} : {w};
    });
    window.addEventListener("resize", this._resize);
    this._key = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k"){
        e.preventDefault();
        if (this.state.paletteOpen) this.setState({paletteOpen:false, query:"", palSel:0}); else this.openPalette();
      }
      if (e.key === "Escape") this.setState({paletteOpen:false, showNotifs:false});
    };
    window.addEventListener("keydown", this._key);
    this._paste = (e) => {
      if (!this.state.bgGalleryOpen) return;
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for (let i = 0; i < items.length; i++){
        if (items[i].type && items[i].type.indexOf("image") === 0){ this.readBgFile(items[i].getAsFile()); break; }
      }
    };
    window.addEventListener("paste", this._paste);
  }
  componentWillUnmount(){ if (this._phUnsub) this._phUnsub(); window.removeEventListener("hashchange", this._hash); window.removeEventListener("popstate", this._hash); window.removeEventListener("paste", this._paste); window.removeEventListener("resize", this._resize); window.removeEventListener("keydown", this._key); clearInterval(this._t); clearInterval(this._clockTimer); clearInterval(this._flapBoot); cancelAnimationFrame(this._raf); clearInterval(this._fallback); clearInterval(this._actTimer); clearInterval(this._kpiTimer); }

  ask(q){
    // The reply is evaluated from the shared store at render time, so numbers stay current after any action.
    const thread = this.state.thread.concat([{role:"user", text:q}, {role:"helios", q}]);
    this.setState(prev => ({thread, draft:"", query:"", paletteOpen:false, page:"Home", open:null,
      palRecent:[q].concat((prev.palRecent || []).filter(x => x !== q)).slice(0, 4)}));
    this.phSyncHash(true);
  }

  hover(key, label, hint, e){
    const r = e && e.currentTarget ? e.currentTarget.getBoundingClientRect() : null;
    this.setState(prev => ({hovered:key, hoverLabel:label, hoverHint:hint,
      hoverTop: r ? Math.round(r.top + r.height / 2) : prev.hoverTop}));
  }
  unhover(key){ this.setState(prev => (prev.hovered === key ? {hovered:null} : null)); }

  syncRailThumb(){
    const nav = document.querySelector('nav[data-rail-nav]');
    const btn = nav && nav.querySelector('[data-rail="active"]');
    const prev = this.state.railThumb;
    if (!btn){ if (prev) this.setState({railThumb:null}); return; }
    const n = nav.getBoundingClientRect(), b = btn.getBoundingClientRect();
    const next = {t: Math.round(b.top - n.top + nav.scrollTop), l: Math.round(b.left - n.left), w: Math.round(b.width), h: Math.round(b.height)};
    if (!prev || prev.t !== next.t || prev.l !== next.l || prev.w !== next.w || prev.h !== next.h){
      this.setState({railThumb: next});
      if (!this._railLive){ this._railLive = true; setTimeout(() => this.setState({railThumbLive:true}), 60); }
    }
  }
  componentDidUpdate(){ this.syncRailThumb(); this.phSyncHash(); }

  go(page){ this.phGo({page}); }

  /* ---- Precision Health navigation: page, tab and deep-link params ---- */
  tabFor(page){
    const st = this.state;
    if (page === "Records") return st.recSection || defaultTab("Records");
    return (st.phTab && st.phTab[page]) || defaultTab(page);
  }
  phGo(t){ this.phApply(t, true); }
  phApply(t, push){
    const page = t.page, tab = t.tab || defaultTab(page);
    const order = NAV.filter(n => !n.divider).map(n => n.page).concat(["Settings"]);
    const from = order.indexOf(this.state.page), to = order.indexOf(page);
    this.setState(prev => {
      const patch = {page, open:null, showNotifs:false, filterMenuOpen:false, paletteOpen:false, phParams: t.params || {}};
      if (from > -1 && to > -1 && from !== to){ patch.navDir = to > from ? 1 : -1; patch.navSeq = (prev.navSeq || 0) + 1; }
      if (page === "Records") patch.recSection = tab; else patch.phTab = Object.assign({}, prev.phTab, {[page]: tab});
      if (page === "Agents" && t.params && t.params.agent) patch.agentId = t.params.agent;
      if (t.params && t.params.portal === "1" && !prev.portalOpen) patch.portalOpen = true;
      return patch;
    });
    if (t.params && t.params.portal === "1") this.openPortal(t.params.person);
    if (push && typeof window !== "undefined"){
      try { window.history.pushState(null, "", hashFor({page, tab, params: t.params})); } catch (e) { /* history can be blocked in frames */ }
    }
    requestAnimationFrame(() => { const el = document.querySelector("[data-scroll-main]"); if (el) el.scrollTop = 0; });
  }
  phSetTab(tab){ this.phGo({page: this.state.page, tab}); }
  phSetParams(p){
    this.setState({phParams: p || {}});
    try { window.history.replaceState(null, "", hashFor({page: this.state.page, tab: this.tabFor(this.state.page), params: p})); } catch (e) { /* ignore */ }
  }
  phSyncHash(force){
    if (typeof window === "undefined") return;
    const st = this.state;
    const params = Object.assign({}, st.phParams || {});
    if (st.portalOpen) params.portal = "1"; else delete params.portal;
    const h = hashFor({page: st.page, tab: this.tabFor(st.page), params});
    if (window.location.hash !== h && (force || this._hashReady)){
      try { window.history.replaceState(null, "", h); } catch (e) { /* ignore */ }
    }
    this._hashReady = true;
  }
  phNavObject(){
    const st = this.state, page = st.page;
    return {
      page, tab: this.tabFor(page), params: st.phParams || {},
      go: (t) => this.phGo(t),
      setTab: (tab) => this.phSetTab(tab),
      setParams: (p) => this.phSetParams(p),
      openPortal: (personId) => this.openPortal(personId),
      shell: {
        theme: st.theme,
        setTheme: (id) => this.setState(p => (id === "light" ? {theme:"light", darkTheme:p.theme === "light" ? p.darkTheme : p.theme} : {theme:id, darkTheme:id})),
        themes: THEMES.map(t => ({id:t.id, label:t.label, group:t.group, accent:t.accent})),
        density: st.density || "comfortable",
        setDensity: (d) => this.setState({density:d}),
        reduceMotion: !!st.reduceMotion,
        setReduceMotion: (on) => this.setState({reduceMotion:!!on}),
        openBackgrounds: () => this.setState({bgGalleryOpen:true, bgSpot:null})
      }
    };
  }
  /* The participant portal is a separate preview. While it is open the demo acts as the participant. */
  openPortal(personId){
    if (this.state.portalOpen && !personId) return;
    const cur = phStore.getState().session.personaId;
    if (cur !== "participant") this._prevPersona = cur;
    if (personId) phDispatch(phAct.setPortalPerson(personId), {silent:true});
    phDispatch(phAct.setPersona("participant"), {silent:true});
    this.setState({portalOpen:true, paletteOpen:false, showNotifs:false});
  }
  closePortal(){
    phDispatch(phAct.setPersona(this._prevPersona || "neil"), {silent:true});
    this.setState({portalOpen:false});
  }
  /* Clinical clusters (Episodes, Results, Reports, Follow-up) are hidden from roles without clinical access. */
  phClinicalCluster(i){
    if ([4, 5, 6, 7].indexOf(i) < 0) return false;
    try { return !phStore.getState().session || !this._phCanClinical(); } catch (e) { return true; }
  }
  _phCanClinical(){
    const s = phStore.getState();
    const id = s.session.personaId;
    if (id === "participant") return false;
    const st = s.staff.find(x => x.id === id);
    return !!st && (st.role === "clinical_review" || st.role === "nursing_lead" || st.role === "clinical_capture");
  }
  phClusterLabel(i){ return this.phClinicalCluster(i) ? "RESTRICTED" : CLUSTERS[i][0].toUpperCase(); }
  phDot(page){ try { return (navAttention(phStore.getState())[page] || 0) > 0; } catch (e) { return false; } }

  toggleIn(key, value){
    this.setState(prev => {
      const list = prev[key].slice(), i = list.indexOf(value);
      if (i > -1) list.splice(i, 1); else list.push(value);
      return {[key]: list};
    });
  }
  setSpec(patch){ this.setState(prev => ({agentSpec: Object.assign({}, prev.agentSpec, patch)})); }
  
  askMini(q){
    this.setState(prev => ({
      miniThread: prev.miniThread.concat([{role:"user", text:q}, {role:"helios", q}]),
      miniDraft: ""
    }));
  }
  
  
  sendToAgent(q){
    const id = this.state.agentId;
    this.setState(prev => {
      const extra = (prev.agentExtra[id] || []).concat([{kind:"user", text:q}, {kind:"ask", q}]);
      return {agentExtra: Object.assign({}, prev.agentExtra, {[id]: extra}), agentDraft:""};
    });
  }

  /* The conversation behind an agent: its seeded messages (live from the store) plus anything typed. */
  phAgentThread(agent){
    const extra = (this.state.agentExtra[agent.id] || []).map(m => m.kind === "ask"
      ? Object.assign({kind:"agent"}, phAgentReply(phStore.getState(), agent.id, m.q)) : m);
    return agent.thread.concat(extra);
  }

  /* Files visible to the previewed role, in the shape the Files tab expects. */
  phFileTree(){ return phFileTree(phStore.getState()); }

  /* One graph frame. Safe to call from anywhere: it no-ops unless the ontology
     is on screen, and it builds the graph on first need. */
  graphFrame(){
    if (document.hidden) return;
    const t = performance.now();
    const dt = Math.min(48, t - (this._lastFrame || t - 16));
    if (dt < 8) return;
    this._lastFrame = t;
    // The canvas mounts and unmounts with the tab, and a ref on a plain element
    // is not wired by the template compiler, so resolve it from the DOM. Its
    // presence — not component state — is what says the ontology is on screen.
    if (!this.canvas || !this.canvas.isConnected){
      this.canvas = document.querySelector("canvas[data-onto-graph]");
    }
    if (!this.canvas || !this.canvas.isConnected){ this.canvas = null; return; }
    if (!this.graph) this.graph = buildGraph();
    if (!this.searches){
      try { this.planSearch(); } catch (e) { this.searches = []; }
    }
    this.bindGraphInput(this.canvas);
    this.advance(dt);
    this.drawGraph();
    this.refreshStats();
    this._beat = performance.now();
  }

  renderVals(){
    const v = this.renderValsBase();
    return Object.assign(v, phOverrides(this, v));
  }

  renderValsBase(){
    /* The graph is driven per instance from render, not from a closure created
       in componentDidMount: the runtime can render an instance that never ran
       mount, and a rAF scheduled from that realm never fires. A timer owned by
       whichever instance is actually showing the ontology always does. */
    if (!this._gTimer){
      const tick = () => {
        const t0 = performance.now();
        try { this.graphFrame(); } catch (e) { /* one bad frame must not stop the rest */ }
        const cost = performance.now() - t0;
        this._gTimer = setTimeout(tick, Math.max(16, Math.min(60, cost * 1.2)));
      };
      this._gTimer = setTimeout(tick, 16);
      setTimeout(() => {
        if (!this.graph){ try { this.graph = buildGraph(); } catch (e) {} }
        if (this.graph && !this._legendCounts){
          const c = new Array(CLUSTERS.length).fill(0);
          for (const nd of this.graph.nodes) if (nd.kind !== "core" && nd.cluster >= 0) c[nd.cluster]++;
          this._legendCounts = c;
        }
      }, 450);
    }
    const st = this.state, page = st.page;
    const FILE_TREE = this.phFileTree();
    const openKeys = ORDER.filter(k => !st.resolved[k]);

    // Equal grid columns (width:max-content + 1fr) let a single thumb glide by
    // translateX(index * 100%) — no measurement, and identical motion everywhere.
    
    
    
    const railStyle = (active) => "position:relative;width:" + (st.railOpen ? "100%" : "44px") + ";height:42px;flex:none;display:flex;align-items:center;"
      + (st.railOpen ? "gap:13px;justify-content:flex-start;padding:0 14px;font-size:14px;" : "gap:0;justify-content:center;")
      + "border:0;border-radius:14px;cursor:pointer;overflow:visible;"
      + "transition:background .42s var(--ease),color .35s var(--ease),box-shadow .42s var(--ease),transform .3s cubic-bezier(.16,1.4,.3,1);"
      + (active ? "background:none;color:var(--rail-active-ink,var(--accent))"
                : "background:none;color:var(--mid)");
    // Hover: the icon springs up to 1.3× with a small lift and tilt, a soft accent
    // glow blooms behind it, and an accent stroke re-draws the icon's outline.
    const glyphStyle = (active, hovered) => "position:relative;z-index:1;flex:none;overflow:visible;"
      + "transition:transform .6s cubic-bezier(.2,1.6,.35,1),opacity .22s var(--ease);"
      + "transform:" + (hovered && !active ? "scale(1.3)" : active ? "scale(1.08)" : "none");
    const haloStyle = (active, hovered) => "position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:999px;pointer-events:none;"
      + "background:radial-gradient(closest-side,var(--accent-soft),transparent);"
      + "transition:transform .7s cubic-bezier(.2,1.2,.3,1),opacity .45s var(--ease);"
      + (hovered && !active ? "opacity:1;transform:scale(1)" : "opacity:0;transform:scale(.3)");
    const drawStyle = (active, hovered) => "stroke-dasharray:1;"
      + (hovered && !active
          ? "stroke-dashoffset:0;opacity:1;transition:stroke-dashoffset .75s cubic-bezier(.5,0,.2,1) .05s,opacity .2s"
          : "stroke-dashoffset:1;opacity:0;transition:stroke-dashoffset 0s .3s,opacity .3s");
    const labelStyle = (shown, top) => "position:fixed;left:46px;top:" + top + "px;z-index:90;display:flex;align-items:center;gap:9px;padding:9px 15px;border-radius:var(--r-sm,10px);"
      + "background:var(--tooltip);border:1px solid var(--border);box-shadow:0 16px 38px rgba(0,0,0,.4);"
      + "font-size:13px;font-weight:500;color:var(--tooltip-ink);white-space:nowrap;pointer-events:none;"
      + "transform-origin:left center;opacity:1;transform:translate(0,-50%) scale(1);"
      + "transition:opacity .2s ease,transform .38s cubic-bezier(.16,1.5,.3,1),visibility .2s;"
      + (shown ? "visibility:visible" : "visibility:hidden;opacity:0;transform:translate(-12px,-50%) scale(.92)")

    // Open rail shows labels inline; collapsed rail shows them as the hover pill — never both.
    const railOpen = st.railOpen;
    // Collapsed: the label leaves the flex row entirely — otherwise its gap decentres the icon.
    const inlineStyle = (hov, act) => railOpen
      ? "flex:1;min-width:0;font-size:13px;text-align:left;white-space:nowrap;overflow:hidden;opacity:1;"
        + "font-weight:" + (act ? "600" : "500") + ";"
        + "transform:translateX(" + (hov && !act ? "3px" : "0") + ");"
        + "transition:transform .5s cubic-bezier(.22,1.2,.36,1),font-weight .2s var(--ease)"
      : "display:none";
    const nav = NAV.map((n, idx) => n.divider
      ? {isDivider:true, isItem:false}
      : {isItem:true, isDivider:false, label:n.label, hint: railOpen ? (n.hint || "") : "", d:ICONS[n.icon],
         dot: n.dot === true && this.phDot(n.page),
         dotStyle: "position:absolute;top:5px;" + (railOpen ? "left:30px" : "right:6px")
           + ";width:5px;height:5px;border-radius:50%;background:var(--accent)",
         inlineStyle: inlineStyle(st.railHov === idx, n.page === page),
         hintStyle: "flex:none;font-family:" + MONO + ";font-size:9.5px;color:var(--faint);white-space:nowrap",
         active: n.page === page,
         railKey: n.page === page ? "active" : "idle",
         glyphStyle: glyphStyle(n.page === page, st.hovered === idx || st.railHov === idx),
         haloStyle: haloStyle(n.page === page, st.hovered === idx || st.railHov === idx),
         drawStyle: drawStyle(n.page === page, st.hovered === idx || st.railHov === idx),
         style: railStyle(n.page === page) + ";animation:railIn .42s var(--ease) " + (idx * 45) + "ms both",
         enter: (e) => { if (!railOpen) this.hover(idx, n.label, n.hint || "", e); else this.setState({railHov:idx}); },
         leave: () => { if (this.state.railHov === idx) this.setState({railHov:null}); this.unhover(idx); },
         go: () => this.go(n.page)});

    const workSec = WORK_SECTIONS.find(s => s.id === st.workSection) || WORK_SECTIONS[0];
    
    
    
    /* ---- the operations control room ---- */
    
    
    
    
    
    
    

    

    
    // A denser, Google-Calendar-style spread of events across the whole month —
    // not just the last week — so the month grid actually has something in it.
    
    

    

    
    

    

    

    /* ---- records: contacts, files, ontology ---- */
    const recSec = REC_SECTIONS.find(s => s.id === st.recSection) || REC_SECTIONS[0];
    const askQ = st.recAsk.trim().toLowerCase();
    const TAG_TINT = {staff:[LIME,""], customer:[BODY,""], supplier:[BODY,""],
      watch:[AMBER,""], "on stop":[RED,""]};
    const askTerms = askQ ? askQ.split(/\s+/).filter(w => w.length > 2 &&
      ["the","and","for","who","any","anyone","all","are","with","from","that","show","find","list","get","people","contact","contacts"].indexOf(w) < 0) : [];
    const matchedContacts = CONTACTS.filter(c => {
      if (!askTerms.length) return true;
      const hay = c.slice(0, 5).join(" ").toLowerCase();
      return askTerms.some(t => hay.indexOf(t) > -1);
    });

    const treeOpen = st.treeOpen;
    const expanded = st.treeExpanded;
    const activeFile = FILE_TREE.find(r => r.id === st.treeFile) || FILE_TREE.find(r => r.type === "file");
    const fileQ = st.treeQuery.trim().toLowerCase();
    const fileHits = fileQ
      ? FILE_TREE.filter(r => r.type === "file" && (r.name + " " + (r.body || []).join(" ")).toLowerCase().indexOf(fileQ) > -1).length
      : 0;
    const treeRows = FILE_TREE.filter(r => r.type === "folder" || expanded[r.parent] !== false).map(r => {
      if (r.type === "folder"){
        return {isFolder:true, isFile:false, name:r.name, pad:"9px",
          count: String(FILE_TREE.filter(x => x.parent === r.id).length),
          rot: expanded[r.id] === false ? "0deg" : "90deg",
          toggle: () => this.setState(prev => ({treeExpanded: Object.assign({}, prev.treeExpanded,
            {[r.id]: prev.treeExpanded[r.id] === false})}))};
      }
      const on = activeFile && r.id === activeFile.id;
      const dim = fileQ && (r.name + " " + (r.body || []).join(" ")).toLowerCase().indexOf(fileQ) < 0;
      return {isFolder:false, isFile:true, name:r.name, indexed:r.indexed,
        fileStyle: "width:100%;display:flex;align-items:center;gap:8px;padding:7px 9px 7px 26px;border:0;border-radius:8px;"
          + "cursor:pointer;font-size:12px;text-align:left;transition:background .18s var(--ease),color .18s var(--ease);"
          + (on ? "background:var(--accent-faint);color:var(--ink)"
                : dim ? "background:none;color:var(--faint)" : "background:none;color:var(--body)"),
        pick: () => this.setState({treeFile:r.id})};
    });

    const ontoKind = {entity:["var(--accent)", INK], ledger:["var(--neutral)", BODY],
      module:["#9fd6f0", INK], predicate:["transparent", DIM]};
    const ontoSel = ONTO_NODES.find(n => n[0] === st.ontoNode) || ONTO_NODES[0];

    const HERO = {
      contacts:{eyebrow:"CONTACTS · " + CONTACTS.length + " ON FILE", title:"People we deal with",
        blurb:"Public Precision Health contacts and fictional client contacts. It matches on name, role, organisation and tag.",
        placeholder:"Try “Neil”, “HR”, “Sisk”, “public”", kind:"KEYWORD", scroll:"SCROLL FOR THE FULL LIST",
        suggestions:["public","HR","Sisk","IBM"]},
      files:{eyebrow:"FILES · " + FILE_TREE.filter(r => r.type === "file").length + " DOCUMENTS",
        title:"Everything on record", blurb:"Bundled synthetic files: imports, report templates and programme reports. What you see depends on the role you preview.",
        placeholder:"Search inside every file…", kind:"FULL TEXT", scroll:"SCROLL FOR THE VIEWER",
        suggestions:["Eurofins","report","template","consent"]},
      ontology:{eyebrow:"ONTOLOGY", title:"Ontology", blurb:recSec.blurb,
        placeholder:"", kind:"", scroll:"", suggestions:[]}
    }[recSec.id] || {eyebrow:"", title:"", blurb:"", placeholder:"", kind:"", scroll:"", suggestions:[]};

    const recModel = {
      title: HERO.title, blurb: HERO.blurb,
      eyebrow: HERO.eyebrow, askPlaceholder: HERO.placeholder,
      searchKind: HERO.kind, scrollHint: HERO.scroll,
      hasHero: page === "Records" && recSec.id !== "ontology",
      isContacts: page === "Records" && recSec.id === "contacts",
      isFiles: page === "Records" && recSec.id === "files",
      isOntology: page === "Records" && recSec.id === "ontology",
      openNew: () => this.setState({newRecOpen:true, newRecName:"", newRecTemplate:"Field sheet"}),
      // On Files the hero field IS the in-file search, so there is only ever one
      // search box on the page and it always drives what is shown below.
      ask: recSec.id === "files" ? st.treeQuery : st.recAsk,
      asking: recSec.id === "files" ? fileQ.length > 0 : askTerms.length > 0,
      notAsking: recSec.id === "files" ? fileQ.length === 0 : askTerms.length === 0,
      setAsk: (e) => this.setState(recSec.id === "files" ? {treeQuery:e.target.value} : {recAsk:e.target.value}),
      clearAsk: () => this.setState(recSec.id === "files" ? {treeQuery:""} : {recAsk:""}),
      askAnswer: recSec.id === "files"
        ? (fileHits ? fileHits + " of " + FILE_TREE.filter(r => r.type === "file").length + " documents contain that" : "No document contains that")
        : (matchedContacts.length
          ? matchedContacts.length + " of " + CONTACTS.length + " match — on name, role, organisation and tag"
          : "Nothing matched. It searches name, role, organisation and tag only."),
      askTerms,
      askSuggestions: HERO.suggestions.map(s => ({label:s,
        use: () => this.setState(recSec.id === "files" ? {treeQuery:s} : {recAsk:s})})),
      contactCols: ["Name","Role","Email","Organisation","Tag"],
      tableCaption: askTerms.length
        ? "Filtered by " + askTerms.map(t => "“" + t + "”").join(" or ")
        : "Public and fictional contacts as one set of records.",
      tableBadge: matchedContacts.length + " / " + CONTACTS.length,
      tableFooter: "Showing " + matchedContacts.length + " of " + CONTACTS.length + " contacts",
      contactsEmpty: matchedContacts.length === 0,
      contacts: matchedContacts.map(c => {
        const tint = TAG_TINT[c[4]] || [BODY,""];
        return {name:c[0], role:c[1], email:c[2], org:c[3], tag:c[4], bg:c[5],
          initials: c[0].split(" ").map(w => w[0]).slice(0,2).join(""),
          tagStyle: "padding:3px 11px;border-radius:var(--r-sm,9px);font-size:11px;background:var(--chip);border:1px solid var(--chip-border);color:" + tint[0],
          open: () => this.setState({recSection:"files"})};
      })
    };

    const treeModel = {
      open: treeOpen, closed: !treeOpen, rows: treeRows,
      toggle: () => this.setState(prev => ({treeOpen: !prev.treeOpen})),
      query: st.treeQuery,
      setQuery: (e) => this.setState({treeQuery:e.target.value}),
      searching: fileQ.length > 0,
      hits: fileQ ? fileHits + " MATCHING" : "",
      meta: activeFile ? (activeFile.indexed ? "INDEXED" : "NOT INDEXED") : "",
      path: activeFile ? activeFile.path : "",
      fileTitle: activeFile ? activeFile.title : "",
      facts: activeFile ? activeFile.facts.map(k => ({k:k[0], v:k[1]})) : [],
      body: activeFile ? activeFile.body : [],
      links: activeFile ? activeFile.links.map(l => ({label:l[0],
        open: () => this.setState({recSection: l[1] === "person" || l[1] === "org" ? "contacts" : "ontology"})})) : []
    };

    /* ---- admin ---- */
    
    
    
    

    
    
    

    /* Each connection reads as a pairing — Pulse on the left, the system on the
       right, joined by a live link whose colour carries the status. */
    

    

    

    /* ---- activity ---- */
    
    
    
    
    
    
    
    
    
    

    /* The Agents lens is its own page, not the generic board with two empty
       lanes: agent-specific numbers, a roster of what each agent is doing, and
       the AI lane given the width beside it. */
    
    
    
    
    
    /* Needs attention is a triage queue, not a feed: one row per distinct
       problem, deduped and oldest first, each answering what happened, why it
       matters and what can be done. */
    
    
    
    
    
    /* The People lens answers who is doing what right now — a roster of the
       staff with access, what each last touched, and what is parked on them. */
    
    
    
    
    
    
    

    const g = this.graph, live = this.searches || [];
    const PHASE_WORD = {sweep:"expanding", path:"tracing", hold:"matched", fade:"clearing"};
    const graphModel = {
      nodeCount: g ? g.nodes.length.toLocaleString("en-IE") : "—",
      edgeCount: g ? g.edges.length.toLocaleString("en-IE") : "—",
      running: live.filter(s => s.delay <= 0).length + " OF " + live.length,
      queries: live.map((s, i) => {
        const settled = Math.min(s.order.length, Math.floor(s.reveal));
        const pct = s.phase === "sweep"
          ? Math.round(100 * settled / Math.max(1, s.order.length))
          : 100;
        return {hue: s.hue,
          label: "Query " + (i + 1) + " · " + (g ? CLUSTERS[g.nodes[s.source].cluster][0] : ""),
          detail: s.delay > 0 ? "queued"
            : s.phase === "sweep" ? settled + " settled"
            : PHASE_WORD[s.phase] + " · " + Math.max(0, s.path.length - 1) + " hops",
          progress: (s.delay > 0 ? 0 : pct) + "%"};
      }),
      run: () => { if ((st.ontoQuery || "").trim()) this.runOntoQuery(); else this.planSearch(); try { this.setState({gTick: Math.random()}); } catch (e) {} },
      legend: CLUSTERS.map((c, i) => ({label:c[0], bg:c[1],
        count: g ? String((this._legendCounts || (this._legendCounts = (() => {
          const c = new Array(CLUSTERS.length).fill(0);
          for (const nd of g.nodes) if (nd.kind !== "core" && nd.cluster >= 0) c[nd.cluster]++;
          return c; })()))[i]) : "—"}))
    };

    const oq = st.ontoQuery || "", ontoSearchRes = st.ontoResult;
    const ontoSearch = {
      query: oq, hasQuery: oq.length > 0,
      setQuery: (e) => this.setState({ontoQuery:e.target.value}),
      onKey: (e) => { if (e.key === "Enter") this.runOntoQuery(); },
      clear: () => this.clearOntoQuery(),
      hasResult: !!ontoSearchRes, resultEmpty: !!(ontoSearchRes && ontoSearchRes.empty),
      resultFound: !!(ontoSearchRes && !ontoSearchRes.empty && ontoSearchRes.mode === "path" && ontoSearchRes.found),
      resultNoPath: !!(ontoSearchRes && !ontoSearchRes.empty && ontoSearchRes.mode === "path" && !ontoSearchRes.found),
      resultFan: !!(ontoSearchRes && !ontoSearchRes.empty && ontoSearchRes.mode === "fan"),
      fromLabel: ontoSearchRes ? ontoSearchRes.from : "", toLabel: ontoSearchRes ? ontoSearchRes.to : "",
      hopsLabel: ontoSearchRes && ontoSearchRes.hops != null ? ontoSearchRes.hops + " hop" + (ontoSearchRes.hops === 1 ? "" : "s") + " between records" : "",
      connectedLabel: ontoSearchRes && ontoSearchRes.connected
        ? (ontoSearchRes.connected.length ? "Also connected to " + ontoSearchRes.connected.join(", ") : "No other clusters reached this time — try again")
        : ""
    };

    const ontoModel = {
      edges: ONTO_EDGES.map(e => {
        const near = ontoSel && (Math.abs(e[0] - ontoSel[2]) < 2 && Math.abs(e[1] - ontoSel[3]) < 2)
          || (Math.abs(e[2] - ontoSel[2]) < 2 && Math.abs(e[3] - ontoSel[3]) < 2);
        return {x1:e[0], y1:e[1], x2:e[2], y2:e[3],
          stroke: near ? "var(--accent-line)" : "var(--border)", width: near ? 1.6 : 1};
      }),
      // Predicates are edge labels, so they render inside the viewBox and scale
      // with the geometry instead of competing with the fixed-width node pills.
      labels: ONTO_NODES.filter(n => n[1] === "predicate").map(n => {
        const w = Math.round(n[0].length * 12.2 + 34);
        return {label:n[0], rx:n[2] - w / 2, ry:n[3] - 18, rw:w,
          stroke: st.ontoNode === n[0] ? "var(--accent-line)" : "var(--border)"};
      }),
      nodes: ONTO_NODES.filter(n => n[1] !== "predicate").map(n => {
        const [label, kind, x, y, big] = n;
        const tint = ontoKind[kind];
        const on = st.ontoNode === label, hot = st.ontoHover === label;
        const isPred = kind === "predicate";
        return {label, fontSize: isPred ? "10.5px" : big ? "13.5px" : "12.5px",
          ink: isPred ? DIM : tint[1],
          dotStyle: isPred ? "display:none"
            : "width:" + (big ? "10px" : "8px") + ";height:" + (big ? "10px" : "8px") + ";border-radius:var(--r-sm,9px);background:" + tint[0],
          style: "position:absolute;left:" + (7 + x * 0.086) + "%;top:" + (8 + y * 0.142) + "%;transform:translate(-50%,-50%)"
            + (hot || on ? " scale(1.06)" : "") + ";display:flex;align-items:center;gap:8px;cursor:pointer;"
            + "padding:" + (isPred ? "3px 9px" : "8px 14px") + ";border-radius:var(--r-sm,9px);white-space:nowrap;"
            + "transition:transform .24s var(--ease),border-color .2s var(--ease),background .2s var(--ease);"
            + (isPred
              ? "background:var(--surface-2);border:1px dashed " + (on ? "var(--accent-line)" : "var(--border)")
              : on ? "background:var(--surface-2);border:1px solid var(--accent);box-shadow:0 6px 20px var(--accent-faint)"
                   : "background:var(--overlay);border:1px solid var(--border);backdrop-filter:blur(20px)"),
          pick: () => this.setState({ontoNode:label}),
          enter: () => this.setState({ontoHover:label}),
          leave: () => this.setState(prev => (prev.ontoHover === label ? {ontoHover:null} : null))};
      }),
      selectedLabel: ontoSel[0],
      selectedNote: ontoSel[5],
      legend: [["Core entity","var(--accent)", ONTO_NODES.filter(n => n[1] === "entity").length],
        ["Read through the spine","var(--neutral)", ONTO_NODES.filter(n => n[1] === "ledger").length],
        ["Module entity","#9fd6f0", ONTO_NODES.filter(n => n[1] === "module").length],
        ["Predicate","var(--track)", ONTO_NODES.filter(n => n[1] === "predicate").length]]
        .map(l => ({label:l[0], bg:l[1], count:String(l[2])})),
      layouts: [],
      ...ontoSearch
    };

    

    const areaDef = ASPECT_DEFS.find(x => x.id === st.aspect);
    const areaLabel = areaDef ? areaDef.label : st.aspect;
    const chip = (on) => "height:31px;padding:0 14px;border-radius:var(--r-ctl,9px);cursor:pointer;font-size:12.5px;white-space:nowrap;"
      + "transition:background .2s var(--ease),border-color .2s var(--ease),color .2s var(--ease),transform .18s var(--ease);"
      + (on ? "background:var(--accent-faint);border:1px solid var(--accent-line);color:var(--ink)"
            : "background:var(--surface);border:1px solid var(--border);color:var(--dim)");
    const aq = st.agentQuery.trim().toLowerCase();
    const agentMatches = st.agents.filter(a => !aq || (a.name + " " + a.role + " " + a.preview).toLowerCase().indexOf(aq) > -1);
    const activeAgent = st.agents.find(a => a.id === st.agentId) || st.agents[0];
    const activeThread = this.phAgentThread(activeAgent);

    
    // active/inactive are booleans the template branches on — a changed style string
    // on a keyless reused node does not reliably commit.
    const seg = (label, active, go, count) => ({label, go, count: count || "",
      active: !!active, inactive: !active});

    
    
    
    

    const TASKS = [
      {id:"t1", title:"Chase INV-10428 — Dunne & Sons", due:"09:30", who:"AN", queue:["mine","overdue"], subject:"Dunne & Sons Ltd", priority:"high", late:true},
      {id:"t2", title:"Reassign Van 04 jobs off Ballincollig", due:"11:00", who:"MK", queue:["mine","overdue"], subject:"Ballincollig depot", priority:"high", late:true},
      {id:"t3", title:"Approve purchase order PO-4471", due:"12:00", who:"MK", queue:["mine"], subject:"PO-4471", priority:"normal"},
      {id:"t4", title:"Call Casey Builders about Thursday", due:"14:00", who:"TW", queue:["mine","team"], subject:"Casey Builders", priority:"normal"},
      {id:"t5", title:"Sign off August counter stocktake", due:"16:30", who:"SB", queue:["team"], subject:"Head office", priority:"low"},
      {id:"t6", title:"Assign installer to Thursday depot visit", due:"Tomorrow", who:"—", queue:["unassigned","upcoming"], subject:"site-visits.visit", priority:"high"},
      {id:"t7", title:"VAT return — August", due:"Fri", who:"AN", queue:["team","upcoming"], subject:"Head office", priority:"normal"},
      {id:"t8", title:"Ballincollig lease decision", due:"Thu", who:"MK", queue:["mine","upcoming"], subject:"Ballincollig depot", priority:"high"}
    ];
    
    const queueCounts = {
      mine: TASKS.filter(t => t.queue.includes("mine")).length,
      team: TASKS.filter(t => t.queue.includes("team")).length,
      overdue: TASKS.filter(t => t.queue.includes("overdue")).length,
      upcoming: TASKS.filter(t => t.queue.includes("upcoming")).length,
      unassigned: TASKS.filter(t => t.queue.includes("unassigned")).length,
      all: TASKS.length
    };
    
    

    const APPROVALS = [
      {id:"a1", title:"Purchase order PO-4471 — €14,280", subject:"Munster Plumbing Supplies · raised by Aoife Nolan", age:"18m", status:"awaiting you",
       steps:[{who:"Aoife Nolan",state:"raised 08:54",dot:GREEN},{who:"Martin Kilbride",state:"pending",dot:AMBER}],
       work:{kind:"table", label:"PURCHASE ORDER", viewLabel:"View order",
         headline:"PO-4471 · Munster Plumbing Supplies", sub:"Delivery Thursday 18 Sep · terms 30 days",
         cols:["Line","Qty","Unit","Total"], align:["left","right","right","right"],
         rows:[["22mm copper tube — 3m","240","€38.40","€9,216.00"],
               ["Compression elbow 22mm","400","€4.10","€1,640.00"],
               ["Solder ring coupler 22mm","600","€2.85","€1,710.00"],
               ["Flux paste 350g","60","€28.57","€1,714.00"]],
         totals:[["Net","€14,280.00"],["VAT 23% (reverse charge)","€0.00"],["Payable","€14,280.00"]],
         thinking:[["Checked stock levels","All four lines are below reorder point"],
                   ["Matched pricing","Unit prices equal the June supplier agreement"],
                   ["Checked commitments","Three lines are committed to Thursday's jobs"],
                   ["Checked threshold","€4,280 over Martin's sign-off limit, so it routed here"]],
         tools:[["records.read","read"],["invoices.read","read"],["approvals.route","write"]],
         risk:"No alternative supplier quote on file. Last price change was 14 June."}},
      {id:"a2", title:"Credit limit increase — Casey Builders", subject:"€10,000 → €18,000 · raised by Niamh Cronin", age:"Yesterday", status:"awaiting you",
       steps:[{who:"Niamh Cronin",state:"raised 16:02",dot:GREEN},{who:"Aoife Nolan",state:"approved 16:40",dot:GREEN},{who:"Martin Kilbride",state:"pending",dot:AMBER}],
       work:{kind:"diff", label:"RECORD CHANGE", viewLabel:"View change",
         headline:"Casey Builders Ltd · account CB-0142", sub:"Three fields change on approval, one unchanged",
         diff:[["Credit limit","€10,000","€18,000"],["Terms","30 days","45 days"],["Risk band","B","B"],["Reviewed","14 Mar 2026","Today"]],
         thinking:[["Read payment history","24 invoices, 22 paid on time, average 27 days"],
                   ["Checked exposure","Current balance €7,400 — 74% of the existing limit"],
                   ["Checked open work","€21k of quoted work would be blocked by the current limit"],
                   ["Checked policy","Increases above €15,000 need your decision"]],
         tools:[["records.read","read"],["invoices.read","read"],["records.update","write"]],
         risk:"One late payment in February, 19 days over. Cleared in full."}},
      {id:"a4", title:"Proposal — Ballincollig retrofit €62,400", subject:"Drafted by Helios · raised by Niamh Cronin", age:"3h", status:"awaiting you",
       steps:[{who:"Niamh Cronin",state:"raised 06:10",dot:GREEN},{who:"Martin Kilbride",state:"pending",dot:AMBER}],
       work:{kind:"doc", label:"PROPOSAL · 4 PAGES", viewLabel:"Read proposal",
         headline:"Heating retrofit — Ballincollig depot", sub:"Prepared for Casey Builders Ltd · valid 30 days",
         doc:[["Scope","Replace the depot's two oil boilers with a cascaded air-source system, re-balance the existing circuit and fit weather compensation controls. Work is phased over two weekends so the yard keeps running."],
              ["Approach","Week one strips the plant room and lands the new units on the existing plinth. Week two commissions the cascade and hands over with a 12-month monitoring window."],
              ["Commercials","€62,400 fixed price, 30% on order, 40% on plant delivery, 30% on handover. Excludes making good to the render."],
              ["Why us","We hold the maintenance contract on the Glanmire site and carry the same plant in stock, so lead time is three weeks rather than nine."]],
         totals:[["Plant","€38,900.00"],["Labour","€18,100.00"],["Controls and commissioning","€5,400.00"],["Total","€62,400.00"]],
         thinking:[["Pulled the site record","Two oil boilers, 2009, last serviced March"],
                   ["Priced from live stock","Plant is in stock at the Cork branch"],
                   ["Reused past wording","Lifted scope language from the Glanmire proposal you approved"],
                   ["Left a gap","No allowance for asbestos survey — flagged below"]],
         tools:[["records.read","read"],["files.read","read"],["email.send","external"]],
         risk:"No asbestos survey allowance. If the plant room needs one, add roughly €1,200."}},
      {id:"a5", title:"Payment run — 14 suppliers €48,920", subject:"Scheduled by Cash Watch · Friday 19 Sep", age:"1h", status:"awaiting you",
       steps:[{who:"Cash Watch",state:"proposed 09:40",dot:GREEN},{who:"Martin Kilbride",state:"pending",dot:AMBER}],
       work:{kind:"table", label:"PAYMENT RUN", viewLabel:"View run",
         headline:"Run PR-0238 · 14 payments", sub:"Leaves the AIB current account on Friday 19 Sep",
         cols:["Supplier","Due","Invoices","Amount"], align:["left","left","right","right"],
         rows:[["Munster Plumbing Supplies","19 Sep","3","€18,240.00"],
               ["Tyrrell Insulation","19 Sep","1","€9,110.00"],
               ["Kelleher Haulage","20 Sep","4","€7,480.00"],
               ["Cork Electrical Wholesale","19 Sep","2","€6,300.00"],
               ["10 others","19–24 Sep","11","€7,790.00"]],
         totals:[["Run total","€48,920.00"],["Account balance after","€61,380.00"],["Held back","€2,410.00"]],
         thinking:[["Read the ledger","31 invoices due inside seven days"],
                   ["Held two back","Tyrrell credit note unresolved, Dineen job in dispute"],
                   ["Checked the balance","Run leaves €61,380, above your €50k floor"],
                   ["Checked mandates","All 14 have current SEPA mandates on file"]],
         tools:[["invoices.read","read"],["payments.read","read"],["bank.payment.create","external"]],
         risk:"Two invoices held back total €2,410. They will age past 60 days if not paid next run."}},
      {id:"a3", title:"Write-off — INV-10233 €412", subject:"Glanmire Mechanical · raised by Aoife Nolan", age:"2 days", status:"approved",
       steps:[{who:"Aoife Nolan",state:"raised",dot:GREEN},{who:"Martin Kilbride",state:"approved",dot:GREEN}],
       work:{kind:"diff", label:"WRITE-OFF", viewLabel:"View write-off",
         headline:"INV-10233 · Glanmire Mechanical", sub:"Two fields change on approval",
         diff:[["Status","Past due 94 days","Written off"],["Balance","€412.00","€0.00"]],
         thinking:[["Checked the age","94 days past due, three chases sent"],
                   ["Checked the account","Company dissolved 12 August"],
                   ["Checked the amount","Below your €500 write-off threshold"]],
         tools:[["invoices.read","read"],["invoices.update","write"]],
         risk:"None. The counterparty no longer exists."}}
    ];
    const bucketOf = (a) => a.status === "approved" ? "Decided"
      : a.steps.some(s => s.state === "pending" && s.who === "Martin Kilbride") ? "Awaiting you" : "Awaiting others";
    const APPROVAL_COUNTS = {"Awaiting you":0, "Awaiting others":0, "Decided":0};
    APPROVALS.filter(a => !st.approved[a.id]).forEach(a => { APPROVAL_COUNTS[bucketOf(a)] += 1; });
    
    
    
    const WORK_COUNTS = {
      tasks: st.addedTasks.concat(WORK_TASKS).filter(t => !(st.done[t.id] !== undefined ? st.done[t.id] : t.done)).length,
      approvals: APPROVALS.filter(a => !st.approved[a.id] && bucketOf(a) === "Awaiting you").length,
      workflows: OPS_DEFS.filter(w => w.kind !== "task" && (st.opsOff[w.id] === undefined ? w.on : !st.opsOff[w.id])).length,
      schedules: OPS_DEFS.filter(w => w.triggerKind === "schedule").length
    };
    

    /* An approval is a decision about a piece of work, so the work itself has
       to be readable before the yes. The payload shape differs per request —
       a document, a table, a field-level change — and the viewer renders
       whichever one the approval carries, alongside the reasoning and the
       tools that will fire. */
    
    
    

    
    
    





    // Deltas are tinted against the card they sit on: the lime tile has dark ink,
    // so the dark-card GREEN/AMBER/RED tokens are illegible on it.
    
    
    
    
    
    

    

    
    
    

    
    
    

    

    const notificationFeed = [
      {dot:LIME, text:"Aoife Nolan assigned you “Approve purchase order PO-4471”", event:"core.approval.created", channel:"Inbox", meta:"18m"},
      {dot:RED, text:"Xero invoice sync failed — refresh token expired", event:"core.automation.failed", channel:"Inbox · WhatsApp", meta:"6h"},
      {dot:AMBER, text:"Helios flagged a change in Dunne & Sons payment behaviour", event:"core.notification.created", channel:"Inbox", meta:"2h"},
      {dot:AMBER, text:"Thursday's depot visit is still unassigned", event:"site-visits.visit.created", channel:"Inbox", meta:"2h"},
      {dot:NEUTRAL, text:"Séamus Byrne mentioned you on “Reassign Van 04 jobs”", event:"core.comment.created", channel:"Inbox", meta:"Yesterday"},
      {dot:NEUTRAL, text:"Your daily briefing is ready", event:"core.briefing.sent", channel:"WhatsApp", meta:"07:00"}
    ];

    
    

    const q = st.query.trim();
    const ql = q.toLowerCase();
    
    
    const recents = st.palRecent || [];
    const themeAction = st.theme === "dark" ? "Switch to light appearance" : "Switch to dark appearance";
    const SEARCH = [
      recents.length ? {group:"Recent", scope:"All", items:recents.slice(0, 3).map(r => ({title:r, meta:"Recent search", hint:"AGAIN", glyph:"recent",
        go: () => this.setState({query:r, palSel:0})}))} : null,
      {group:"Actions", scope:"Actions", items:[
        {title:"Start a new Helios conversation", meta:"Clears the current thread", hint:"ACTION", glyph:"action",
          go: () => { clearInterval(this._t); this.setState({page:"Home", thread:[], typed:0, draft:""}); }},
        {title:"Review approvals waiting on you", meta:"Work · approvals", hint:"ACTION", glyph:"action",
          go: () => this.setState({page:"Work", queue:"mine"})},
        {title:themeAction, meta:"Appearance", hint:"ACTION", glyph:"action",
          go: () => this.setState(p => p.theme === "light" ? {theme: p.darkTheme || this.props.theme || "harbour"} : {theme:"light", darkTheme:p.theme})},
        {title:"Open system health", meta:"Admin · modules and jobs", hint:"ACTION", glyph:"action",
          go: () => this.setState({page:"Settings"})}
      ]},
      {group:"Agents", scope:"Agents", items:st.agents.slice(0, 4).map(a => ({title:a.name, meta:a.role, hint:a.group ? "GROUP" : "AGENT", glyph:"agent",
        go: () => this.setState({page:"Agents", agentId:a.id})}))},
      {group:"Work", scope:"Work", items:TASKS.slice(0, 4).map(t => ({title:t.title, meta:t.subject + " · due " + t.due, hint:"TASK", glyph:"task",
        go: () => this.setState({page:"Work", queue:"mine"})}))},
      {group:"Records", scope:"Records", items:PEOPLE.slice(0, 3).map(p => ({title:p[0], meta:p[1] + " · " + p[3], hint:"PERSON", glyph:"person",
        go: () => this.setState({page:"Records", record:"person"})}))
        .concat(ORGS.slice(0, 3).map(o => ({title:o[0], meta:o[1] + " · " + o[2] + " outstanding", hint:"ORG", glyph:"org",
        go: () => this.setState({page:"Records", record:"org"})})))},
      {group:"Pages", scope:"Pages", items:ASPECT_DEFS.slice(0, 3).map(a => ({title:a.label, meta:a.description, hint:"AREA", glyph:"page",
        go: () => this.goPage("Dashboard", {aspect:a.id})}))
        .concat([{title:"Roles and grants", meta:"Who can see and do what", hint:"CONFIG", glyph:"page",
        go: () => this.setState({page:"Settings"})}])}
    ].filter(Boolean);

    const match = g => g.items.filter(i => !ql || (i.title + " " + i.meta).toLowerCase().includes(ql));
    const scopeCounts = {All:0};
    SEARCH.forEach(g => { const n = match(g).length; scopeCounts.All += n; if (g.scope !== "All") scopeCounts[g.scope] = (scopeCounts[g.scope] || 0) + n; });
    

    
    const base = q ? 1 : 0;
    
    
    
    
    const flat = [];
    
    let n = base;
    
    
    /* launcher rows extend the same flat index; see below */
    if (base === 1) flat[0] = () => this.ask(q);

    /* ---- launcher (no query): page kit, frequents, recents, jump-to ---- */
    
    
    
    
    
    
    

    
    
    
    
    
    
    
    
    
    

    const DIRS_ORDER = ["People","Organisations","Teams","Locations","Site visits"];
    const ADMIN_ORDER = ["Automations","System health","Installed modules"];
    let contextNav, contextHint, searchHint;
    if (page === "Settings"){
      contextNav = ADMIN_GROUPS.map(grp => seg(
        grp[0].charAt(0) + grp[0].slice(1).toLowerCase(),
        st.adminGroup === grp[0],
        () => this.setState({adminGroup: st.adminGroup === grp[0] ? null : grp[0]}),
        String(ADMIN_CARDS.filter(c => c.group === grp[0]).length)));
      contextHint = "ADMIN · 13 AREAS";
      searchHint = "Search settings";
    } else if (page === "Activity"){
      contextNav = [["all","Everything"],["people","People"],["ai","Agents"],["attention",(st.w - (st.railOpen ? 252 : 68)) < 1000 ? "Attention" : "Needs attention"]]
        .map(k => seg(k[1], st.actKpi === k[0], () => this.setState({actKpi:k[0]})));
      contextHint = st.actPaused ? "LIVE VIEW PAUSED" : "LIVE · EVENT LOG";
      searchHint = "Search the audit trail";
    } else if (page === "Records"){
      contextNav = REC_SECTIONS.map(s => seg(s.label, st.recSection === s.id,
        () => this.setState({recSection:s.id})));
      contextHint = "RECORDS · " + recSec.label.toUpperCase();
      searchHint = recSec.id === "ontology" ? "Search the ontology" : "Search " + recSec.label.toLowerCase();
    } else if (page === "Work"){
      contextNav = WORK_SECTIONS.map(s => seg(s.label, st.workSection === s.id,
        () => this.setState({workSection:s.id, opsOpen:null}), String(WORK_COUNTS[s.id])));
      contextHint = "WORK · " + workSec.label.toUpperCase();
      searchHint = "Search " + workSec.label.toLowerCase();
    } else if (page === "Home" || page === "Dashboard"){
      contextNav = [
        seg("Home", page === "Home", () => this.go("Home")),
        seg("Dashboard", page === "Dashboard", () => this.go("Dashboard"))
      ];
      contextHint = page === "Home" ? "HELIOS · " + openKeys.length + " WAITING" : "CRM · " + areaLabel.toUpperCase();
      searchHint = page === "Dashboard" ? "Search the dashboard" : "Search every record you can see";
    } else if (page === "Agents"){
      contextNav = [];
      contextHint = "";
      searchHint = "Search agents";
    } else if (page === "Action inbox"){
      contextNav = ["All","Approvals","Alerts","Work","Automations"].map(fl =>
        seg(fl, st.inboxFilter === fl, () => this.setState({inboxFilter:fl, open:null}),
          fl === "All" ? String(openKeys.length) : String(openKeys.filter(k => ITEMS[k].group === fl).length)));
      contextHint = "PROVIDERS · CORE + MODULES";
      searchHint = "Search the inbox";
    } else if (page === "Work"){
      contextNav = [["mine","My work"],["team","Team"],["overdue","Overdue"],["upcoming","Next 7 days"],["unassigned","Unassigned"],["all","Everything"]]
        .map(q => seg(q[1], st.queue === q[0], () => this.setState({queue:q[0]}), String(queueCounts[q[0]])));
      contextHint = "QUEUES · CORE:TASK:VIEW";
      searchHint = "Search tasks";
    } else if (page === "Insights"){
      contextNav = [["7d","7 days"],["30d","30 days"],["90d","90 days"]].map(r => seg(r[1], st.range === r[0], () => this.setState({range:r[0]})));
      contextHint = "METRICS FROM THE REGISTRY";
      searchHint = "Search metrics";
    } else if (DIRS_ORDER.indexOf(page) > -1){
      contextNav = DIRS_ORDER.map(d => seg(d, page === d, () => this.go(d)));
      contextHint = "DIRECTORY · SPINE-BACKED";
      searchHint = "Search " + page.toLowerCase();
    } else if (page === "Approvals"){
      contextNav = ["Awaiting you","Awaiting others","Decided"].map(s =>
        seg(s, st.approvalFilter === s, () => this.setState({approvalFilter:s}),
          String(APPROVAL_COUNTS[s])));
      contextHint = "STEPS · CORE:APPROVAL:DECIDE";
      searchHint = "Search approvals";
    } else if (ADMIN_ORDER.indexOf(page) > -1){
      contextNav = ADMIN_ORDER.map(a => seg(a, page === a, () => this.go(a)));
      contextHint = "ADMIN · CORE:AUTOMATION:VIEW";
      searchHint = "Search automations and runs";
    } else if (page === "Settings"){
      contextNav = ADMIN_GROUPS.map(g => seg(g.name.charAt(0) + g.name.slice(1).toLowerCase(), false, () => {}));
      contextHint = "ADMIN · CONFIGURATION";
      searchHint = "Search settings";
    } else {
      contextNav = [seg(page, true, () => {}), seg("Home", false, () => this.go("Home"))];
      contextHint = "CLIENT CONFIG";
      searchHint = "Search this page";
    }

    ({contextNav, contextHint, searchHint} = phContext(this, page, seg, contextNav, contextHint, searchHint));

    // Below these widths the nav keeps its room and the softer furniture gives way:
    // the context hint first, then the search label, then the profile text.
    const roomy = st.w >= 1320, mid = st.w >= 1120;
    return {
      nav, contextNav, contextHint, searchHint, 
      isRecords: page === "Records",
      
      
      
      showRecordsWash: page === "Records" && recSec.id !== "ontology",
      rec: recModel, tree: treeModel, onto: ontoModel,  graph: graphModel,

      /* rail */
      railOuter: "position:relative;z-index:2;width:" + (railOpen ? "252px" : "68px")
        + ";flex:none;display:flex;flex-direction:column;align-items:" + (railOpen ? "stretch" : "center")
        + ";gap:4px;padding:22px " + (railOpen ? "16px" : "0") + " 16px"
        + ";background:transparent;"
        + "overflow-y:auto;overflow-x:hidden;scrollbar-width:none;"
        + "transition:width .32s var(--ease),padding .32s var(--ease)",
      brandStyle: railOpen
        ? "flex:1;min-width:0;font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;opacity:1"
        : "display:none",
      
      railOpen,
      railRowStyle: "display:flex;align-items:center;gap:10px;"
        + (railOpen ? "width:100%;padding:0 10px;" : "justify-content:center;width:40px;"),
      railLabel: railOpen ? "Collapse sidebar" : "Expand sidebar",
      toggleRail: () => this.setState(prev => ({railOpen: !prev.railOpen, hovered:null})),
      settingsInlineStyle: inlineStyle(st.railHov === "settings", page === "Settings"),

      /* header zones */
      isAgents: page === "Agents",
      showPillNav: page !== "Agents",

      /* home widgets */
      widgetHint: st.widgetEdit ? "EDITING BOARD" : String(st.widgets.length) + " WIDGETS",
      widgetEdit: st.widgetEdit,
      toggleWidgetEdit: () => this.setState(prev => ({widgetEdit: !prev.widgetEdit})),
      widgetEditLabel: st.widgetEdit ? "Done" : "Edit",
      widgetEditBg: st.widgetEdit ? "var(--accent)" : "var(--surface)",
      widgetEditBorder: st.widgetEdit ? "var(--accent)" : "var(--border)",
      widgetEditColor: st.widgetEdit ? "var(--on-accent)" : "var(--dim)",
      widgetChoices: WIDGET_DEFS.filter(w => st.widgets.indexOf(w[0]) < 0)
        .map(w => ({label:w[1], add: () => this.toggleIn("widgets", w[0])})),
      noWidgetChoices: WIDGET_DEFS.every(w => st.widgets.indexOf(w[0]) > -1),
      
      
      
      
      
      
      
      

      /* dashboard */
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      // One area at a time: the slider selects, it does not accumulate.
      
      
      
      
      
      
      
      
      

      /* work: tasks, approvals, workflows, schedules */
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      

      /* home widget board */
      
      

      /* agents */
      agentQuery: st.agentQuery,
      agentQueryOn: (st.agentQuery || "").length > 0,
      clearAgentQuery: () => this.setState({agentQuery:""}),
      setAgentQuery: (e) => this.setState({agentQuery:e.target.value}),
      
      agentListEmpty: agentMatches.length === 0,
      groupName: st.groupNames[activeAgent.id] !== undefined ? st.groupNames[activeAgent.id] : activeAgent.name,
      setGroupName: (e) => { const v = e.target.value, id = activeAgent.id;
        this.setState(prev => ({groupNames: Object.assign({}, prev.groupNames, {[id]: v})})); },
      groupMembers: (activeAgent.members || []).map((mid, i) => {
        const m = AGENT_DEFS.find(a => a.id === mid) || {shape:"crown-pebble", tint:"#191c1f", state:"idle"};
        return {shape:m.shape, tint:m.tint, state:m.state,
          chipStyle: "display:block;flex:none;border-radius:var(--r-sm,9px);" + (i ? "margin-left:-6px" : "")};
      }),
      agentList: agentMatches.map(a => ({
        name: st.groupNames[a.id] !== undefined ? st.groupNames[a.id] : a.name,
        shape:a.shape, tint:a.tint, state:a.state, when:a.when, preview:a.preview,
        isGroup: a.group === true, isSolo: a.group !== true,
        // A fixed -6px overlap: each face keeps 18 of its 24px visible, so the
        // eyes of every member stay readable however many there are.
        stack: (a.members || []).slice(0, 3).map((mid, i) => {
          const m = AGENT_DEFS.find(x => x.id === mid) || {shape:"crown-pebble", tint:"#191c1f", state:"idle"};
          return {shape:m.shape, tint:m.tint, state:m.state,
            style: "display:block;flex:none;border-radius:var(--r-sm,9px);" + (i ? "margin-left:-6px" : "")};
        }),
        rowStyle: "position:relative;display:flex;align-items:flex-start;gap:13px;padding:13px 14px 13px 22px;border-radius:16px;cursor:pointer;"
          + "transition:background .2s var(--ease);"
          + (a.id === st.agentId ? "background:var(--surface-strong)" : "background:none"),
        unread: a.id !== st.agentId && /now|m$|min/.test(String(a.when || "")),
        open: () => this.setState({agentId:a.id})
      })),
      agent: {name: st.groupNames[activeAgent.id] !== undefined ? st.groupNames[activeAgent.id] : activeAgent.name,
              shape:activeAgent.shape, tint:activeAgent.tint, state:activeAgent.state, role:activeAgent.role,
              isGroup: activeAgent.group === true, isSolo: activeAgent.group !== true,
              statusLabel: activeAgent.group
                ? activeAgent.members.length + " agents · " + STATE_LABELS[activeAgent.state]
                : STATE_LABELS[activeAgent.state] || "idle"},
      agentPlaceholder: "Message " + activeAgent.name,
      
      agentPrimaryTitle: (st.agentDraft || "").trim() ? "Send" : "Dictate",
      agentPrimary: () => { if ((st.agentDraft || "").trim()) this.sendToAgent(st.agentDraft.trim()); else this.setState(prev => ({agentMic: !prev.agentMic})); },
      agentPrimaryStyle: "width:30px;height:30px;flex:none;border:0;border-radius:999px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .22s var(--ease),color .22s var(--ease),transform .18s var(--ease);"
        + ((st.agentDraft || "").trim()
            ? "background:var(--accent-fill,var(--accent));color:var(--on-accent);box-shadow:var(--accent-glow,none)"
            : (st.agentMic ? "background:var(--accent-soft);color:var(--accent)" : "background:var(--surface);color:var(--dim)")),
      agentMicStyle: "position:absolute;inset:0;transition:transform .28s var(--ease),opacity .2s var(--ease);"
        + ((st.agentDraft || "").trim() ? "transform:scale(.6) rotate(-20deg);opacity:0" : "transform:none;opacity:1"),
      agentSendStyle: "position:absolute;inset:0;transition:transform .28s var(--ease),opacity .2s var(--ease);"
        + ((st.agentDraft || "").trim() ? "transform:none;opacity:1" : "transform:scale(.6) rotate(20deg);opacity:0"),
      agentThread: activeThread.map((m, i) => {
        const isUser = m.kind === "user";
        // In a group, attribute a run of messages to whichever agent is speaking.
        const from = m.from ? AGENT_DEFS.find(a => a.id === m.from) : null;
        const prevFrom = i > 0 ? activeThread[i-1].from : null;
        return {
          hasSender: !!from && m.from !== prevFrom,
          sender: from ? from.name : "",
          senderShape: from ? from.shape : "crown-pebble", senderTint: from ? from.tint : "#191c1f",
          senderState: from ? from.state : "idle",
          alignItems: isUser ? "flex-end" : "flex-start",
          isStamp: m.kind === "stamp", isRoutine: m.kind === "routine",
          isBubble: m.kind === "user" || m.kind === "agent",
          text:m.text, routine:m.routine || "", hasLines: !!m.lines,
          lines: (m.lines || []).map(l => ({k:l.k, v:l.v, hasTarget: !!l.target, open: l.target ? () => this.phGo(l.target) : undefined})),
          hasLinks: !!(m.links && m.links.length),
          links: (m.links || []).map(l => ({label:l.label, open: () => this.phGo(l.target)})),
          wrapStyle: "display:flex;margin-bottom:14px;" + (isUser ? "justify-content:flex-end" : "justify-content:flex-start"),
          bubbleStyle: "padding:10px 15px;font-size:14.5px;line-height:1.45;border-radius:"
            + (isUser ? "20px 20px 4px 20px" : "20px 20px 20px 4px") + ";"
            + (isUser ? "background:var(--accent-fill,var(--accent));color:var(--on-accent)"
                      : "background:var(--surface-strong);color:var(--ink)")
        };
      }),
      agentChips: (phAgentSuggestions(phStore.getState(), activeAgent.id) || []).map(q => ({label:q, send: () => this.sendToAgent(q)})),
      agentDraft: st.agentDraft,
      setAgentDraft: (e) => this.setState({agentDraft:e.target.value}),
      onAgentKey: (e) => { if (e.key === "Enter" && st.agentDraft.trim()) this.sendToAgent(st.agentDraft.trim()); },
      

      /* mini chat */
      showFab: page !== "Home" && page !== "Agents",
      fabTitle: st.miniOpen ? "Close Pulse" : "Ask Pulse",
      fabChatStyle: "position:absolute;inset:0;transition:transform .34s var(--ease),opacity .24s var(--ease);"
        + (st.miniOpen ? "transform:rotate(-90deg) scale(.7);opacity:0" : "transform:none;opacity:1"),
      fabCloseStyle: "position:absolute;inset:0;transition:transform .34s var(--ease),opacity .24s var(--ease);"
        + (st.miniOpen ? "transform:none;opacity:1" : "transform:rotate(90deg) scale(.7);opacity:0"),
      miniMicStyle: "width:34px;height:34px;flex:none;border-radius:var(--r-ctl,12px);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:color .2s var(--ease),border-color .2s var(--ease),background .2s var(--ease);"
        + (st.miniMic ? "border:1px solid var(--accent-line);background:var(--accent-soft);color:var(--accent)" : "border:1px solid var(--border);background:none;color:var(--dim)"),
      miniDictate: () => this.setState(prev => ({miniMic: !prev.miniMic})),
      miniAttach: () => this.openPalette(),
      miniFooter: st.miniMic ? "LISTENING" : "SEES " + page.toUpperCase() + " · ENTER TO SEND",
      miniOpen: st.miniOpen,
      toggleMini: () => this.setState(prev => ({miniOpen: !prev.miniOpen})),
      miniContext: "SEES " + page.toUpperCase(),
      goHomeChat: () => this.setState({page:"Home", miniOpen:false}),
      miniIsChat: (st.miniTab || "chat") === "chat", miniIsWork: (st.miniTab || "chat") === "work",
      miniTabTrack: "position:relative;display:flex;align-items:center;width:164px;padding:2px;background:var(--surface-faint);border:1px solid var(--border);border-radius:var(--r-md,14px);flex:none;box-shadow:inset 0 1px 3px rgba(0,0,0,.34),inset 0 -1px 0 var(--glass-highlight);",
      miniTabThumb: (() => {
        const idx = (st.miniTab || "chat") === "chat" ? 0 : 1;
        return "position:absolute;top:2px;bottom:2px;left:2px;width:calc(50% - 2px);border-radius:var(--r-sm,9px);background:var(--pill-bg);box-shadow:0 2px 5px rgba(0,0,0,.34),0 6px 16px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.5);"
          + "transform:translateX(" + (idx * 100) + "%);transition:transform .3s var(--ease)";
      })(),
      miniTabs: [["chat","Chat"],["work","Work"]].map(t => {
        const on = (st.miniTab || "chat") === t[0];
        return {label:t[1],
          style: "position:relative;z-index:1;flex:1;height:28px;padding:0;border:0;border-radius:var(--r-ctl,10px);background:none;font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap;transition:color .24s var(--ease);"
            + (on ? "color:var(--pill-ink)" : "color:var(--dim)"),
          pick: () => this.setState({miniTab:t[0]})};
      }),
      miniHasRecent: st.thread.length > 0,
      miniRecent: st.thread.length > 0 ? [{title: (st.thread.find(m => m.role === "user") || {}).text || "Recent conversation",
        date: new Date().toLocaleDateString("en-GB"), open: () => this.setState({page:"Home", miniOpen:false})}] : [],
      miniEmpty: st.miniThread.length === 0,
      miniGreeting: (() => { const h = new Date().getHours();
        const g = h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 22 ? "Good evening" : "Still going";
        return g + ", Mac"; })(),
      miniSuggestions: [
        {label:"What changed today?", run:() => this.askMini("What changed today?")},
        {label:"What needs my decision?", run:() => this.askMini("What needs my decision?")},
        {label:"Draft a chase for the worst account", run:() => this.askMini("Draft chase emails")}
      ],
      miniWorkSections: (() => {
        const openTasks = WORK_TASKS.filter(t => t.status !== "Done").slice(0, 4);
        const meetingsOpen = (st.miniWorkOpen || "tasks") === "meetings";
        const tasksOpen = (st.miniWorkOpen || "tasks") === "tasks";
        const notifsOpen = st.miniWorkOpen === "notifications";
        const toggle = (key) => () => this.setState(prev => ({miniWorkOpen: prev.miniWorkOpen === key ? null : key}));
        return [
          {num:"01", title:"Meetings", icon:"M8 4v3 M16 4v3 M4.5 9.5h15 M6.4 6h11.2A1.9 1.9 0 0 1 19.5 8v10a1.9 1.9 0 0 1-1.9 1.9H6.4A1.9 1.9 0 0 1 4.5 18V8A1.9 1.9 0 0 1 6.4 6Z",
            statusText:"Clear", statusColor:"var(--faint)", open:meetingsOpen, toggle:toggle("meetings"),
            isEmpty:true, emptyText:"Nothing scheduled.", rows:[],
            hasLink:true, linkLabel:"Full calendar", linkGo: () => this.setState({page:"Work", workSection:"schedules", miniOpen:false}),
            wrapStyle: "background:var(--surface);border:1px solid var(--border);border-radius:var(--card-r,18px);overflow:hidden"},
          {num:"02", title:"Tasks", icon:"M5 6.5h2l1.4 1.4L11 5.5 M5 12.5h2l1.4 1.4 2.6-2.4 M5 18.5h2l1.4 1.4 2.6-2.4 M15 6.5h4 M15 12.5h4 M15 18.5h4",
            statusText:openTasks.length + " open", statusColor:"var(--accent)", open:tasksOpen, toggle:toggle("tasks"),
            isEmpty:openTasks.length === 0, emptyText:"Nothing open.",
            rows: openTasks.map(t => ({isCheck:true, title:t.title,
              hasTag:true, tag:t.priority, tagStyle:"flex:none;padding:2px 9px;border-radius:var(--chip-r,6px);font-size:11px;background:var(--ok-soft);color:var(--ok)"})),
            hasLink:true, linkLabel:"All tasks", linkGo: () => this.setState({page:"Work", workSection:"tasks", miniOpen:false}),
            wrapStyle: "background:var(--surface);border:1px solid var(--border);border-radius:var(--card-r,18px);overflow:hidden"},
          {num:"03", title:"Notifications", icon:"M12 4a5.5 5.5 0 0 0-5.5 5.5v3.2L5 16h14l-1.5-3.3V9.5A5.5 5.5 0 0 0 12 4Z M9.8 19a2.2 2.2 0 0 0 4.4 0",
            statusText:"12 unread", statusColor:"#6ad0f0", open:notifsOpen, toggle:toggle("notifications"),
            isEmpty:false, emptyText:"",
            rows:[{isCheck:false, title:"Xero token expired — reconnect", hasTag:false},
              {isCheck:false, title:"Aoife raised a €14,280 approval", hasTag:false},
              {isCheck:false, title:"3 accounts moved off Standard rate", hasTag:false}],
            hasLink:true, linkLabel:"All notifications", linkGo: () => this.setState({showNotifs:true, miniOpen:false}),
            wrapStyle: "background:var(--surface);border:1px solid var(--border);border-radius:var(--card-r,18px);overflow:hidden"}
        ];
      })(),
      miniThread: st.miniThread.map(m => ({
        text:m.text,
        wrapStyle: "display:flex;margin-bottom:12px;" + (m.role === "user" ? "justify-content:flex-end" : "justify-content:flex-start"),
        bubbleStyle: "max-width:84%;padding:11px 14px;font-size:13px;line-height:1.6;border-radius:"
          + (m.role === "user" ? "16px 16px 5px 16px" : "16px 16px 16px 5px") + ";"
          + (m.role === "user" ? "background:var(--accent-fill,var(--accent));color:var(--on-accent);box-shadow:var(--accent-glow,none)"
                               : "background:var(--surface);border:1px solid var(--border);color:var(--body)")
      })),
      miniDraft: st.miniDraft,
      setMiniDraft: (e) => this.setState({miniDraft:e.target.value}),
      onMiniKey: (e) => { if (e.key === "Enter" && st.miniDraft.trim()) this.askMini(st.miniDraft.trim()); },
      sendMini: () => { if (st.miniDraft.trim()) this.askMini(st.miniDraft.trim()); },

      /* agent builder */
      builderOpen: st.builderOpen,
      closeBuilder: () => { clearInterval(this._trainTimer); this.setState({builderOpen:false, training:false}); },
      openBuilder: () => this.setState({page:"Agents", builderOpen:true, builderMode:"new", trained:false, training:false, trainPhase:0, briefThread:[], briefDraft:"", briefPicks:{}, tuneThread:[], tuneDraft:"", sysPrompt:undefined,
        agentSpec:{name:"", shape:"crown-pebble", tint:"#191c1f", persona:"", personality:"Straight-talking",
               answer:"Short answers", context:["Organisations","Tasks"], skills:["Search records","Summarise activity"], tasks:[]}}),
      openBuilderForAgent: () => this.setState({builderOpen:true, builderMode:"tune", trained:true, training:false, trainPhase:0, briefThread:[], briefDraft:"", briefPicks:{}, tuneThread:[], tuneDraft:"", sysPrompt:undefined,
        agentSpec:{name:activeAgent.name, shape:activeAgent.shape || "crown-pebble", tint:activeAgent.tint || "#191c1f",
               persona:activeAgent.role, personality:"Straight-talking", answer:"Short answers",
               context:["Organisations","Tasks","Invoices"], skills:["Search records","Summarise activity","Draft email"], tasks:[]}}),
      draftAgent: {name:st.agentSpec.name, persona:st.agentSpec.persona,
        shape:st.agentSpec.shape, tint:st.agentSpec.tint, state:"working",
        shapeLabel: (FACE_SHAPES.find(s => s[0] === st.agentSpec.shape) || FACE_SHAPES[0])[1]},
      builderHint: st.builderMode === "tune" ? "TRAINED ON YOUR ONTOLOGY · READY" : "NEW AGENT · NOT SAVED YET",
      isTune: st.builderMode === "tune",
      isNewAgent: st.builderMode !== "tune",
      faceTopStyle: st.builderMode === "tune" ? "margin-top:24px" : "",
      syncStats: [
        {value:"14", label:"ENTITY TYPES"},
        {value:"4,820", label:"RECORDS READ"},
        {value:"2m", label:"LAST SYNC"}
      ],
      sysPrompt: this.systemPrompt(),
      setSysPrompt: (e) => this.setState({sysPrompt:e.target.value}),
      sysMeta: "WRITTEN BY THE AGENT",
      sysTokens: String(Math.max(1, Math.round(this.systemPrompt().length / 4))).replace(/\B(?=(\d{3})+$)/g, ",") + " tokens",
      sysLines: this.systemPrompt().split("\n").length + " lines",
      sysEdited: st.sysPrompt !== undefined && st.sysPrompt !== null,
      sysClean: st.sysPrompt === undefined || st.sysPrompt === null,
      revertPrompt: () => this.setState({sysPrompt:null, tuneThread:[]}),
      retrain: () => this.startTraining(),
      
      
      /* Concrete starting points beat an instruction paragraph — one tap writes
         the line into the prompt the same way typing it would. */
      
      tuneDraft: st.tuneDraft || "",
      setTuneDraft: (e) => this.setState({tuneDraft:e.target.value}),
      onTuneKey: (e) => { if (e.key === "Enter" && !e.shiftKey){ e.preventDefault(); this.sendTune(); } },
      sendTune: () => this.sendTune(),
      
      
      
      setAgentName: (e) => this.setSpec({name:e.target.value}),
      setPersona: (e) => this.setSpec({persona:e.target.value}),
      faceChoices: FACE_SHAPES.map(sh => {
        const on = st.agentSpec.shape === sh[0];
        return {shape:sh[0], label:sh[1], state:"working", tint:st.agentSpec.tint,
          style: "display:flex;align-items:center;justify-content:center;padding:6px;border-radius:8px;cursor:pointer;"
            + "transition:background .2s var(--ease),border-color .2s var(--ease),transform .2s var(--ease);"
            + (on ? "background:var(--accent-faint);border:1px solid var(--accent);transform:translateY(-1px)"
                  : "background:var(--surface);border:1px solid var(--border)"),
          pick: () => this.setSpec({shape:sh[0]})};
      }),
      tintChoices: FACE_TINTS.map(t => {
        const on = st.agentSpec.tint === t[0];
        return {label:t[1],
          style: "width:32px;height:32px;border-radius:var(--r-ctl,11px);cursor:pointer;padding:0;"
            + "background:linear-gradient(160deg," + t[0] + ",#0b0d0f);"
            + "transition:transform .2s var(--ease),border-color .2s var(--ease);"
            + (on ? "border:2px solid var(--accent);transform:scale(1.08)" : "border:1px solid var(--border)"),
          pick: () => this.setSpec({tint:t[0]})};
      }),
      personalities: PERSONALITIES.map(p => ({label:p, style:chip(st.agentSpec.personality === p), pick: () => this.setSpec({personality:p})})),
      answerStyles: ANSWER_STYLES.map(a => ({label:a, style:chip(st.agentSpec.answer === a), pick: () => this.setSpec({answer:a})})),
      /* ---- skills: every registered tool in one list. Context is not a choice —
         an agent reads the whole ontology, and anything with an effect still
         waits for a yes, so grouping by effect earned nothing here. ---- */
      
      
      
      

      /* ---- the brief: you say the job, it asks the follow-ups ---- */
      briefDraft: st.briefDraft || "",
      briefPlaceholder: (st.briefThread || []).length ? "Answer, or add another job" : "What do you want this agent to do?",
      setBriefDraft: (e) => this.setState({briefDraft:e.target.value}),
      onBriefKey: (e) => { if (e.key === "Enter" && !e.shiftKey){ e.preventDefault(); this.sendBrief(); } },
      sendBrief: () => this.sendBrief(),
      briefEmpty: (st.briefThread || []).length === 0,
      briefThread: (st.briefThread || []).map((m, i) => {
        if (m.kind === "card"){
          const q = BRIEF_QUESTIONS[m.q];
          const picks = st.briefPicks[m.q] || [];
          return {isCard:true, isMsg:false, title:q.title, sub:q.sub,
            live: !m.done, answered: m.done === true,
            answerSummary: picks.length ? picks.join(", ") : "Skipped",
            rowStyle: "animation:expandIn .3s var(--ease) both",
            cardStyle: "width:100%;background:var(--surface-strong);border:1px solid var(--border);border-radius:var(--card-r,18px);overflow:hidden;"
              + (m.done ? "opacity:.72" : ""),
            confirmLabel: picks.length ? "Use these " + picks.length : "Skip",
            confirm: () => { if (!m.done) this.confirmBrief(m.q); },
            options: q.options.map((o, oi) => {
              const on = picks.indexOf(o[0]) > -1;
              return {key: String.fromCharCode(65 + oi), label:o[0], meta:o[1],
                style: "display:flex;align-items:center;gap:11px;width:100%;padding:10px 12px;border:0;"
                  + (oi ? "border-top:1px solid var(--border);" : "")
                  + "background:" + (on ? "var(--accent-faint)" : "none") + ";cursor:pointer;text-align:left;"
                  + "transition:background .16s var(--ease)",
                keyStyle: "flex:none;width:20px;height:20px;border-radius:7px;display:flex;align-items:center;justify-content:center;"
                  + "font-family:" + MONO + ";font-size:9.5px;"
                  + (on ? "background:var(--accent-fill,var(--accent));color:var(--on-accent);box-shadow:var(--accent-glow,none)" : "background:var(--surface-2);color:var(--faint)"),
                labelStyle: "display:block;font-size:13px;color:" + (on ? "var(--ink)" : "var(--body)"),
                pick: () => { if (!m.done) this.pickBrief(m.q, o[0]); }};
            })};
        }
        return {isCard:false, isMsg:true, text:m.text,
          rowStyle: "display:flex;justify-content:" + (m.role === "you" ? "flex-end" : "flex-start") + ";animation:expandIn .3s var(--ease) both",
          bubbleStyle: "max-width:82%;padding:10px 14px;border-radius:var(--card-r,18px);font-size:13px;line-height:1.5;"
            + (m.role === "you"
                ? "background:var(--surface-strong);border:1px solid var(--border);color:var(--ink);border-bottom-right-radius:6px"
                : "background:var(--accent-faint);border:1px solid var(--accent-line);color:var(--ink);border-bottom-left-radius:6px")};
      }),
      briefTasks: (st.agentSpec.tasks || []).map((t, i) => ({
        title:t.title, meta:t.meta,
        remove: () => this.setState(prev => ({agentSpec: Object.assign({}, prev.agentSpec,
          {tasks: prev.agentSpec.tasks.filter((_, k) => k !== i)})}))
      })),
      hasTasks: (st.agentSpec.tasks || []).length > 0,
      taskCount: (st.agentSpec.tasks || []).length + " job" + ((st.agentSpec.tasks || []).length === 1 ? "" : "s") + " briefed",

      /* ---- training run ---- */
      trainBg: st.trained ? "var(--accent-faint)" : "var(--surface)",
      trainBorder: st.trained ? "var(--accent-line)" : "var(--border)",
      trainTitle: st.training ? "Training" : st.trained ? "Trained on your ontology" : "Train from the ontology",
      trainBody: st.training
        ? TRAIN_PHASES[Math.min(st.trainPhase || 0, TRAIN_PHASES.length - 1)][0]
        : st.trained
          ? "It read the ontology, then wrote its own system prompt. Retrain after the data moves."
          : "It will read the whole ontology, learn how this business words things, then research and write its own system prompt.",
      trainLabel: st.training ? "Training…" : st.trained ? "Retrain" : "Train agent",
      trainBusy: st.training === true,
      trainIdle: st.training !== true,
      trainPct: Math.round(((st.trainPhase || 0) / TRAIN_PHASES.length) * 100) + "%",
      trainDashStyle: "stroke-dashoffset:" + (145 * (1 - (st.trainPhase || 0) / TRAIN_PHASES.length)).toFixed(1)
        + ";transition:stroke-dashoffset .85s cubic-bezier(.22,.9,.16,1)",
      trainPhaseLabel: st.training
        ? "PHASE " + Math.min((st.trainPhase || 0) + 1, TRAIN_PHASES.length) + " OF " + TRAIN_PHASES.length
        : "READY",
      train: () => this.startTraining(),
      trainSteps: st.trained || st.training,
      trainLog: TRAIN_PHASES.slice(0, st.training ? (st.trainPhase || 0) : TRAIN_PHASES.length).map((p, i) => ({
        text:p[0], meta:p[1], dot:LIME,
        rowStyle: "display:flex;align-items:center;gap:10px;animation:expandIn .28s var(--ease) both"
      })),
      builderFooter: (() => {
        const jobs = (st.agentSpec.tasks || []).length;
        return "Full ontology context · every registered tool · "
          + (jobs ? jobs + " job" + (jobs === 1 ? "" : "s") + " briefed" : "nothing briefed yet")
          + " · anything with an effect waits for your yes";
      })(),
      saveLabel: st.builderMode === "tune" ? "Save changes" : "Create agent",
      saveAgent: () => this.setState(prev => {
        if (prev.builderMode === "tune") return {builderOpen:false};
        const name = prev.agentSpec.name.trim() || "New agent";
        const id = "a" + Date.now();
        return {builderOpen:false, agentId:id,
          agents: [{id, name, initials:prev.agentSpec.initials, bg:prev.agentSpec.bg, role:prev.agentSpec.persona || prev.agentSpec.personality + " · " + prev.agentSpec.answer.toLowerCase(),
            when:"now", preview:"ready when you are.",
            thread:[{kind:"stamp", text:"Just now"},
              {kind:"agent", text: prev.trained
                ? "trained and ready. i read the ontology and wrote my own prompt from it. what should i pick up first?"
                : "created. i have no context yet — train me from the ontology and i'll be useful."}]}].concat(prev.agents)};
      }),
      
      
      
      /* On the dashboard the KPI band is a solid accent field. Running that
         field up behind the nav bar removes the seam between them; the pill
         goes opaque dark so it still reads on the lime. */
      headerFieldStyle: false && page === "Dashboard"
        /* 70px stopped short of the header's real height, so a hairline of page
           background showed between it and the sticky KPI band once scrolled.
           82px clears the header and laps 8px into the band's own padding. */
        ? "position:absolute;left:0;right:0;top:0;height:76px;z-index:3;pointer-events:none;background:var(--accent)"
        : "display:none",
      headerPillStyle: "display:flex;align-items:center;gap:4px;height:54px;padding:5px;box-sizing:border-box;max-width:100%;min-width:0;overflow:hidden;"
        + ((contextNav.length <= 6 && (st.w - (st.railOpen ? 252 : 68) - 12) >= 780) ? "" : "width:fit-content;margin:0 auto;")
        + "background:var(--surface);border:1px solid var(--border);border-radius:999px;"
        + "backdrop-filter:blur(24px) saturate(1.4);-webkit-backdrop-filter:blur(24px) saturate(1.4);"
        + "box-shadow:0 1px 0 rgba(255,255,255,.05) inset,0 10px 30px rgba(0,0,0,.28)",
      
      barOpen: st.barOpen,
      railShut: !st.railOpen,
      
      // One colour from App.tsx repaints the Records wash (and the New record
      // dialog). It is blended into the theme's own --bg, so the same colour
      // reads right in dark and light themes. Unset keeps the theme gradient.
      rootVars: this.props.recordsBackdrop ? (() => {
        const c = this.props.recordsBackdrop;
        const m = (pct) => "color-mix(in oklab, " + c + " " + pct + "%, var(--bg))";
        return {"--hero-grad": "linear-gradient(180deg," + m(10) + " 0%," + m(28) + " 20%," + m(55) + " 42%," + m(90) + " 62%," + m(48) + " 83%," + m(12) + " 100%)"};
      })() : undefined,
      
      railThumbStyle: "position:absolute;z-index:0;pointer-events:none;border-radius:14px;"
        + "background:var(--rail-active,var(--accent-faint));box-shadow:var(--rail-active-ring,inset 0 0 0 1px var(--accent-line));"
        + (st.railThumb
            ? "left:" + st.railThumb.l + "px;top:0;width:" + st.railThumb.w + "px;height:" + st.railThumb.h + "px;"
              + "transform:translateY(" + st.railThumb.t + "px);opacity:1;"
              + (st.railThumbLive ? "transition:transform .55s cubic-bezier(.3,1.25,.4,1),width .3s var(--ease),height .3s var(--ease),left .3s var(--ease),opacity .2s" : "transition:none")
            : "opacity:0"),
      pageDy: (st.navDir === -1 ? "-22px" : "22px"),
      pageSweepEl: React.createElement("span", {key:"sweep" + (st.navSeq || 0), style:{position:"absolute", left:0, right:0, top:0, height:1, zIndex:6, pointerEvents:"none",
        background:"linear-gradient(90deg,transparent,var(--accent) 40%,var(--accent) 60%,transparent)",
        animation:(st.navSeq ? "pageSweep .8s cubic-bezier(.4,0,.2,1) both" : "none"), opacity:(st.navSeq ? 1 : 0)}}),
      // Hover: the dot eases a few px right and deepens; the arrow slips out
      // through its right edge while a twin slides in from the left.
      setBtnIn: () => this.setState({setBtnHover:true}),
      setBtnOut: () => this.setState({setBtnHover:false}),
      // Hover: the dot un-rolls leftward into a darker capsule behind the label,
      // the mixer knobs slide to new levels, one sheen passes, the arrow swaps.
      setDotStyle: "position:absolute;z-index:1;right:5px;top:5px;bottom:5px;border-radius:999px;"
        + "background:var(--accent-soft);box-shadow:inset 0 0 0 1px var(--accent-line);"
        + "width:" + (st.setBtnHover ? "calc(100% - 10px)" : "36px") + ";"
        + "transition:width .62s cubic-bezier(.65,0,.15,1)",
      setSheen: "position:absolute;z-index:1;top:0;bottom:0;left:0;width:45%;pointer-events:none;"
        + "background:linear-gradient(100deg,transparent,rgba(255,255,255,.1),transparent);"
        + "transform:translateX(" + (st.setBtnHover ? "260%" : "-120%") + ") skewX(-18deg);"
        + "transition:" + (st.setBtnHover ? "transform .9s cubic-bezier(.3,0,.2,1) .1s" : "none"),
      setIconStyle: "position:relative;z-index:2;flex:none;overflow:visible;transition:color .4s var(--ease);color:" + (st.setBtnHover ? "var(--accent)" : "var(--dim)"),
      setKnobA: "transition:transform .55s cubic-bezier(.34,1.4,.5,1);transform:translateY(" + (st.setBtnHover ? "-6px" : "0") + ")",
      setKnobB: "transition:transform .55s cubic-bezier(.34,1.4,.5,1) .06s;transform:translateY(" + (st.setBtnHover ? "9px" : "0") + ")",
      setKnobC: "transition:transform .55s cubic-bezier(.34,1.4,.5,1) .12s;transform:translateY(" + (st.setBtnHover ? "-5px" : "0") + ")",
      setArrowA: "position:absolute;left:50%;top:50%;margin:-7.5px 0 0 -7.5px;"
        + "transform:translateX(" + (st.setBtnHover ? "22px" : "0") + ");opacity:" + (st.setBtnHover ? "0" : "1") + ";"
        + "transition:transform .45s cubic-bezier(.5,0,.2,1),opacity .3s var(--ease)",
      setArrowB: "position:absolute;left:50%;top:50%;margin:-7.5px 0 0 -7.5px;"
        + "transform:translateX(" + (st.setBtnHover ? "0" : "-22px") + ");opacity:" + (st.setBtnHover ? "1" : "0") + ";"
        + "transition:transform .45s cubic-bezier(.22,.9,.16,1) " + (st.setBtnHover ? ".08s" : "0s") + ",opacity .3s var(--ease) " + (st.setBtnHover ? ".08s" : "0s"),
      showTeam: (st.w - (st.railOpen ? 252 : 68)) >= 1000 || contextNav.length <= 3,
      showTheme: (st.w - (st.railOpen ? 252 : 68)) >= 820 || contextNav.length <= 3,
      tabPad: (st.w - (st.railOpen ? 252 : 68)) >= 1100 ? "0 18px" : (st.w - (st.railOpen ? 252 : 68)) >= 1000 ? "0 12px" : "0 10px",
      
      tabsLoose: !((st.w - (st.railOpen ? 252 : 68)) < 1000 && contextNav.length >= 4),
      
      tabActiveBg: ((st.w - (st.railOpen ? 252 : 68)) < 1000 && contextNav.length >= 4) ? "var(--surface-2)" : "none",
      searchWrapFlex: (contextNav.length <= 6 && (st.w - (st.railOpen ? 252 : 68) - 12) >= 780) ? "1 1 auto" : "0 0 auto",
      barLabel: st.barOpen ? "Collapse the bar" : "Expand the bar",
      barChevronStyle: "transition:transform .3s var(--ease);transform:rotate(" + (st.barOpen ? "0deg" : "180deg") + ")",
      toggleBar: () => this.setState(prev => ({barOpen: !prev.barOpen})),
      showHint: roomy && st.barOpen,
      
      showProfileText: roomy,
      // Tabs size to their own labels; NavThumb measures, so equal tracks aren't needed.
      navGroupStyle: "position:relative;display:inline-grid;grid-auto-flow:column;grid-auto-columns:max-content;"
        + "width:max-content;max-width:100%;align-items:center;padding:0;flex:" + (contextNav.length <= 3 ? "none" : "0 1 auto") + ";min-width:0;border-radius:999px;"
        + "overflow-x:auto;overflow-y:hidden;scrollbar-width:none;overscroll-behavior-x:contain;"
        + "-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 14px),transparent);mask-image:linear-gradient(90deg,#000 calc(100% - 14px),transparent)",
      // Static look only. NavThumb measures the active tab and writes its own
      // width and offset, so long labels, counts or an overflowing group can't
      // push the pill off the tab it belongs to.
      navThumb: "position:absolute;left:0;top:2px;bottom:2px;width:0;z-index:0;pointer-events:none;border-radius:999px;opacity:0;"
        + "background-color:var(--surface-2);box-shadow:0 1px 0 rgba(255,255,255,.05) inset,0 0 0 1px var(--border),0 1px 3px rgba(0,0,0,.2);"
        + "background-image:linear-gradient(180deg,rgba(255,255,255,.22),rgba(255,255,255,0) 55%);background-blend-mode:overlay;"
        + "transition:transform .46s cubic-bezier(.22,.9,.16,1),width .46s cubic-bezier(.22,.9,.16,1),opacity .2s",
      navThumbKey: contextNav.map(t => (t.active ? "*" : "") + t.label).join("|"),
      
      // The bar is one row: the fewer sub-nav segments a page has, the more of the
      // leftover width the search field takes.
      searchExpanded: contextNav.length <= 6 && (st.w - (st.railOpen ? 252 : 68) - 12) >= 780,
      searchBarStyle: (() => {
        const segs = contextNav.length;
        // No min-width floor: when the sub-nav pill group is wide, the search
        // must be free to shrink rather than overflow its centring parent and
        // slide under the nav.
        const cap = segs <= 2 ? 520 : segs <= 4 ? 440 : 340;
        // A real floor so the label always fits — the sub-nav group is now
        // shrinkable, so this comes out of its slack, not out of an overflow.
        const collapsed = !(segs <= 6 && (st.w - (st.railOpen ? 252 : 68) - 12) >= 780);
        if (collapsed) return "flex:none;width:42px;height:42px;display:flex;align-items:center;justify-content:center;padding:0;margin:0 2px;"
          + "background:var(--track);border:1px solid transparent;border-radius:999px;cursor:pointer;color:var(--body);"
          + "transition:border-color .2s var(--ease),color .2s var(--ease)";
        return "flex:1 1 auto;width:100%;min-width:0;max-width:" + cap + "px;height:42px;"
          + "display:flex;align-items:center;gap:9px;padding:0 6px 0 15px;margin:0 2px;"
          + "background:var(--track);border:1px solid transparent;border-radius:999px;"
          + "box-shadow:0 1px 2px rgba(0,0,0,.22) inset;"
          + "cursor:pointer;color:var(--body);"
          + "transition:border-color .2s var(--ease),color .2s var(--ease),background .2s var(--ease),max-width .3s var(--ease)";
      })(),
        
      
      
      
      
      settingsStyle: railStyle(page === "Settings") + ";animation:railIn .42s var(--ease) 300ms both",
      settingsGlyphStyle: glyphStyle(page === "Settings", st.hovered === "__settings"),
      
      // Live: renderVals reads the real clock every render, and a 1s ticker
      // (Home page only) is what makes a render happen when no one is typing.
      
      
      
      
      closeNotifs: () => this.setState({showNotifs:false}),
      
      homeSubline: "Ask about any record, job or number you can see.",
      approvalsPill: openKeys.length + " APPROVALS · €48,120 HELD",
      
      
      /* Home canvas: a decorative layer the user can switch, scoped to the
         empty chat view so it never competes with a live thread. */
      homeCanvasStyle: (() => {
        const bgs = {
          none: "",
          bloom: "background:radial-gradient(60% 48% at 50% 34%, var(--accent-faint), transparent 72%), radial-gradient(44% 38% at 16% 84%, rgba(255,255,255,.05), transparent 70%)",
          mist: "background:radial-gradient(52% 44% at 24% 22%, rgba(255,255,255,.07), transparent 70%), radial-gradient(56% 46% at 80% 76%, rgba(255,255,255,.05), transparent 72%)",
          grid: "background-image:linear-gradient(var(--border) 1px, transparent 1px),linear-gradient(90deg, var(--border) 1px, transparent 1px);background-size:56px 56px;mask-image:radial-gradient(62% 56% at 50% 46%, #000, transparent 78%);-webkit-mask-image:radial-gradient(62% 56% at 50% 46%, #000, transparent 78%)"
        };
        const key = st.homeBg || "bloom";
        const def = BG_DEFS.find(b => b.id === key);
        const css = def ? def.css : (st.homeBgCss || bgs[key] || "");
        return "position:absolute;top:-24px;bottom:-24px;left:-24px;right:-24px;z-index:0;pointer-events:none;overflow:hidden;opacity:"
          + (st.thread.length ? ".35" : "1") + ";transition:opacity .4s var(--ease);" + css;
      })(),
      
      toggleBgMenu: () => this.setState({bgGalleryOpen:true, bgSpot:null}),
      bgGallery: (() => {
        const cur = st.homeBg || "bloom";
        const ups = st.bgUploads || [];
        const cats = ["Signature","Gradient","Abstract","Your photos"];
        const active = st.bgCat || "Signature";
        const pickOf = (id, css) => () => this.setState({homeBg:id, homeBgCss: css === undefined ? null : css});
        let tiles;
        if (active === "Your photos"){
          tiles = ups.map((u, i) => ({
            id:"up" + i, name:"Photo " + (i + 1), isUpload:false,
            thumbStyle:"position:absolute;inset:0;background:url(" + u + ") center/cover",
            on: cur === "up" + i,
            pick: pickOf("up" + i, "background:url(" + u + ") center/cover")}));
        } else {
          tiles = BG_DEFS.filter(b => b.cat === active).map(b => ({
            id:b.id, name:b.name, isUpload:false,
            thumbStyle:"position:absolute;inset:0;" + b.thumb,
            on: cur === b.id,
            pick: pickOf(b.id, b.css)}));
        }
        const spot = st.bgSpot;
        return {
          open: !!st.bgGalleryOpen,
          close: () => this.setState({bgGalleryOpen:false, bgSpot:null}),
          cats: cats.map(c => ({label:c, count: c === "Your photos" ? String(ups.length) : String(BG_DEFS.filter(b => b.cat === c).length),
            style:"height:30px;padding:0 13px;border-radius:var(--r-ctl,10px);cursor:pointer;font-size:12.5px;white-space:nowrap;transition:background .2s var(--ease),color .2s var(--ease),border-color .2s var(--ease);"
              + (c === active ? "background:var(--accent-fill,var(--accent));border:1px solid transparent;color:var(--on-accent);font-weight:500"
                              : "background:var(--surface-2);border:1px solid var(--border);color:var(--dim)"),
            pick: () => this.setState({bgCat:c})})),
          isPhotos: active === "Your photos",
          emptyPhotos: active === "Your photos" && ups.length === 0,
          tiles,
          currentName: (BG_DEFS.find(b => b.id === cur) || {}).name || (cur.indexOf("up") === 0 ? "Your photo" : "None"),
          heroStyle: "position:absolute;inset:0;" + ((BG_DEFS.find(b => b.id === cur) || {}).thumb || (st.homeBgCss || "background:var(--surface-2)")),
          /* the spotlight follows the pointer across the whole grid */
          onMove: (e) => {
            const r = e.currentTarget.getBoundingClientRect();
            this.setState({bgSpot:{x: Math.round(e.clientX - r.left), y: Math.round(e.clientY - r.top)}});
          },
          onLeave: () => this.setState({bgSpot:null}),
          spotStyle: "position:absolute;inset:0;z-index:2;pointer-events:none;transition:opacity .3s var(--ease);opacity:"
            + (spot ? "1" : "0") + ";background:radial-gradient(220px circle at "
            + (spot ? spot.x + "px " + spot.y + "px" : "50% 50%")
            + ", var(--accent-faint), transparent 72%)",
          onUpload: (e) => { this.readBgFile(e.target.files && e.target.files[0]); e.target.value = ""; },
          onDragOver: (e) => { e.preventDefault(); if (!st.bgDrag) this.setState({bgDrag:true}); },
          onDragLeave: (e) => { e.preventDefault(); this.setState({bgDrag:false}); },
          onDrop: (e) => {
            e.preventDefault();
            this.setState({bgDrag:false});
            const dt = e.dataTransfer;
            const f = dt && dt.files && dt.files[0];
            if (f) this.readBgFile(f);
          },
          dragging: !!st.bgDrag,
          dropHint: st.bgDrag ? "Drop to use this image" : "Click to choose, drop a file, or paste"
        };
      })(),
      bgButtonStyle: "width:26px;height:26px;border:1px solid var(--border);border-radius:var(--r-ctl,9px);background:var(--surface);backdrop-filter:blur(16px);color:var(--faint);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:color .2s var(--ease),border-color .2s var(--ease)",
      bgPlusStyle: "transition:transform .3s var(--ease);" + (st.bgMenuOpen ? "transform:rotate(45deg)" : ""),
      
      greetingPrefix: (() => {
        const h = new Date().getHours();
        const pool = h < 5 ? ["Still up","Burning the midnight oil"]
          : h < 12 ? ["Good morning","Rise and grind","Morning"]
          : h < 17 ? ["Good afternoon","Afternoon"]
          : h < 22 ? ["Good evening","Evening"]
          : ["Still going","Night owl mode"];
        // A goofy one about 1 in 5 times, otherwise the plain greeting — picked
        // once per hour and cached, so it doesn't flip on every re-render.
        const goofy = ["Top of the morning","Look who it is","Well if it isn't"];
        const bucket = Math.floor(Date.now() / 3600000);
        if (this._greetBucket !== bucket) {
          this._greetBucket = bucket;
          const useGoofy = bucket % 5 === 0;
          const list = useGoofy ? pool.concat(goofy) : pool;
          this._greetPick = list[Math.floor(Math.random() * list.length)];
        }
        return this._greetPick;
      })(),
      greetingName: "Mac",
      flipUnits: this.buildFlipUnits(BODY, INK, LIME),
      enterSettings: (e) => this.hover("__settings", "Settings", "", e),
      leaveSettings: () => this.unhover("__settings"),
      // Always mounted: the resting state is the visible one, so the reveal is a
      // transition off a real style rather than an animation supplying the end frame.
      hoverLabel: {
        label: st.hoverLabel, hint: st.hoverHint,
        style: labelStyle(st.hovered !== null, st.hoverTop)
      },
      isChat: page === "Home",
      
      
      
      inboxCount: String(openKeys.length),
      
      
      
      
      heliosEmpty: st.thread.length === 0,
      threadOpen: st.thread.length > 0,
      threadTitle: st.thread.length ? st.thread[0].text : "",
      thread: st.thread.map((m, idx) => {
        const isHelios = m.role === "helios";
        // The reveal is derived from a word counter in state, so a re-render or a
        // hot reload can never leave a message stuck mid-stream.
        const text = isHelios ? m.full : m.text;
        const done = isHelios;

    return {
          isUser: m.role === "user", isHelios, text, typing:false,
          hasTool: isHelios, tool:m.tool || "", toolEffect: m.effect ? "· " + m.effect : "",
          toolDot: m.effect === "write" ? AMBER : LIME,
          hasTable: done && !!m.cols,
          cols:m.cols || [], tableCols: m.cols ? "1.6fr 1fr .85fr .9fr" : "1fr",
          rows:(m.rows || []).map(r => ({cells:r.map((v,i) => ({v, color: i===0 ? INK : DIM, font: i===0 ? "inherit" : MONO}))})),
          hasConfirm: done && m.confirm === true,
          confirmSummary: m.confirmSummary || "",
          confirmHash: "sha256 a4f19c…",
          hasActions: done && m.confirm !== true && !!m.actions,
          actions:(m.actions || []).map(a => ({label:a[0], bg:a[1] ? LIME : "none", color:a[1] ? "var(--on-accent)" : "var(--ink)", border:a[1] ? LIME : "var(--border)", run:() => this.ask(a[0])}))
        };
      }),
      
      
      /* Cards, not rows: each one lands on its own spring, newest first, with
         the status colour carried into a soft glow behind its marker. */
      notifications: notificationFeed.slice(0,5).map((n, i) => ({
        dot:n.dot, text:n.text, when:n.meta, event:n.event,
        cardStyle: "position:relative;flex:none;display:flex;align-items:flex-start;gap:11px;padding:13px 15px;border-radius:var(--r-md,16px);cursor:pointer;"
          + "background:var(--surface);border:1px solid var(--border);"
          + "transition:background .2s var(--ease),border-color .2s var(--ease),transform .22s var(--ease);"
          + "animation:notifCard .62s cubic-bezier(.16,1,.28,1) " + (110 + i * 62) + "ms both",
        washStyle: "position:absolute;left:0;top:0;bottom:0;width:58%;pointer-events:none;border-radius:var(--r-md,16px) 0 0 16px;"
          + "background:linear-gradient(90deg," + n.dot + "14, transparent 78%)",
        dotStyle: "position:relative;width:7px;height:7px;border-radius:50%;flex:none;margin-top:5px;background:" + n.dot
          + ";box-shadow:0 0 10px " + n.dot + ";animation:notifDot .56s cubic-bezier(.16,1,.3,1) " + (200 + i * 62) + "ms both"
      })),
      
      
      
      
      paletteOpen: st.paletteOpen, showNotifs: st.showNotifs,  draft: st.draft,
      
        
          
      
      
      
      
      
      
      
      
      
      setDraft: (e) => this.setState({draft:e.target.value}),
      onDraftKey: (e) => { if (e.key === "Enter" && !e.shiftKey){ e.preventDefault(); if (st.draft.trim()) this.ask(st.draft.trim()); } },
      
      send: () => { if (st.draft.trim()) this.ask(st.draft.trim()); },
      newThread: () => { clearInterval(this._t); this.setState({thread:[], typed:0, draft:""}); },
      
      openPalette: () => this.openPalette(),
      closePalette: () => this.setState({paletteOpen:false, query:"", palSel:0}),
      stop: (e) => e.stopPropagation(),
      theme: st.theme,
      themeLabel: st.theme === "light" ? "Switch to dark" : "Switch to light",
      
      /* The two glyphs are stacked and swapped, so the control shows which way
         it is going rather than redrawing a thin outline. */
      sunStyle: "position:absolute;inset:0;transition:transform .42s cubic-bezier(.16,1,.3,1),opacity .26s var(--ease);"
        + (st.theme === "light" ? "transform:none;opacity:1;color:var(--accent)" : "transform:rotate(-80deg) scale(.55);opacity:0"),
      moonStyle: "position:absolute;inset:0;transition:transform .42s cubic-bezier(.16,1,.3,1),opacity .26s var(--ease);"
        + (st.theme === "light" ? "transform:rotate(80deg) scale(.55);opacity:0" : "transform:none;opacity:1"),
      // Back from light returns to whichever dark theme you were on, not the base "dark".
      toggleTheme: () => this.setState(p => p.theme === "light"
        ? {theme: p.darkTheme || this.props.theme || "harbour"}
        : {theme: "light", darkTheme: p.theme}),
      toggleNotifs: () => this.setState({showNotifs:!st.showNotifs}),
      /* Home: the widget rail steps away once a conversation starts, so the
         thread gets the full width — brought back on demand, not automatically. */
      showRail: st.thread.length === 0 || st.chatRailPinned,
      toggleChatRail: () => this.setState(prev => ({chatRailPinned: !prev.chatRailPinned})),
      chatRailLabel: st.chatRailPinned ? "Hide widgets" : "Widgets",
      chatScrollStyle: st.thread.length
        ? "flex:1 1 0;min-height:0;overflow-y:auto;display:flex;flex-direction:column"
        : "flex:0 0 auto;display:flex;flex-direction:column",
      chatColumnStyle: "position:relative;z-index:1;flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;"
        + "transition:max-width .38s var(--ease)",
      threadWidthStyle: "flex:0 0 auto;width:100%;margin:0 auto;padding:14px 4px 8px;"
        + "max-width:" + (st.thread.length && !st.chatRailPinned ? "880px" : "760px") + ";"
        + "transition:max-width .38s var(--ease)",
      composerTools: [
        {label:"Records", icon:ICONS.navRecords, go: () => this.setState({page:"Records"})},
        {label:"Files", icon:ICONS.files, go: () => this.setState({page:"Records", recSection:"files"})},
        {label:"Agents", icon:ICONS.navAgents, go: () => this.setState({page:"Agents"})}
      ],
      
      
      
      
      composerShellStyle: "background:var(--surface);border:1px solid var(--border);border-radius:var(--card-r,18px);backdrop-filter:blur(22px) saturate(1.35);box-shadow:0 18px 44px rgba(0,0,0,.34);overflow:hidden;transition:border-color .22s var(--ease),box-shadow .3s var(--ease)",
      composerWidthStyle: "width:100%;margin:0 auto;"
        + "max-width:" + (st.thread.length ? (st.chatRailPinned ? "760px" : "880px") : "600px") + ";"
        + "transition:max-width .38s var(--ease)",
      goSettings: () => this.go("Settings")
    };
  }
}
