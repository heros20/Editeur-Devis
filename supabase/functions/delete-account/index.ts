import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const confirmationValue = "SUPPRIMER";
const attachmentsBucket = "document-attachments";

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

async function listStoragePaths(client: ReturnType<typeof createClient>, prefix: string) {
  const paths: string[] = [];

  async function walk(folder: string) {
    let offset = 0;
    const limit = 100;

    while (true) {
      const { data, error } = await client.storage.from(attachmentsBucket).list(folder, { limit, offset });
      if (error) throw error;
      if (!data?.length) break;

      for (const item of data) {
        const path = folder ? `${folder}/${item.name}` : item.name;
        if (item.id) {
          paths.push(path);
        } else {
          await walk(path);
        }
      }

      if (data.length < limit) break;
      offset += limit;
    }
  }

  await walk(prefix);
  return paths;
}

async function removeStoragePrefix(client: ReturnType<typeof createClient>, prefix: string) {
  const paths = await listStoragePaths(client, prefix);
  for (let index = 0; index < paths.length; index += 100) {
    const batch = paths.slice(index, index + 100);
    const { error } = await client.storage.from(attachmentsBucket).remove(batch);
    if (error) throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Methode non autorisee." }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const authorization = req.headers.get("Authorization") || "";

  if (!url || !publishableKey || !serviceRoleKey || !authorization) {
    return jsonResponse({ error: "Le service de suppression n'est pas correctement configure." }, 500);
  }

  let payload: { confirmation?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Demande invalide." }, 400);
  }

  if (payload.confirmation !== confirmationValue) {
    return jsonResponse({ error: "Confirmation requise." }, 400);
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

  const userId = userData.user.id;
  const { data: ownerMemberships, error: ownerMembershipsError } = await adminClient
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("role", "owner");

  if (ownerMembershipsError) {
    return jsonResponse({ error: "Verification des entreprises impossible." }, 500);
  }

  const organizationIds = Array.from(new Set((ownerMemberships || []).map((row) => String(row.organization_id))));

  for (const organizationId of organizationIds) {
    await removeStoragePrefix(adminClient, organizationId);
  }

  if (organizationIds.length) {
    const { error: organizationsError } = await adminClient.from("organizations").delete().in("id", organizationIds);
    if (organizationsError) {
      return jsonResponse({ error: "Suppression des entreprises impossible." }, 500);
    }
  }

  const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    return jsonResponse({ error: "Suppression du compte impossible." }, 500);
  }

  return jsonResponse({ deleted: true });
});
