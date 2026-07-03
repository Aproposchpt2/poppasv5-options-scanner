// POPPA'S Option Scanner v3 — clean-start Schwab pull endpoint.
// Purpose: delete old scanner records, then start a fresh Schwab scanner pull.

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

function baseUrl(req) {
  try {
    const u = new URL(req.url);
    return process.env.URL || process.env.DEPLOY_URL || `${u.protocol}//${u.host}`;
  } catch (_) {
    return process.env.URL || process.env.DEPLOY_URL || "";
  }
}

async function readJson(res) {
  return await res.json().catch(async () => ({ raw: await res.text().catch(() => "") }));
}

export default async (req) => {
  const base = baseUrl(req);
  const url = new URL(req.url);
  const source = url.searchParams.get("source") || "manual-clean-start";
  if (!base) return json({ ok: false, source, error: "No base URL available." }, 500);

  const cleanUrl = `${base}/.netlify/functions/scan-clean-db?source=${encodeURIComponent(source)}`;
  const scanUrl = `${base}/.netlify/functions/scan-build-db?restart=1&source=${encodeURIComponent(source)}`;

  try {
    const cleanRes = await fetch(cleanUrl, { method: "POST", headers: { accept: "application/json" } });
    const cleanBody = await readJson(cleanRes);
    if (!cleanRes.ok || !cleanBody?.ok) {
      return json({ ok: false, source, phase: "cleanup", cleanupStatus: cleanRes.status, cleanup: cleanBody }, 500);
    }

    // Start the scan. The scanner function may continue in batches after this first request.
    const scanRes = await fetch(scanUrl, { method: "POST", headers: { accept: "application/json" } });
    const scanBody = await readJson(scanRes);

    return json({
      ok: scanRes.ok && !!scanBody?.ok,
      source,
      action: "clean_start_schwab_pull",
      cleanup: cleanBody,
      scanStatus: scanRes.status,
      scan: scanBody,
      note: "Old scanner records were deleted before this fresh Schwab pull was started. Continuation batches may keep running until the scan completes."
    }, scanRes.ok ? 200 : 502);
  } catch (err) {
    return json({ ok: false, source, error: String(err?.message || err) }, 500);
  }
};
