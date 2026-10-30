/* Clinics: Overview, Screening days, Schedule, Appointments (with the nurse clinical workspace), bookings board, end of day and the Nurse rota. */
import "./clinics.css";
import Overview from "./Overview";
import Schedule from "./Schedule";
import Appointments from "./Appointments";
import TeamResources from "./TeamResources";
import ScreeningDays from "./ScreeningDays";
import Board from "./Board";
import EndOfDay from "./EndOfDay";
import "./opsActions";

export default function ClinicsPage({ tab }: { tab: string }) {
  switch (tab) {
    case "days": return <ScreeningDays />;
    case "board": return <Board />;
    case "end-of-day": return <EndOfDay />;
    case "schedule": return <Schedule />;
    case "appointments": return <Appointments />;
    case "team-resources": return <TeamResources />;
    default: return <Overview />;
  }
}
