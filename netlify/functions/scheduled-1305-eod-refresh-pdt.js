// POPPA'S scheduled EOD refresh wrapper — 1:05 PM Pacific during PDT.
// Netlify cron runs in UTC: 20:05 UTC = 1:05 PM PDT.

import { runScheduledCleanupAndPullTask } from "../shared/scheduled-scan-cycle.js";

export default async () => runScheduledCleanupAndPullTask({
  cycle: "1305-pt-eod-cleanup-and-schwab-pull",
  targetHour: 13,
  targetMinute: 5,
  guardMinutes: 8
});

export const config = {
  schedule: "5 20 * * *"
};
