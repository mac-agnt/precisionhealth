/* One row of filters above the calendar: type, client, person, status and a search. Every choice is
   a URL param (types, clients, people, status, q), the same ones the left panel uses, so a link opens
   the same view and the two always agree. */
import { useEffect, useState } from "react";
import type { CalEvent, CalFilter, CAL_GROUPS } from "../../model";
import { calClients } from "../../model";
import { usePhState } from "../../store";
import { SearchBox, Select } from "../../ui";

export function CalFilterRow({ f, groupsAll, inRange, scoped, set, narrow }: {
  f: CalFilter; groupsAll: typeof CAL_GROUPS; inRange: CalEvent[]; scoped: CalEvent[]; set: (p: Record<string, string | null>) => void; narrow: boolean;
}) {
  const state = usePhState();
  const [q, setQ] = useState(f.q);
  useEffect(() => { setQ(f.q); }, [f.q]);
  useEffect(() => {
    if (q === f.q) return;
    const h = window.setTimeout(() => set({ q: q || null, ev: null }), 220);
    return () => window.clearTimeout(h);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const typeValue = f.groups.length === 1 ? f.groups[0] : f.groups.length === groupsAll.length ? "all" : "mixed";
  const clients = calClients(inRange.length ? inRange : scoped);
  for (const c of f.clients) if (!clients.some((x) => x.name === c)) clients.push({ name: c, n: 0 });
  const ids = new Set<string>(scoped.flatMap((e) => e.staffIds));
  const people = state.staff.filter((s) => ids.has(s.id));
  return (
    <div className="cal-frow" role="group" aria-label="Filters">
      {groupsAll.length > 1 ? (
        <Select aria-label="Type" value={typeValue} onChange={(e) => set({ types: e.target.value === "all" ? groupsAll.map((g) => g.id).join(",") : e.target.value === "mixed" ? null : e.target.value, ev: null })} style={{ width: 150 }}>
          <option value="all">All types</option>
          {typeValue === "mixed" ? <option value="mixed">{f.groups.length} types</option> : null}
          {groupsAll.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </Select>
      ) : null}
      <Select aria-label="Client" value={f.clients.length === 1 ? f.clients[0] : f.clients.length ? "many" : ""} onChange={(e) => set({ clients: e.target.value === "many" ? f.clients.join(",") : e.target.value || null, ev: null })} style={{ width: 160 }}>
        <option value="">Every client</option>
        {f.clients.length > 1 ? <option value="many">{f.clients.length} clients</option> : null}
        {clients.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
      </Select>
      <Select aria-label="Person" value={f.people.length === 1 ? f.people[0] : f.people.length ? "many" : ""} onChange={(e) => set({ people: e.target.value === "many" ? f.people.join(",") : e.target.value || null, ev: null })} style={{ width: 150 }}>
        <option value="">Everyone</option>
        {f.people.length > 1 ? <option value="many">{f.people.length} people</option> : null}
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
      <Select aria-label="Status" value={f.status || ""} onChange={(e) => set({ status: e.target.value || null, ev: null })} style={{ width: 124 }}>
        <option value="">Any status</option>
        <option value="todo">To do</option>
        <option value="done">Done</option>
      </Select>
      {narrow ? null : <SearchBox value={q} onChange={setQ} placeholder="Search the calendar" width={170} />}
    </div>
  );
}
