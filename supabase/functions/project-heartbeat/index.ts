import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@^1";

export default {
  fetch: withSupabase({ auth: "secret:heartbeat" }, async (request, context) => {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const now = new Date().toISOString();
    const { error } = await context.supabaseAdmin.from("service_heartbeat").upsert({
      service_name: "cloudflare-worker",
      last_seen_at: now,
      source: "scheduled-check",
      updated_at: now,
    });

    if (error) {
      console.error("Heartbeat database write failed", error);
      return Response.json({ ok: false }, { status: 503 });
    }
    return Response.json({ ok: true, checkedAt: now });
  }),
};
