/* Client journey actions, registered at import time. The onboarding form LINK from the 23 Oct call:
   Precision Health sends the client a link, the client fills in the details. Both steps are
   simulated: nothing is emailed and no outside form exists. "Client completed the form" fills the
   gaps with plainly fictional demo details and saves them, exactly as if the client had submitted. */
import { ONB_KIND_LABEL, onbDetailsErrors, onbMedibaseSteps, registerHandlers } from "../../model";
import type { Ctx, OnbDetails, Onboarding } from "../../model";
import { onbById } from "../Sales/onbSelect";

const slug = (s: string) => s.toLowerCase().replace(/\(fictional\)/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client";
export const onbLinkUrl = (o: Onboarding) => `precisionhealth.ie/onboard/${o.kind === "oh" ? "oh" : "wellness"}/${o.id.toLowerCase()}-${slug(o.details.companyName).slice(0, 24)}`;

/** What the client typed into the form, keeping anything already known. Demo values only. */
export function onbClientAnswers(o: Onboarding): OnbDetails {
  const d: OnbDetails = structuredClone(o.details);
  const co = d.companyName.replace(/\s*\(fictional\)/, "").trim() || "Client";
  const dom = `${slug(co).replace(/-/g, "")}.example.com`;
  const person = (p: OnbDetails["main"], name: string, local: string, phone: string) => ({
    name: p.name.trim() || name, email: p.email.trim() || `${local}@${dom}`, phone: p.phone.trim() || phone,
  });
  if (!d.companyName.trim()) d.companyName = "New client";
  if (!/^\d{4,7}$/.test(d.croNumber.replace(/\s+/g, ""))) d.croNumber = String(600000 + (co.length * 7919) % 99999);
  if (!d.registeredAddress.trim()) d.registeredAddress = "Unit 4, Park West Business Park, Dublin 12";
  if (!d.sites.trim()) d.sites = "Head office";
  if (!d.headcount.trim()) d.headcount = "120";
  d.main = person(d.main, "Aoife Brennan", "aoife.brennan", "+353 1 555 0100");
  d.hr = person(d.hr.name.trim() ? d.hr : d.main, "Aoife Brennan", "hr", "+353 1 555 0101");
  d.finance = person(d.finance, "Accounts team", "accounts", "");
  if (o.kind === "oh") d.referralManager = person(d.referralManager, d.hr.name, "referrals", "");
  if (!d.services.length) d.services = o.kind === "oh" ? ["Pre-employment medicals", "Management referrals"] : ["Health screening days"];
  if (d.invoiceTo === "ap_email" && !d.apEmail.trim()) d.apEmail = `accounts.payable@${dom}`;
  if (!d.notes.trim()) d.notes = "Filled in by the client through the onboarding link.";
  return d;
}

const get = (c: Ctx, id: string) => onbById(c.s, id);

registerHandlers({
  "journey/sendOnbLink": (c, a: { id: string }) => {
    const so = c.staffOnly("send onboarding links"); if (so) return so;
    const o = get(c, a.id); if (!o) return c.fail("Unknown onboarding.");
    if (o.completedAt) return c.fail("This onboarding is finished.");
    const to = o.details.main.email.trim() || o.details.hr.email.trim();
    if (!to) return c.fail("Add the main contact's email first, so the link has somewhere to go.");
    o.clientLink = { url: onbLinkUrl(o), sentAt: c.stamp(), sentTo: to, completedAt: o.clientLink?.completedAt || null };
    c.emit({ verb: "onboarding.link_sent", summary: `${c.first()} sent the ${ONB_KIND_LABEL[o.kind]} onboarding link to ${to} for ${o.details.companyName}. Simulated: nothing was emailed.`, entity: { kind: "onboarding", id: o.id, label: o.details.companyName }, simulated: true, integrationId: "email" });
    return c.ok(`Onboarding link sent to ${to}.`);
  },

  "journey/clientCompletedOnb": (c, a: { id: string }) => {
    const so = c.staffOnly("record the client's form"); if (so) return so;
    const o = get(c, a.id); if (!o) return c.fail("Unknown onboarding.");
    if (o.completedAt) return c.fail("This onboarding is finished.");
    if (!o.clientLink) return c.fail("Send the onboarding link first.");
    if (o.clientLink.completedAt) return c.fail("The client already filled in the form.");
    const d = onbClientAnswers(o);
    const errs = onbDetailsErrors(o.kind, d);
    const first = Object.values(errs)[0];
    if (first) return c.fail(`The form could not be saved: ${first}`);
    o.details = d;
    o.detailsSavedAt = c.stamp();
    o.clientLink.completedAt = c.stamp();
    if (o.kind === "oh") { const steps = onbMedibaseSteps(d); o.medibase.ticks = steps.map((_, i) => o.medibase.ticks[i] || false); }
    c.emit({ verb: "onboarding.client_form_completed", summary: `${d.companyName} filled in the onboarding form: CRO number, contacts${o.kind === "oh" ? ", referral manager" : ""} and where invoices go. Simulated client.`, entity: { kind: "onboarding", id: o.id, label: d.companyName }, simulated: true });
    return c.ok(`${d.companyName} filled in the form. Details saved (simulated client).`);
  },
});

export const journeyAct = {
  sendOnbLink: (id: string) => ({ type: "journey/sendOnbLink", id }),
  clientCompletedOnb: (id: string) => ({ type: "journey/clientCompletedOnb", id }),
};
