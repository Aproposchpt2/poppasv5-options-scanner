// POPPA'S Option Scanner v3 — Supabase scan-cycle cleanup.
// Marks unfinished prior runs as failed while preserving rows for timing and audit history.
// No Netlify Blob access and no Supabase schema changes.

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return { url: url.replace(/\/$/, ""), key };
}

async function sbFetch(path, options = {}) {
  const { url, key } = config();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text().catch(() => "");
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path} failed ${response.status}: ${text}`);
  return text ? JSON.parse(text) : [];
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    const cycle = url.searchParams.get("cycle") || "scheduled-db-cleanup";
    const now = new Date().toISOString();

    const active = await sbFetch("scan_runs?select=id,status,scanned_count,pending_index,universe_count,started_at,updated_at&status=in.(running,stale)&order=started_at.desc");

    let updated = [];
    if (Array.isArray(active) && active.length) {
      updated = await sbFetch("scan_runs?status=in.(running,stale)&select=id,status,scanned_count,pending_index,universe_count,started_at,updated_at", {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          status: "failed",
          updated_at: now,
          completed_at: now,
          error: `Failed by fresh Supabase scan cycle cleanup: ${cycle}`
        })
      });
    }

    return json({
      ok: true,
      cycle,
      cleanupMode: "mark-incomplete-runs-failed",
      activeRunsFound: Array.isArray(active) ? active.length : 0,
      runsUpdated: Array.isArray(updated) ? updated.length : 0,
      candidateRowsDeleted: 0,
      historyPreserved: true,
      blobUsed: false,
      cleanedAt: now
    });
  } catch (error) {
    return json({ ok: false, error: error.message || String(error), blobUsed: false }, 500);
  }
};