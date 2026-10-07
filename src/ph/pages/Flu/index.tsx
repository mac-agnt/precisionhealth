/* Placeholder from the scaffold. The owning build replaces this file. */
import { Card, EmptyState, PageHeader } from "../../ui";

export default function Flu({ tab }: { tab: string }) {
  return (
    <div className="ph-page">
      <PageHeader title="Flu" sub={`Tab: ${tab}`} />
      <Card pad={false}><EmptyState title="Being built">This module is being built from Stephen's operations walkthrough.</EmptyState></Card>
    </div>
  );
}
