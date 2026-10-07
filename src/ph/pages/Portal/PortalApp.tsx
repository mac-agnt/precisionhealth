/* The participant-facing app inside the preview frame (S02 to S04, S10). At desktop width a left
   sidebar holds the navigation; on tablet and phone the navigation sits under the header. Layout
   follows the frame's measured width, so it works at 375px with no horizontal scroll. */
import { usePhState } from "../../store";
import { BrandLogo } from "../../shell/Brand";
import { Avatar, DemoTag, EmptyState, Icon } from "../../ui";
import { useMeasure } from "../Participants/shared";
import { AccountView } from "./Account";
import { AppointmentsView } from "./Appointments";
import { PORTAL_VIEWS, participantDetails, portalData, savedAnswers } from "./data";
import type { PortalData, PortalView, ReportDelivery } from "./data";
import { OverviewView } from "./Overview";
import { CodeEntry, QuestionnaireView } from "./Onboarding";
import { ResultsView } from "./Results";

export type Breakpoint = "phone" | "tablet" | "desktop";

export function PortalApp({ personId, signedIn, onSignIn, onSignOut, view, setView, delivery, setDelivery }: {
  personId: string;
  signedIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  view: PortalView;
  setView: (v: PortalView) => void;
  delivery: ReportDelivery;
  setDelivery: (v: ReportDelivery) => void;
}) {
  const state = usePhState();
  const d = portalData(state, personId);
  const [ref, width] = useMeasure<HTMLDivElement>();
  const bp: Breakpoint = !width || width < 560 ? "phone" : width < 900 ? "tablet" : "desktop";
  if (!d) {
    return (
      <div ref={ref} className="pp-app">
        <EmptyState title="Unknown participant" icon="user">No synthetic participant has the ID {personId}.</EmptyState>
      </div>
    );
  }
  const side = signedIn && bp === "desktop";
  const nav = (cls: string) => (
    <nav className={cls} aria-label="Portal sections">
      {PORTAL_VIEWS.map((v) => (
        <button key={v.id} type="button" className="pp-nav-btn" aria-current={view === v.id ? "page" : undefined} onClick={() => setView(v.id)}>
          <Icon name={v.icon} size={14} />{v.label}
        </button>
      ))}
    </nav>
  );
  return (
    <div ref={ref} className={`pp-app pp-bp-${bp}${side ? " pp-with-side" : ""}`} data-bp={bp} data-width={width}>
      {side ? (
        <aside className="pp-sidebar">
          <BrandLogo height={36} />
          <div className="pp-sidebar-sub">Screening platform</div>
          <div className="pp-eyebrow" style={{ margin: "22px 0 8px" }}>Your screening</div>
          {nav("pp-sidenav")}
          <div className="pp-sidebar-foot">
            <strong>Your information is private</strong>
            <span>Only you and authorised care staff can see your results.</span>
          </div>
        </aside>
      ) : null}
      <div className="pp-body">
        <Header d={d} signedIn={signedIn} bp={bp} side={side} />
        {signedIn && !side ? nav("pp-nav") : null}
        {!signedIn ? (
          <CodeEntry d={d} onAccepted={() => { onSignIn(); setView(d.active || d.attended.length || d.membership?.questionnaire === "complete" ? "overview" : "questionnaire"); }} />
        ) : view === "appointments" ? <AppointmentsView d={d} go={setView} />
          : view === "questionnaire" ? <QuestionnaireView d={d} go={setView} />
            : view === "results" ? <ResultsView d={d} compact={bp === "phone"} delivery={delivery} go={setView} />
              : view === "account" ? <AccountView d={d} delivery={delivery} setDelivery={setDelivery} onSignOut={onSignOut} />
                : <OverviewView d={d} go={setView} />}
        <footer className="pp-foot">
          <span>Fictional design data. No clinical guidance or live processing. Messages are simulated and nothing is sent. The portal shows only this participant's own records.</span>
          <span>Precision Health · Screening platform</span>
        </footer>
      </div>
    </div>
  );
}

function Header({ d, signedIn, bp, side }: { d: PortalData; signedIn: boolean; bp: Breakpoint; side: boolean }) {
  const det = participantDetails(d, savedAnswers(d.membership));
  const name = `${det.first} ${det.last}`;
  return (
    <header className="pp-head">
      {side ? null : <BrandLogo height={bp === "phone" ? 28 : 32} />}
      <div className="ph-grow pp-crumb" style={{ minWidth: 0 }}>
        <span className="pp-crumb-a">Participant portal</span>
        {bp === "phone" ? null : <><span aria-hidden="true">/</span><span>Precision Health</span></>}
      </div>
      {signedIn ? (
        <div className="pp-row" style={{ gap: 9, flex: "none" }}>
          {bp === "phone" ? null : (
            <div className="pp-head-name">
              <span style={{ color: "var(--ink)", fontSize: 13, fontWeight: 600 }}>{name}</span>
              <span className="pp-small">Participant</span>
            </div>
          )}
          <Avatar name={name} size={30} />
        </div>
      ) : <DemoTag>Preview</DemoTag>}
    </header>
  );
}
