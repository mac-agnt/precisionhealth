/* Participants module: Directory, Screening History and Communications. Every list and count
   comes from the shared store. Role checks re-filter live when the persona changes. */
import { useNav } from "../../nav-context";
import { usePersona } from "../../store";
import { Button, PageHeader, RestrictedNotice } from "../../ui";
import Communications from "./Communications";
import Directory from "./Directory";
import History from "./ScreeningHistory";

export default function ParticipantsPage({ tab }: { tab: string }) {
  const p = usePersona();
  const nav = useNav();
  if (p.isParticipant) {
    return (
      <div className="ph-page">
        <PageHeader title="Participants" />
        <RestrictedNotice title="Staff screen">
          A participant sees only their own released data, in the participant portal preview.
          <div style={{ marginTop: 10 }}><Button size="sm" icon="user" onClick={() => nav.openPortal()}>Open the portal preview</Button></div>
        </RestrictedNotice>
      </div>
    );
  }
  if (tab === "screening-history") return <History />;
  if (tab === "communications") return <Communications />;
  return <Directory />;
}
