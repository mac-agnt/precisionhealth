/* Programmes, Programmes tab: a searchable register with a totals row, and the selected
   programme's detail below it. Selection lives in the URL (?programme=PRG-SISK-26). */
import { useState } from "react";
import type { ProgrammeId } from "../../model";
import { fmtDayMonth, programmeCounts, rate } from "../../model";
import { useNav } from "../../nav-context";
import { usePhState } from "../../store";
import { Avatar, Card, DemoTag, EmptyState, EntityLink, PageHeader, SearchBox } from "../../ui";
import { matchesProgramme, programmeRows } from "./model";
import { ProgrammeDetail } from "./ProgrammeDetail";

export default function Register() {
  const s = usePhState();
  const nav = useNav();
  const [q, setQ] = useState("");
  const all = programmeRows(s);
  const rows = all.filter((r) => matchesProgramme(r, q));
  const param = nav.params.programme;
  const selected: ProgrammeId | null = all.find((r) => r.p.id === param)?.p.id ?? rows[0]?.p.id ?? null;
  const select = (id: string) => nav.setParams({ ...nav.params, programme: id });

  // Totals: unique invited for the full snapshot, sums for a filtered subset.
  const filtered = rows.length !== all.length;
  const T = programmeCounts(s);
  const sum = (k: "invited" | "capacity" | "booked" | "attended" | "released" | "upcoming" | "episodes") => rows.reduce((n, r) => n + r.counts[k], 0);
  const tot = filtered
    ? { invited: sum("invited"), capacity: sum("capacity"), booked: sum("booked"), attended: sum("attended"), released: sum("released"), upcoming: sum("upcoming") }
    : { invited: T.invited, capacity: T.capacity, booked: T.booked, attended: T.attended, released: T.released, upcoming: T.upcoming };
  const clinics = rows.reduce((n, r) => n + r.clinics.total, 0);
  const done = rows.reduce((n, r) => n + r.clinics.past, 0);

  return (
    <div className="ph-page prg-page">
      <PageHeader
        title="Programmes"
        sub="Searchable register of screening programmes. Select one to open its clinics, approved template, invitations, delivery milestones and report snapshots. The client company opens in Records."
        actions={<DemoTag>Fictional programme data</DemoTag>}
      />
      <div className="prg-cq">
        <Card pad={false}>
          <div className="ph-row-flex" style={{ padding: "14px 16px", flexWrap: "wrap", gap: 10 }}>
            <div className="ph-grow" style={{ minWidth: 200 }}>
              <h3 className="ph-h2">Programme register</h3>
              <div className="ph-dim" style={{ fontSize: 12, marginTop: 3 }}>{rows.length} of {all.length} programmes. Client, window, clinics, capacity, bookings, attendance, released reports and owner.</div>
            </div>
            <SearchBox value={q} onChange={setQ} placeholder="Search programme, client, site or owner" width={300} />
          </div>
          {rows.length ? (
            <div className="ph-tablewrap" style={{ borderTop: "1px solid var(--border)" }}>
              <table className="ph-table prg-table" style={{ minWidth: 820 }}>
                <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Programme register</caption>
                <thead>
                  <tr>
                    <th className="prg-sticky">Programme</th>
                    <th>Client</th>
                    <th>Window</th>
                    <th style={{ textAlign: "right" }}>Clinics</th>
                    <th style={{ textAlign: "right" }}>Invited</th>
                    <th style={{ textAlign: "right" }} title="Confirmed bookings, including completed appointments, out of clinic capacity">Booked of capacity</th>
                    <th style={{ textAlign: "right" }}>Attended</th>
                    <th style={{ textAlign: "right" }} title="Released individual reports, out of attended episodes">Released</th>
                    <th>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const c = r.counts;
                    const sel = r.p.id === selected;
                    return (
                      <tr key={r.p.id} className={"ph-row" + (sel ? " sel" : "")} tabIndex={0} aria-selected={sel}
                        onClick={() => select(r.p.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(r.p.id); } }}>
                        <td className="prg-sticky prg-wrap">
                          <span style={{ color: "var(--ink)", fontWeight: 500 }}>{r.p.name}</span>
                          <span className="prg-cell-sub prg-mono">{r.p.id}</span>
                        </td>
                        <td><EntityLink kind="company" id={r.p.clientId}>{r.p.clientName}</EntityLink></td>
                        <td>
                          {fmtDayMonth(r.p.windowStart)} to {fmtDayMonth(r.p.windowEnd)}
                          <span className="prg-cell-sub">{r.win.label}</span>
                        </td>
                        <td className="num">{r.clinics.total}<span className="prg-cell-sub">{r.clinics.past} done</span></td>
                        <td className="num">{c.invited}</td>
                        <td className="num">{c.booked} of {c.capacity}<span className="prg-cell-sub">{rate(c.booked, c.capacity)}</span></td>
                        <td className="num">{c.attended}<span className="prg-cell-sub">{c.upcoming} to attend</span></td>
                        <td className="num">{c.released}<span className="prg-cell-sub">{rate(c.released, c.attended)} of {c.attended}</span></td>
                        <td>
                          <span className="ph-row-flex" style={{ gap: 7 }}>
                            <Avatar name={r.owner?.name || "?"} tint={r.owner?.tint} size={22} />
                            <span>{r.owner?.name || "Owner to confirm"}</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="prg-sticky prg-wrap">{filtered ? `Shown programmes (${rows.length})` : "Current programme snapshot"}</td>
                    <td />
                    <td />
                    <td className="num">{clinics}<span className="prg-cell-sub">{done} done</span></td>
                    <td className="num" title={filtered ? "Sum of the shown rosters" : "Unique eligible people across all rosters"}>{tot.invited}</td>
                    <td className="num">{tot.booked} of {tot.capacity}<span className="prg-cell-sub">{rate(tot.booked, tot.capacity)}</span></td>
                    <td className="num">{tot.attended}<span className="prg-cell-sub">{tot.upcoming} to attend</span></td>
                    <td className="num">{tot.released}<span className="prg-cell-sub">{rate(tot.released, tot.attended)} of {tot.attended}</span></td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <EmptyState title="No programme matches" icon="search">Try a client name such as IBM, a site, or an owner.</EmptyState>
          )}
        </Card>
        {selected ? <ProgrammeDetail pid={selected} /> : null}
      </div>
    </div>
  );
}
