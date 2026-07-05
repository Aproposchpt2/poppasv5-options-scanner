function json(body, status = 410) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

export default async () => json({
  ok: false,
  available: false,
  function: "scan-build-db",
  environment: "poppasv5-options-scanner",
  reason: "Legacy builder is not used in the v5 architecture.",
  replacement: "scan-ingest-schwab-db plus Supabase PostgreSQL RPC",
  productionV3Affected: false
});
