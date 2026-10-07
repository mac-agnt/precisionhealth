/* Light and dark switch for the portal previews. The portals inherit the app's theme; this lets
   a viewer change it without leaving the portal. The choice is remembered across reloads. */
import { useNav } from "../nav-context";
import { Button } from "../ui";

export function ThemeToggle({ compact }: { compact?: boolean }) {
  const shell = useNav().shell;
  if (!shell || !shell.toggleTheme) return null;
  const light = shell.theme === "light";
  const label = light ? "Dark" : "Light";
  return (
    <Button size="sm" variant="ghost" icon={light ? "moon" : "sun"} onClick={shell.toggleTheme} aria-label={light ? "Switch to dark appearance" : "Switch to light appearance"} title={light ? "Switch to dark" : "Switch to light"}>
      {compact ? null : label}
    </Button>
  );
}
