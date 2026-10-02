/* Temporary stand-in while a module is being built. Replaced by the real page. */
import { PAGE_BY_ID, tabLabel } from "../model";
import type { PageId } from "../model";
import { Card, EmptyState, PageHeader } from "../ui";

export default function Placeholder({ page, tab }: { page: PageId; tab: string }) {
  return (
    <div className="ph-page">
      <PageHeader title={`${PAGE_BY_ID[page].label}: ${tabLabel(page, tab)}`} sub="This screen is being built." />
      <Card pad={false}><EmptyState title="Under construction">The data model behind this screen is ready. The interface lands next.</EmptyState></Card>
    </div>
  );
}
