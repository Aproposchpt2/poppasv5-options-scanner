// EOD Schwab pull task helper.
// This file is intentionally not scheduled yet.

export default async () => {
  return new Response(JSON.stringify({ ok: true, task: "eod-pull-helper" }), {
    headers: { "Content-Type": "application/json" }
  });
};
