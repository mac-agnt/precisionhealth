/* One-click "Create programme" for a finished onboarding (Sales, Onboarding, Done). Opens + New
   programme prefilled from the onboarding, or the programme once it exists. */
import type { Onboarding } from "../../model";
import { retCompanyKey } from "../../model";
import { useNav } from "../../nav-context";
import { usePhState } from "../../store";
import { Button } from "../../ui";
import { newProgrammeLink } from "./progModel";

export function CreateProgrammeButton({ o }: { o: Onboarding }) {
  const s = usePhState();
  const nav = useNav();
  const name = retCompanyKey(o.details.companyName);
  const made = s.programmes.filter((p) => p.setup?.onboardingId === o.id || (name && retCompanyKey(p.clientName) === name)).pop();
  if (made) return <Button icon="arrow" onClick={() => nav.go({ page: "Programmes", tab: "programmes", params: { programme: made.id } })}>Open {made.name}</Button>;
  return <Button variant="primary" icon="plus" onClick={() => nav.go(newProgrammeLink(`onb:${o.id}`))}>Create programme</Button>;
}
