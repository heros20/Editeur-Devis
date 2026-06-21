import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanEmail(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Methode non autorisee." }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceRoleKey) {
    return jsonResponse({ error: "Le service de verification email n'est pas configure." }, 500);
  }

  let payload: { email?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Demande invalide." }, 400);
  }

  const email = cleanEmail(payload.email);
  if (!email || !email.includes("@")) return jsonResponse({ error: "Email invalide." }, 400);

  const adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let page = 1;
  const perPage = 1000;

  while (page <= 100) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) return jsonResponse({ error: "Verification email impossible." }, 500);

    const users = data.users || [];
    if (users.some((user) => cleanEmail(user.email) === email)) {
      return jsonResponse({ available: false });
    }
    if (users.length < perPage) break;
    page += 1;
  }

  return jsonResponse({ available: true });
});
