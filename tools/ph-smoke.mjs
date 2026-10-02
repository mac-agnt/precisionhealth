// Loads the Precision Health model through Vite's SSR loader (no new dependency)
// and prints baseline counts. Usage: node tools/ph-smoke.mjs
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const m = await server.ssrLoadModule("/src/ph/model/fixtures/index.ts");
  const t0 = performance.now();
  const s = m.createInitialState();
  console.log("built in", Math.round(performance.now() - t0), "ms");
  const count = (arr, f) => arr.filter(f).length;
  console.log("persons", s.persons.length, "bookings", s.bookings.length, "episodes", s.episodes.length, "obs", s.observations.length, "rows", s.importRows.length, "messages", s.messages.length, "events", s.activity.length);
  console.log("states", {
    released: count(s.episodes, (e) => e.reportState === "released"),
    ready: count(s.episodes, (e) => e.reportState === "ready_for_review"),
    awaiting: count(s.episodes, (e) => e.reportState === "awaiting_results"),
    held: count(s.episodes, (e) => e.reportState === "on_hold"),
  });
  const base = s.importRows.filter((r) => r.batchId === "BATCH-20261002-01");
  console.log("baseline rows", base.length, {
    imported: count(base, (r) => r.state === "imported"), dup: count(base, (r) => r.state === "duplicate"), quarantined: count(base, (r) => r.state === "quarantined"),
    specimens: new Set(base.map((r) => r.episodeId || r.specimenKey)).size,
  });
} finally {
  await server.close();
}
