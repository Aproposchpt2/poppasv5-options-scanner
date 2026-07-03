// POPPA'S Option Scanner GTM — Netlify scheduled scan cycle helper.
// Scope: scheduled wrappers only. This file does not change scanner math,
// Band Intake logic, Schwab OAuth/token logic, Supabase schema, UI, or filtering.

import { getStore } from "@netlify/blobs";

const PACIFIC_TIME_ZONE = "America/Los_Angeles";
const SCAN_STORE_NAME = "poppas-scan";
const SCAN_KEYS_TO_CLEAR = ["latest", "build"];
const FALLBACK_SITE_URL = "https://poppasv2.ai4academy.net";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function logPayload(level, payload) {
  const line = JSON.stringify({
    project: "POPPA'S Option Scanner GTM",
    component: "netlify-scheduled-scan-cycle",
    ...payload
  });

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function pacificParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);

  const out = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    second: Number(out.second),
    dateKey: `${out.year}-${out.month}-${out.day}`,
    label: `${out.year}-${out.month}-${out.day} ${out.hour}:${out.minute}:${out.second} PT`
  };
}

function withinPacificWindow({ targetHour, targetMinute, guardMinutes }, now = new Date()) {
  if (process.env.POPPA_SCHEDULE_FORCE === "true") {
    return { ok: true, forced: true, reason: "POPPA_SCHEDULE_FORCE=true", pacific: pacificParts(now) };
  }

  const pacific = pacificParts(now);
  const currentMinutes = pacific.hour * 60 + pacific.minute;
  const targetMinutes = targetHour * 60 + targetMinute;
  const diff = currentMinutes - targetMinutes;

  return {
    ok: diff >= 0 && diff <= guardMinutes,
    forced: false,
    diffMinutes: diff,
    target: `${String(targetHour).padStart(2, "0")}:${String(targetMinute).padStart(2, "0")} PT`,
    pacific
  };
}

async function clearScanBoard(cycle) {
  const store = getStore(SCAN_STORE_NAME);
  const deletedKeys = [];

  for (const key of SCAN_KEYS_TO_CLEAR) {
    await store.delete(key);
    deletedKeys.push(key);
  }

  logPayload("info", {
    event: "scan-board-cleared",
    cycle,
    store: SCAN_STORE_NAME,
    deletedKeys
  });

  return { store: SCAN_STORE_NAME, deletedKeys };
}

async function dispatchSchwabScanBuild(cycle) {
  const baseUrl = String(process.env.URL || process.env.DEPLOY_URL || FALLBACK_SITE_URL).replace(/\/+$/, "");
  const targetUrl = `${baseUrl}/.netlify/functions/scan-build-background`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-POPPA-Scheduled-Cycle": cycle
      },
      body: JSON.stringify({
        source: "netlify-scheduled-function",
        cycle,
        requestedAt: new Date().toISOString()
      }),
      signal: controller.signal
    });

    const rawText = await response.text();
    let parsedBody = null;
    try { parsedBody = rawText ? JSON.parse(rawText) : null; } catch (_) { parsedBody = rawText ? rawText.slice(0, 500) : null; }

    const result = {
      dispatched: response.ok,
      status: response.status,
      statusText: response.statusText,
      responseBody: parsedBody
    };

    logPayload(response.ok ? "info" : "warn", {
      event: "schwab-scan-build-dispatched",
      cycle,
      ...result
    });

    return result;
  } finally {
    clearTimeout(timeout);
  }
}

export async function runScheduledCleanupTask(config) {
  const guard = withinPacificWindow(config);
  const cycle = config.cycle || "scheduled-cleanup";

  if (!guard.ok) {
    logPayload("info", {
      event: "scheduled-cleanup-skipped-outside-pacific-window",
      cycle,
      guard
    });
    return json({ ok: true, skipped: true, cycle, guard });
  }

  try {
    const cleanup = await clearScanBoard(cycle);
    return json({ ok: true, cycle, guard, cleanup });
  } catch (error) {
    logPayload("error", {
      event: "scheduled-cleanup-failed",
      cycle,
      message: error.message || String(error)
    });
    return json({ ok: false, cycle, error: error.message || String(error) }, 500);
  }
}

export async function runScheduledPullTask(config) {
  const guard = withinPacificWindow(config);
  const cycle = config.cycle || "scheduled-pull";

  if (!guard.ok) {
    logPayload("info", {
      event: "scheduled-pull-skipped-outside-pacific-window",
      cycle,
      guard
    });
    return json({ ok: true, skipped: true, cycle, guard });
  }

  try {
    const dispatch = await dispatchSchwabScanBuild(cycle);
    return json({ ok: dispatch.dispatched, cycle, guard, dispatch }, dispatch.dispatched ? 200 : 502);
  } catch (error) {
    logPayload("error", {
      event: "scheduled-pull-failed",
      cycle,
      message: error.message || String(error)
    });
    return json({ ok: false, cycle, error: error.message || String(error) }, 500);
  }
}

export async function runScheduledCleanupAndPullTask(config) {
  const guard = withinPacificWindow(config);
  const cycle = config.cycle || "scheduled-cleanup-and-pull";

  if (!guard.ok) {
    logPayload("info", {
      event: "scheduled-cleanup-and-pull-skipped-outside-pacific-window",
      cycle,
      guard
    });
    return json({ ok: true, skipped: true, cycle, guard });
  }

  try {
    const cleanup = await clearScanBoard(cycle);
    const dispatch = await dispatchSchwabScanBuild(cycle);
    return json({ ok: dispatch.dispatched, cycle, guard, cleanup, dispatch }, dispatch.dispatched ? 200 : 502);
  } catch (error) {
    logPayload("error", {
      event: "scheduled-cleanup-and-pull-failed",
      cycle,
      message: error.message || String(error)
    });
    return json({ ok: false, cycle, error: error.message || String(error) }, 500);
  }
}
