import { runScheduledCleanupAndPullTask } from "../shared/scheduled-scan-cycle.js";

export default async () => runScheduledCleanupAndPullTask({
  cycle: "morning-supabase-cleanup-and-pull",
  targetHour: 8,
  targetMinute: 0,
  guardMinutes: 10
});

// Netlify schedules run in UTC. Running at both possible UTC hours lets the
// Pacific-time guard select 8:00 AM correctly across PST and PDT.
export const config = {
  schedule: "0 15,16 * * 1-5"
};
