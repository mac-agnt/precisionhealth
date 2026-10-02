/* The participant-facing app inside the preview frame: header, light navigation
   (Overview, Appointments, Questionnaire, My Results, Account) and the views. Its layout
   follows the frame's measured width, so it works at 375px with no horizontal scroll. */
import { usePhState } from "../../store";
import { BrandLogo } from "../../shell/Brand";
import { Avatar, DemoTag, EmptyState, Icon } from "../../ui";
import { useMeasure } from "../Participants/shared";
import { AccountView } from "./Account";
import { AppointmentsView } from "./Appointments";
import { PORTAL_VIEWS, portalData } from "./data";
import type { PortalData, PortalView } from "./data";
import { OverviewView } from "./Overview";
import { CodeEntry, QuestionnaireView } from "./Onboarding";
import { ResultsView } from "./Results";

export type Breakpoint = "phone" | "tablet" | "desktop";

export function PortalApp({ personId, signedIn, onSignIn, onSignOut, view, setView }: {
  personId: string;
  signedIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  view: PortalView;
  setView: (v: PortalView) => void;
}) {
  const state = usePhState();
  const d = portalData(state, personId);
  const [ref, width] = useMeasure<HTMLDivElement>();
  const bp: Breakpoint = !width || width < 560 ? "phone" : width < 880 ? "tablet" : "desktop";
  if (!d) {
    return (
      <div ref={ref} className="pp-app">
        <EmptyState title="Unknown participant" icon="user">No synthetic participant has the ID {personId}.</EmptyState>
      </div>
    );
  }
  return (
    <div ref={ref} className={`pp-app pp-bp-${bp}`} data-bp={bp} data-width={width}>
      <Header d={d} signedIn={signedIn} bp={bp} />
      {!signedIn ? (
        <CodeEntry d={d} onAccepted={() => { onSignIn(); setView(d.membership?.questionnaire === "complete" ? "overview" : "questionnaire"); }} />
      ) : (
        <>
          <nav className="pp-nav" aria-label="Portal sections">
            {PORTAL_VIEWS.map((v) => (
              <button key={v.id} type="button" className="pp-nav-btn" aria-current={view === v.id ? "page" : undefined} onClick={() => setView(v.id)}>
                <Icon name={v.icon} size={13} />{v.label}
              </button>
            ))}
          </nav>
          {view === "appointments" ? <AppointmentsView d={d} go={setView} />
            : view === "questionnaire" ? <QuestionnaireView d={d} go={setView} />
              : view === "results" ? <ResultsView d={d} />
                : view === "account" ? <AccountView d={d} onSignOut={onSignOut} />
                  : <OverviewView d={d} go={setView} />}
        </>
      )}
      <footer className="pp-foot">
        Precision Health participant portal preview. Fictional participant and synthetic data. Messages are simulated and nothing is sent. The portal shows only this participant's own records, never anyone else's or an employer list.
      </footer>
    </div>
  );
}

function Header({ d, signedIn, bp }: { d: PortalData; signedIn: boolean; bp: Breakpoint }) {
  const name = `${d.person.given} ${d.person.family}`;
  return (
    <header className="pp-head">
      <BrandLogo height={bp === "phone" ? 30 : 34} />
      <div className="ph-grow" style={{ minWidth: 0 }}>
        <div style={{ color: "var(--ink)", fontWeight: 600, fontSize: 14, lineHeight: 1.2 }}>My screening</div>
        <div className="pp-small pp-hide-phone">Participant portal</div>
      </div>
      {signedIn ? (
        <div className="pp-row" style={{ gap: 9, flex: "none" }}>
          <div className="pp-head-name">
            <span style={{ color: "var(--ink)", fontSize: 13 }}>{bp === "phone" ? d.person.given : name}</span>
            <span className="pp-small">Fictional participant</span>
          </div>
          {bp === "phone" ? null : <Avatar name={name} size={30} />}
        </div>
      ) : <DemoTag>Preview</DemoTag>}
    </header>
  );
}
