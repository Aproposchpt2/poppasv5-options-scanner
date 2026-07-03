// Morning Schwab pull task helper.
// This file is intentionally not scheduled yet.

export default async () => {
  return new Response(JSON.stringify({ ok: true, task: "morning-pull-helper" }), {
    headers: { "Content-Type": "application/json" }
  });
};
