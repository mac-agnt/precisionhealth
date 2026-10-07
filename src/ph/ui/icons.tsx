import type { CSSProperties } from "react";

/* Stroke glyphs on a 24x24 grid, in the same hand-authored style as the Pulse rail icons. */
export const GLYPHS = {
  check: "M5 12.5l4.2 4.2L19 7",
  alert: "M12 4.5 3.5 19h17L12 4.5Z M12 10v4.2 M12 16.8h.01",
  x: "M6 6l12 12 M18 6 6 18",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 11v5.2 M12 7.8h.01",
  dot: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 7v5.2l3.2 1.9",
  calendar: "M8 4v3 M16 4v3 M4.5 9.5h15 M6.4 6h11.2A1.9 1.9 0 0 1 19.5 8v10a1.9 1.9 0 0 1-1.9 1.9H6.4A1.9 1.9 0 0 1 4.5 18V8A1.9 1.9 0 0 1 6.4 6Z",
  user: "M12 12.5a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z M5 20.2c.9-3.1 3.6-4.9 7-4.9s6.1 1.8 7 4.9",
  users: "M9 12a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 12Z M16.5 12.5a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z M2.6 19.6c.8-2.8 3.2-4.4 6.4-4.4s5.6 1.6 6.4 4.4 M17 15.4c2.2.4 3.7 1.8 4.3 4.2",
  flask: "M9.5 3.5h5 M10.5 3.5v5.2L5.3 17.6A2 2 0 0 0 7 20.5h10a2 2 0 0 0 1.7-2.9l-5.2-8.9V3.5 M8.2 14.2h7.6",
  file: "M6.4 3.6h7.4l4.2 4.2v12.6H6.4V3.6Z M13.4 3.8v4.2h4.2 M9 12.4h6 M9 16h4",
  chart: "M4.5 19.5V13 M9.7 19.5V7.5 M14.9 19.5v-8 M20 19.5V5",
  lock: "M6.5 10.5h11a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19v-7a1.5 1.5 0 0 1 1.5-1.5Z M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3",
  shield: "M12 3.6 19.5 6v6.1c0 4-3.1 6.9-7.5 8.3-4.4-1.4-7.5-4.3-7.5-8.3V6L12 3.6Z M9.2 12.2l2 2 3.6-3.7",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  chevronRight: "m9 6 6 6-6 6",
  chevronDown: "m6 9 6 6 6-6",
  chevronLeft: "m15 6-6 6 6 6",
  search: "m21 21-4.3-4.3 M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0",
  plus: "M12 5v14 M5 12h14",
  print: "M7 9V4h10v5 M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19 17h-2 M7 14h10v6H7v-6Z",
  refresh: "M20 11a8 8 0 0 0-14.5-3.7 M4 4v4.5h4.5 M4 13a8 8 0 0 0 14.5 3.7 M20 20v-4.5h-4.5",
  send: "M3.5 12 20.5 4 16 20l-3.4-6.6L3.5 12Z",
  mail: "M4 7.2 12 13 20 7.2 M4 7.2v10.6h16V7.2 M4 7.2 8.5 4h7L20 7.2",
  phone: "M6.5 4.5h3l1.5 4-2 1.3a10.5 10.5 0 0 0 5.2 5.2l1.3-2 4 1.5v3a2 2 0 0 1-2 2A14.5 14.5 0 0 1 4.5 6.5a2 2 0 0 1 2-2Z",
  sms: "M4.5 5.5h15a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H10l-4 3.5V16.5H4.5A1.5 1.5 0 0 1 3 15V7a1.5 1.5 0 0 1 1.5-1.5Z",
  pin: "M12 21s6.5-5.6 6.5-11a6.5 6.5 0 1 0-13 0C5.5 15.4 12 21 12 21Z M12 12.8a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z",
  edit: "M4 20h4L19 9a2.4 2.4 0 0 0-3.4-3.4L4.6 16.6V20Z",
  filter: "M4 6h16 M7 12h10 M10 18h4",
  list: "M4.5 6.5h15 M4.5 12h15 M4.5 17.5h15",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z M12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z",
  flag: "M5 21V4 M5 5h12l-2 4 2 4H5",
  grip: "M9 6h.01 M15 6h.01 M9 12h.01 M15 12h.01 M9 18h.01 M15 18h.01",
  up: "M12 19V5 M5 12l7-7 7 7",
  down: "M12 5v14 M5 12l7 7 7-7",
  home: "M12 3.2 3.6 9.1v10a1.5 1.5 0 0 0 1.5 1.5h13.8a1.5 1.5 0 0 0 1.5-1.5v-10L12 3.2Z",
  layers: "M12 4 3.5 8.5 12 13l8.5-4.5L12 4Z M3.5 12.5 12 17l8.5-4.5 M3.5 16.5 12 21l8.5-4.5",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M12 2.5v2 M12 19.5v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M2.5 12h2 M19.5 12h2 M4.2 19.8l1.4-1.4 M18.4 5.6l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.4A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z",
} as const;
export type GlyphName = keyof typeof GLYPHS;

export function Icon({ name, size = 15, stroke = 1.7, style, className }: { name: GlyphName; size?: number; stroke?: number; style?: CSSProperties; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", ...style }} className={className}>
      <path d={GLYPHS[name]} />
    </svg>
  );
}
