function json(body, status = 410) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

export default async () => json({
  ok: false,
  available: false,
  function: "scan-clean-start-db",
  environment: "poppasv5-options-scanner",
  reason: "This route is not used in the v5 architecture.",
  cleanupPerformed: false,
  productionV3Affected: false
});
