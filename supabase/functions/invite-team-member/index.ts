import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type InviteRole = "admin" | "editor" | "viewer";

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
  return String(value || "").trim().toLowerCase();
}

function cleanRole(value: unknown): InviteRole {
  return value === "admin" || value === "viewer" ? value : "editor";
}

function makeInviteToken() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Methode non autorisee." }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const authorization = req.headers.get("Authorization") || "";

  if (!url || !publishableKey || !serviceRoleKey || !authorization) {
    return jsonResponse({ error: "Le service d'invitation n'est pas correctement configure." }, 500);
  }

  let payload: { organizationId?: string; email?: string; role?: InviteRole; redirectTo?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Demande invalide." }, 400);
  }

  const organizationId = String(payload.organizationId || "");
  const email = cleanEmail(payload.email);
  const role = cleanRole(payload.role);
  const redirectTo = String(payload.redirectTo || "");

  if (!organizationId || !email.includes("@")) {
    return jsonResponse({ error: "Email employe invalide." }, 400);
  }

  const userClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: "Votre session a expire. Reconnectez-vous." }, 401);
  }

  const { data: member, error: memberError } = await userClient
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userData.user.id)
    .single();

  if (memberError || !member || !["owner", "admin"].includes(String(member.role))) {
    return jsonResponse({ error: "Vous n'avez pas les droits pour inviter un employe." }, 403);
  }

  await userClient
    .from("organization_invitations")
    .delete()
    .eq("organization_id", organizationId)
    .eq("email", email)
    .is("accepted_at", null);

  const { data: invitation, error: invitationError } = await userClient
    .from("organization_invitations")
    .insert({
      organization_id: organizationId,
      email,
      role,
      token: makeInviteToken(),
    })
    .select("id, email, role, accepted_at, expires_at, created_at")
    .single();

  if (invitationError || !invitation) {
    return jsonResponse({ error: "L'invitation n'a pas pu etre creee." }, 400);
  }

  const inviteOptions = {
    data: {
      organization_id: organizationId,
      role,
      invited_by: userData.user.email || "",
    },
    redirectTo: redirectTo || undefined,
  };

  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, inviteOptions);

  if (inviteError) {
    const alreadyExists = /already|registered|exists|exist/i.test(inviteError.message || "");
    if (alreadyExists) {
      const { error: otpError } = await adminClient.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo || undefined,
          shouldCreateUser: false,
        },
      });
      if (!otpError) return jsonResponse({ invitation });
    }

    await userClient.from("organization_invitations").delete().eq("id", invitation.id);
    return jsonResponse({ error: "L'email d'invitation n'a pas pu etre envoye." }, 502);
  }

  return jsonResponse({ invitation });
});
