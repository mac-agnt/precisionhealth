/* Clinics: Overview, Schedule, Appointments (with the nurse clinical workspace) and Team and resources. */
import "./clinics.css";
import Overview from "./Overview";
import Schedule from "./Schedule";
import Appointments from "./Appointments";
import TeamResources from "./TeamResources";
import ScreeningDays from "./ScreeningDays";

export default function ClinicsPage({ tab }: { tab: string }) {
  switch (tab) {
    case "days": return <ScreeningDays />;
    case "schedule": return <Schedule />;
    case "appointments": return <Appointments />;
    case "team-resources": return <TeamResources />;
    default: return <Overview />;
  }
}
