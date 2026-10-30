/* The client (HR) portal for a client created on the Portals page, before any screening days exist.
   Same look as the programme portal: a welcome, the four counts at zero, the invite link and code to
   share, and where screening dates will appear. Aggregate only, no names. */
import { useState } from "react";
import { BRAND, fmtDate } from "../../model";
import type { ClientPortalRec } from "../../model";
import { BrandLogo } from "../../shell/Brand";
import { Avatar, Button, Card, Icon, Pill } from "../../ui";
import { useMeasure } from "../Participants/shared";
import { announcementText } from "../ClientPortal/data";

export function NewClientApp({ portal }: { portal: ClientPortalRec }) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [copied, setCopied] = useState<string | null>(null);
  const bp = !width || width < 560 ? "phone" : width < 900 ? "tablet" : "desktop";
  const text = announcementText({
    client: portal.company.replace(/\s*\(fictional\)/i, ""), window: "the dates we will share shortly", place: "your workplace", link: portal.link, code: portal.code, minutes: 15,
    sender: portal.hrName, role: "HR", support: BRAND.email,
  });
  const tiles = [
    { label: "Invited", sub: "Employees given your code" }, { label: "Booked", sub: "Appointments made" },
    { label: "Attended", sub: "Screened on the day" }, { label: "Reports released", sub: "Ready in their portal" },
  ];
  return (
    <div ref={ref} className={`pp-app cp-app pp-bp-${bp}`} data-bp={bp}>
      <div className="pp-body">
        <header className="pp-head">
          <BrandLogo height={bp === "phone" ? 28 : 32} />
          <div className="ph-grow pp-crumb" style={{ minWidth: 0 }}>
            <span className="pp-crumb-a">Client portal</span>
            {bp === "phone" ? null : <><span aria-hidden="true">/</span><span>{portal.company}</span></>}
          </div>
          <div className="pp-row" style={{ gap: 9, flex: "none" }}>
            {bp === "phone" ? null : <div className="pp-head-name"><span style={{ color: "var(--ink)", fontSize: 13, fontWeight: 600 }}>{portal.hrName}</span><span className="pp-small">HR contact</span></div>}
            <Avatar name={portal.hrName} size={30} />
          </div>
        </header>
        <main className="pp-main">
          {portal.status === "draft" ? (
            <div className="cp-banner" role="note"><Icon name="info" size={15} /><span><strong>Draft.</strong> Precision Health has not put this portal live yet. Your code works once it is live.</span></div>
          ) : (
            <div className="cp-banner" role="note"><Icon name="shield" size={15} /><span><strong>Aggregate view. Your organisation never sees individual results.</strong> There is no list of names and no way to drill down to a person.</span></div>
          )}
          <div>
            <div className="pp-eyebrow">Welcome, {portal.hrName.split(" ")[0]}</div>
            <h1 className="pp-title">{portal.programmeName}</h1>
            <p className="pp-lead">Set up on {fmtDate(portal.createdAt)}. Share the link and code below with your team. Counts update live as people book and attend.</p>
          </div>
          <div className="cp-tiles">
            {tiles.map((t) => (
              <div key={t.label} className="cp-tile">
                <div className="pp-eyebrow">{t.label}</div>
                <div className="cp-tile-value">0</div>
                <div className="pp-small">{t.sub}</div>
              </div>
            ))}
          </div>
          <div className="pp-grid pp-grid-2">
            <Card>
              <h2 className="pp-h3">Booking link and code <Pill tone={portal.status === "live" ? "ok" : "warn"} icon={null}>{portal.status === "live" ? "Live" : "Draft"}</Pill></h2>
              <div className="cp-code" aria-label="Invitation code">{portal.code}</div>
              <div className="cp-link">{portal.link}</div>
              <p className="pp-small" style={{ margin: "8px 0 0" }}>Fictional address: the link does not open.</p>
              <div className="pp-wrap" style={{ marginTop: 12 }}>
                <Button icon="link" onClick={() => setCopied("link")}>Copy link</Button>
                <Button onClick={() => setCopied("code")}>Copy code</Button>
              </div>
              {copied ? <p className="pp-small" role="status" style={{ margin: "8px 0 0" }}>Copied (simulated). In the live portal the {copied} goes to your clipboard.</p> : null}
            </Card>
            <Card>
              <h2 className="pp-h3">Screening dates</h2>
              <p className="pp-small" style={{ margin: 0 }}>Precision Health will publish your screening days here, with the room and times, as soon as they are agreed with you.</p>
              <hr className="pp-hr" />
              <h3 className="pp-h3">Message for your team</h3>
              <textarea className="ph-input" readOnly rows={7} value={text} style={{ width: "100%", fontSize: 12 }} aria-label="Announcement text" />
            </Card>
          </div>
        </main>
        <footer className="pp-foot">
          <span>Fictional design data. Aggregate figures only.</span>
          <span>Precision Health · Client portal</span>
        </footer>
      </div>
    </div>
  );
}
