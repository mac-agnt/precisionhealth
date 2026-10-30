/* Calendar: one simple place for everything with a date across the business, like Google Calendar.
   Sources are listed in src/ph/model/calendar.ts (CAL_SOURCES). */
import { usePersona } from "../../store";
import { PageHeader, RestrictedNotice } from "../../ui";
import CalendarBoard from "./CalendarBoard";

export default function CalendarPage() {
  const p = usePersona();
  if (p.isParticipant) {
    return (
      <div className="ph-page">
        <PageHeader title="Calendar" />
        <RestrictedNotice title="Not available in the participant preview">The business calendar is for Precision Health staff. Participants see their own appointment in the portal.</RestrictedNotice>
      </div>
    );
  }
  return (
    <div className="ph-page">
      <PageHeader title="Calendar" sub="Clinics, screening days, flu, occupational health, Irish Life Health, sales and tasks in one calendar. Tick what you want to see and select anything to open it." />
      <CalendarBoard />
    </div>
  );
}
