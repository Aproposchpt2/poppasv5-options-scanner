// POPPA'S Option Scanner v3 — Supabase scan control endpoint.

import { createClient } from "@supabase/supabase-js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function baseUrl(req) {
  try {
    const u = new URL(req.url);
    return process.env.URL || process.env.DEPLOY_URL || `${u.protocol}//${u.host}`;
  } catch (_) {
    return process.env.URL || process.env.DEPLOY_URL || "";
  }
}

function ageSeconds(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 1000)) : null;
}

async function latestRun(sb) {
  const { data, error } = await sb.from("scan_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function readState() {
  const sb = supabase();
  const run = await latestRun(sb);
  if (!run) {
    return {
      ok: true,
      action: "status",
      status: "empty",
      scanRunId: null,
      building: false,
      progress: { scanned: 0, total: 0, rows: 0 },
      recommendation: "EMPTY: start a Supabase-backed scan.",
      endpoints: {
        status: "/.netlify/functions/force-scan-db?status=1",
        triggerScan: "/.netlify/functions/force-scan-db",
        scanBuilder: "/.netlify/functions/scan-build-db",
        scanResults: "/.netlify/functions/scan-results-db"
      }
    };
  }

  const updatedAge = ageSeconds(run.updated_at || run.started_at);
  const building = ["running", "stale"].includes(run.status);
  const stale = building && updatedAge !== null && updatedAge > 240;
  let recommendation = "READY: latest Supabase scan is available.";
  if (building && stale) recommendation = "STALE BUILD: continue Supabase scan.";
  else if (building) recommendation = "BUILDING: continue polling Supabase scan.";
  else if (run.status === "failed") recommendation = "FAILED: restart Supabase scan after reviewing error.";

  return {
    ok: true,
    action: "status",
    status: run.status,
    scanRunId: run.id,
    strategy: run.strategy,
    scanMode: run.scan_mode,
    dataSource: run.data_source,
    startedAt: run.started_at,
    updatedAt: run.updated_at,
    completedAt: run.completed_at,
    ageSeconds: updatedAge,
    building,
    stale,
    error: run.error || null,
    universeCount: run.universe_count || 0,
    scanned: run.scanned_count || 0,
    candidateCount: run.candidate_count || 0,
    passCount: run.pass_count || 0,
    pendingIndex: run.pending_index || 0,
    progress: {
      scanned: run.scanned_count || 0,
      total: run.universe_count || 0,
      rows: run.candidate_count || 0
    },
    backendFiltersRemoved: !!run.metadata?.backendFiltersRemoved,
    recommendation,
    endpoints: {
      status: "/.netlify/functions/force-scan-db?status=1",
      triggerScan: "/.netlify/functions/force-scan-db",
      scanBuilder: "/.netlify/functions/scan-build-db",
      scanResults: "/.netlify/functions/scan-results-db"
    }
  };
}

export default async (req) => {
  try {
    const method = req.method || "GET";
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || (method === "POST" ? "start" : "status");

    if (method === "GET" || action === "status") {
      return json(await readState());
    }

    const base = baseUrl(req);
    if (!base) return json({ ok: false, error: "No base URL available to trigger scan-build-db." }, 500);

    const qs = action === "restart" ? "?restart=1" : (action === "continue" ? "?continue=1" : "");
    const endpoint = `${base}/.netlify/functions/scan-build-db${qs}`;
    let trigger;
    try {
      const res = await fetch(endpoint, { method: "POST" });
      let body;
      try { body = await res.json(); } catch (_) { body = await res.text().catch(() => null); }
      trigger = { ok: res.ok, status: res.status, body };
    } catch (err) {
      trigger = { ok: false, error: String(err?.message || err) };
    }

    const state = await readState();
    return json({
      ok: !!trigger?.ok,
      action,
      triggeredEndpoint: endpoint,
      trigger,
      state
    }, trigger?.ok ? 200 : 500);
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err) }, 500);
  }
};
