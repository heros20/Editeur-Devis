import { createClient, type Session } from "@supabase/supabase-js";
import { createDefaultAppData, normalizeData } from "./defaultData";
import { getDevixApi } from "./runtimeApi";
import type { AppData, DocumentAttachment, DocumentType } from "./types";

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const supabaseKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
const supabaseConfigured = Boolean(supabaseUrl && supabaseKey);
const configuredAuthRedirectUrl = String(import.meta.env.VITE_AUTH_REDIRECT_URL || "").trim();
const attachmentsBucket = "document-attachments";
const desktopAuthBridgeUrl = supabaseConfigured ? `${supabaseUrl}/functions/v1/auth-callback` : "";
const authStorageKey = supabaseConfigured ? `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token` : "sb-devix-auth-token";
const clientUrl = supabaseConfigured ? supabaseUrl : "https://placeholder.supabase.co";
const clientKey = supabaseConfigured ? supabaseKey : "missing-publishable-key";

function assertSupabaseConfigured() {
  if (!supabaseConfigured)
    throw new Error("Configuration Supabase absente. Renseignez VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY.");
}

function createAuthStorage() {
  const api = getDevixApi();

  return {
    async getItem(key: string) {
      const persisted = await api.authStorageGet(key).catch(() => null);
      if (persisted) return persisted;
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    async setItem(key: string, value: string) {
      await api.authStorageSet(key, value).catch(() => undefined);
      try {
        localStorage.setItem(key, value);
      } catch {
        // Electron file storage is the primary desktop persistence layer.
      }
    },
    async removeItem(key: string) {
      await api.authStorageRemove(key).catch(() => undefined);
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore localStorage cleanup errors.
      }
    },
  };
}

export const supabase = createClient(clientUrl, clientKey, {
  auth: {
    storage: createAuthStorage(),
    storageKey: authStorageKey,
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer" | "superadmin";
export type InviteRole = Exclude<WorkspaceRole, "owner" | "superadmin">;

export interface WorkspaceContext {
  organizationId: string;
  organizationName: string;
  role: WorkspaceRole;
  userEmail: string;
  workspaceUpdatedAt: string;
}

interface OrganizationRow {
  id: string;
  name: string;
}

interface MembershipRow {
  organization_id: string;
  role: WorkspaceRole;
  email: string | null;
}

interface WorkspaceRow {
  organization_id?: string;
  data: Partial<AppData> | null;
  updated_at: string;
  organizations?: OrganizationRow | null;
}

interface CounterRow {
  counter_type: DocumentType | "client";
  next_value: number;
}

interface TeamMemberRow {
  id: string;
  user_id: string;
  email: string | null;
  role: WorkspaceRole;
  created_at: string;
}

interface TeamInvitationRow {
  id: string;
  email: string;
  role: InviteRole;
  token: string;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface TeamMember {
  id: string;
  userId: string;
  email: string;
  role: WorkspaceRole;
  createdAt: string;
  isCurrentUser: boolean;
}

export interface TeamInvitation {
  id: string;
  email: string;
  role: InviteRole;
  token?: string;
  acceptedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface SuperadminWorkspace {
  organizationId: string;
  organizationName: string;
  updatedAt: string;
  data: AppData;
}

function assertRemoteError(error: unknown) {
  if (!error) return;
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message || error);
  throw new Error(message);
}

function authRedirectUrl() {
  if (configuredAuthRedirectUrl) return configuredAuthRedirectUrl;
  if (desktopAuthBridgeUrl) return desktopAuthBridgeUrl;
  return window.location.origin;
}

function isDesktopRuntime() {
  return Boolean(window.devixApi) || window.location.protocol === "devix:";
}

function cleanAuthUrl() {
  const nextUrl = `${window.location.origin}${window.location.pathname}`;
  window.history.replaceState({}, document.title, nextUrl);
}

function defaultWorkspaceData() {
  const fallback = createDefaultAppData();
  return normalizeData({
    ...fallback,
    catalog: [],
    company: {
      ...fallback.company,
      name: fallback.company.name,
      legalName: fallback.company.legalName,
    },
  });
}

export async function getCurrentSession() {
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase.auth.getSession();
  assertRemoteError(error);
  return data.session;
}

export async function completeOAuthRedirect() {
  if (!supabaseConfigured) return null;
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const errorDescription = params.get("error_description") || params.get("error");
  if (errorDescription) {
    cleanAuthUrl();
    throw new Error(errorDescription);
  }
  if (!code) return null;

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  cleanAuthUrl();
  assertRemoteError(error);
  return data.session;
}

export function onRemoteAuthStateChange(callback: (session: Session | null) => void) {
  if (!supabaseConfigured) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function signInWithPassword(email: string, password: string) {
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  assertRemoteError(error);
  return data.session;
}

export async function signUpWithPassword(email: string, password: string) {
  assertSupabaseConfigured();
  const cleanEmail = email.trim().toLowerCase();
  const { data: availability, error: availabilityError } = await supabase.functions.invoke("check-email-availability", {
    body: { email: cleanEmail },
  });
  assertRemoteError(availabilityError);
  const availabilityPayload = availability as { available?: boolean; error?: string } | null;
  if (availabilityPayload?.error) throw new Error(availabilityPayload.error);
  if (availabilityPayload && availabilityPayload.available === false) {
    throw new Error("Un compte existe deja avec cette adresse email. Connectez-vous ou utilisez mot de passe oublie.");
  }

  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      emailRedirectTo: authRedirectUrl(),
    },
  });
  assertRemoteError(error);
  return data.session;
}

export async function sendPasswordSetupEmail(email: string) {
  assertSupabaseConfigured();
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) throw new Error("Email invalide");
  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo: authRedirectUrl(),
  });
  assertRemoteError(error);
}

export async function updateCurrentUserPassword(password: string) {
  assertSupabaseConfigured();
  const nextPassword = password.trim();
  if (nextPassword.length < 8) throw new Error("Le mot de passe doit contenir au moins 8 caractères.");
  const { data, error } = await supabase.auth.updateUser({ password: nextPassword });
  assertRemoteError(error);
  return data.user;
}

export async function signInWithGoogle() {
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: authRedirectUrl(),
      skipBrowserRedirect: isDesktopRuntime(),
    },
  });
  assertRemoteError(error);
  if (isDesktopRuntime() && data.url) {
    const result = await getDevixApi().openAuth(data.url);
    if (result.callbackUrl) {
      const callback = new URL(result.callbackUrl);
      const errorDescription = callback.searchParams.get("error_description") || callback.searchParams.get("error");
      if (errorDescription) throw new Error(errorDescription);
      const code = callback.searchParams.get("code");
      if (code) {
        const exchanged = await supabase.auth.exchangeCodeForSession(code);
        assertRemoteError(exchanged.error);
      }
    }
  }
  return data;
}

export async function signOutRemote() {
  assertSupabaseConfigured();
  const { error } = await supabase.auth.signOut();
  assertRemoteError(error);
}

export async function deleteCurrentAccount() {
  assertSupabaseConfigured();
  const { data, error } = await supabase.functions.invoke("delete-account", {
    body: { confirmation: "SUPPRIMER" },
  });
  assertRemoteError(error);

  const payload = data as { deleted?: boolean; error?: string } | null;
  if (payload?.error) throw new Error(payload.error);
  if (!payload?.deleted) throw new Error("Suppression du compte impossible");

  await supabase.auth.signOut().catch(() => undefined);
}

async function claimPendingInvitation() {
  const { data, error } = await supabase.rpc("claim_pending_organization_invitation");
  assertRemoteError(error);
  return typeof data === "string" ? data : "";
}

async function getOrganization(organizationId: string) {
  const { data, error } = await supabase.from("organizations").select("id, name").eq("id", organizationId).single<OrganizationRow>();
  assertRemoteError(error);
  if (!data) throw new Error("Entreprise introuvable");
  return data;
}

async function createOrganization(session: Session) {
  const defaultName = "Nouvelle entreprise";
  const { error } = await supabase.from("organizations").insert({ name: defaultName, created_by: session.user.id });
  assertRemoteError(error);

  const membership = await getFirstMembership(session.user.id);
  if (!membership) throw new Error("Création de l'entreprise impossible");
  return getOrganization(membership.organization_id);
}

async function getMembership(organizationId: string, userId: string) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id, role, email")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .single<MembershipRow>();
  assertRemoteError(error);
  if (!data) throw new Error("Droits utilisateur introuvables");
  return data;
}

async function isCurrentUserSuperadmin() {
  const session = await getCurrentSession();
  if (!session) return false;
  const email = (session.user.email || "").trim().toLowerCase();
  const { data, error } = await supabase
    .from("superadmins")
    .select("id")
    .or(`user_id.eq.${session.user.id},email.eq.${email}`)
    .maybeSingle<{ id: string }>();
  assertRemoteError(error);
  return Boolean(data);
}

async function getFirstMembership(userId: string) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id, role, email")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .returns<MembershipRow[]>();
  assertRemoteError(error);
  return data?.[0];
}

function mapTeamInvitation(row: TeamInvitationRow): TeamInvitation {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    token: row.token,
    acceptedAt: row.accepted_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function attachmentStoragePaths(data: AppData) {
  const paths = new Set<string>();
  const collect = (attachments: DocumentAttachment[]) => {
    attachments.forEach((attachment) => {
      const path = attachment.storagePath || attachment.filePath;
      if (path) paths.add(path);
    });
  };

  data.documents.forEach((document) => {
    collect(document.attachments || []);
    document.history.forEach((entry) => collect(entry.snapshot.attachments || []));
  });
  data.purchaseOrders.forEach((order) => collect(order.attachments || []));
  data.purchaseInvoices.forEach((invoice) => collect(invoice.attachments || []));
  return [...paths];
}

async function getWorkspaceData(organization: OrganizationRow) {
  const { data, error } = await supabase
    .from("organization_workspaces")
    .select("data, updated_at")
    .eq("organization_id", organization.id)
    .maybeSingle<WorkspaceRow>();
  assertRemoteError(error);

  const workspaceData = data?.data && Object.keys(data.data).length ? normalizeData(data.data) : defaultWorkspaceData();
  const { data: counters, error: countersError } = await supabase
    .from("organization_counters")
    .select("counter_type, next_value")
    .eq("organization_id", organization.id)
    .returns<CounterRow[]>();
  assertRemoteError(countersError);

  const normalized = !counters?.length
    ? workspaceData
    : normalizeData({
        ...workspaceData,
        counters: counters.reduce(
          (acc, row) => ({
            ...acc,
            [row.counter_type]: row.next_value,
          }),
          workspaceData.counters
        ),
      });

  return {
    data: normalized,
    updatedAt: data?.updated_at || "",
  };
}

export async function loadRemoteWorkspace(preferredOrganizationId?: string) {
  assertSupabaseConfigured();
  const session = await getCurrentSession();
  if (!session) throw new Error("Session absente");

  const invitedOrganizationId = preferredOrganizationId ? "" : await claimPendingInvitation();
  const targetOrganizationId = preferredOrganizationId || invitedOrganizationId;
  const superadmin = await isCurrentUserSuperadmin();
  let membership = targetOrganizationId
    ? await getMembership(targetOrganizationId, session.user.id)
    : await getFirstMembership(session.user.id);
  let organization: OrganizationRow;

  if (!membership) {
    organization = await createOrganization(session);
    membership = await getMembership(organization.id, session.user.id);
  } else {
    organization = await getOrganization(membership.organization_id);
  }

  const workspaceData = await getWorkspaceData(organization);
  const context: WorkspaceContext = {
    organizationId: organization.id,
    organizationName: organization.name,
    role: superadmin ? "superadmin" : membership.role,
    userEmail: session.user.email || membership.email || "",
    workspaceUpdatedAt: workspaceData.updatedAt,
  };

  return { context, data: workspaceData.data };
}

export async function listSuperadminWorkspaces(): Promise<SuperadminWorkspace[]> {
  assertSupabaseConfigured();
  if (!(await isCurrentUserSuperadmin())) throw new Error("Accès superadmin requis.");

  const { data, error } = await supabase
    .from("organization_workspaces")
    .select("organization_id, data, updated_at, organizations(id, name)")
    .order("updated_at", { ascending: false })
    .returns<WorkspaceRow[]>();
  assertRemoteError(error);

  return (data || []).map((row) => ({
    organizationId: row.organization_id || row.organizations?.id || "",
    organizationName: row.organizations?.name || "Entreprise sans nom",
    updatedAt: row.updated_at || "",
    data: normalizeData(row.data || {}),
  }));
}

export async function deleteSuperadminOrganization(organizationId: string) {
  assertSupabaseConfigured();
  if (!(await isCurrentUserSuperadmin())) throw new Error("Accès superadmin requis.");
  if (!organizationId) throw new Error("Entreprise introuvable.");

  const { data: workspaceRows, error: workspaceError } = await supabase
    .from("organization_workspaces")
    .select("data")
    .eq("organization_id", organizationId)
    .returns<Array<{ data: Partial<AppData> | null }>>();
  assertRemoteError(workspaceError);

  const workspaceData = normalizeData(workspaceRows?.[0]?.data || {});
  const paths = attachmentStoragePaths(workspaceData).filter((path) => path.startsWith(`${organizationId}/`));
  for (let index = 0; index < paths.length; index += 1000) {
    const { error: storageError } = await supabase.storage.from(attachmentsBucket).remove(paths.slice(index, index + 1000));
    assertRemoteError(storageError);
  }

  const { error } = await supabase.rpc("delete_superadmin_organization", { target_organization_id: organizationId });
  assertRemoteError(error);
}

export async function listTeamMembers(context: WorkspaceContext) {
  assertSupabaseConfigured();
  const session = await getCurrentSession();
  if (!session) throw new Error("Session absente");

  const { data, error } = await supabase
    .from("organization_members")
    .select("id, user_id, email, role, created_at")
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: true })
    .returns<TeamMemberRow[]>();
  assertRemoteError(error);

  return (data || []).map((row) => {
    const isCurrentUser = row.user_id === session.user.id;
    return {
      id: row.id,
      userId: row.user_id,
      email: row.email || (isCurrentUser ? session.user.email || context.userEmail : ""),
      role: row.role,
      createdAt: row.created_at,
      isCurrentUser,
    };
  });
}

export async function listTeamInvitations(context: WorkspaceContext) {
  assertSupabaseConfigured();
  const { data, error } = await supabase
    .from("organization_invitations")
    .select("id, email, role, token, accepted_at, expires_at, created_at")
    .eq("organization_id", context.organizationId)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .returns<TeamInvitationRow[]>();
  assertRemoteError(error);
  return (data || []).map(mapTeamInvitation);
}

export async function createTeamInvitation(context: WorkspaceContext, email: string, role: InviteRole) {
  assertSupabaseConfigured();
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) throw new Error("Email invalide");

  const { data, error } = await supabase.functions.invoke("invite-team-member", {
    body: {
      organizationId: context.organizationId,
      email: cleanEmail,
      role,
      redirectTo: authRedirectUrl(),
    },
  });
  assertRemoteError(error);
  const payload = data as { invitation?: TeamInvitationRow; error?: string } | null;
  if (payload?.error) throw new Error(payload.error);
  if (!payload?.invitation) throw new Error("Invitation impossible");
  return mapTeamInvitation({ ...payload.invitation, token: "" });
}

export async function deleteTeamInvitation(context: WorkspaceContext, invitationId: string) {
  assertSupabaseConfigured();
  const { error } = await supabase
    .from("organization_invitations")
    .delete()
    .eq("organization_id", context.organizationId)
    .eq("id", invitationId);
  assertRemoteError(error);
}

export async function updateTeamMemberRole(context: WorkspaceContext, memberId: string, role: InviteRole) {
  assertSupabaseConfigured();
  const { error } = await supabase
    .from("organization_members")
    .update({ role })
    .eq("organization_id", context.organizationId)
    .eq("id", memberId);
  assertRemoteError(error);
}

export async function removeTeamMember(context: WorkspaceContext, memberId: string) {
  assertSupabaseConfigured();
  const { error } = await supabase.from("organization_members").delete().eq("organization_id", context.organizationId).eq("id", memberId);
  assertRemoteError(error);
}

export async function saveRemoteWorkspace(context: WorkspaceContext, data: AppData) {
  assertSupabaseConfigured();
  const normalized = normalizeData(data);
  const nextName = normalized.company.name.trim() || context.organizationName;
  const { data: sessionData } = await supabase.auth.getSession();
  const updatedBy = sessionData.session?.user.id;

  let query = supabase
    .from("organization_workspaces")
    .update({
      data: normalized,
      updated_by: updatedBy,
    })
    .eq("organization_id", context.organizationId);

  if (context.workspaceUpdatedAt) {
    query = query.eq("updated_at", context.workspaceUpdatedAt);
  }

  const { data: updatedRows, error } = await query.select("updated_at").returns<{ updated_at: string }[]>();
  assertRemoteError(error);

  const updatedAt = updatedRows?.[0]?.updated_at;
  if (!updatedAt) {
    throw new Error("Les données ont été modifiées ailleurs. Rechargez l'espace avant d'enregistrer.");
  }

  if (nextName && nextName !== context.organizationName) {
    const { error: organizationError } = await supabase.from("organizations").update({ name: nextName }).eq("id", context.organizationId);
    assertRemoteError(organizationError);
  }

  return { ...context, organizationName: nextName, workspaceUpdatedAt: updatedAt };
}

export async function reserveRemoteCounter(context: WorkspaceContext, type: DocumentType | "client") {
  assertSupabaseConfigured();
  const { data, error } = await supabase.rpc("reserve_business_number", {
    target_organization_id: context.organizationId,
    target_counter_type: type,
  });
  assertRemoteError(error);
  if (typeof data !== "number") throw new Error("Numérotation indisponible");
  return data;
}

function attachmentDataUrl(attachment: DocumentAttachment) {
  return attachment.dataUrl || (attachment.filePath.startsWith("data:") ? attachment.filePath : "");
}

function blobFromDataUrl(dataUrl: string, fallbackType = "application/octet-stream") {
  const [header, encoded] = dataUrl.split(",", 2);
  const mimeType = /^data:([^;]+)/.exec(header)?.[1] || fallbackType;
  const binary = atob(encoded || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { blob: new Blob([bytes], { type: mimeType }), mimeType };
}

function safeStorageName(name: string) {
  const base = name.trim() || "piece-jointe";
  return base.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-").replace(/\s+/g, "-");
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function uploadRemoteAttachment(context: WorkspaceContext, documentId: string, attachment: DocumentAttachment) {
  assertSupabaseConfigured();
  const dataUrl = attachmentDataUrl(attachment);
  if (!dataUrl) throw new Error("Lecture de la pièce jointe impossible");

  const { blob, mimeType } = blobFromDataUrl(dataUrl, attachment.mimeType);
  const path = `${context.organizationId}/${documentId}/${attachment.id}-${safeStorageName(attachment.name)}`;
  const { error } = await supabase.storage.from(attachmentsBucket).upload(path, blob, {
    contentType: mimeType,
    upsert: true,
  });
  assertRemoteError(error);

  return {
    id: attachment.id,
    name: attachment.name,
    filePath: path,
    storagePath: path,
    size: attachment.size,
    mimeType,
    addedAt: attachment.addedAt,
  };
}

export async function openRemoteAttachment(attachment: DocumentAttachment) {
  assertSupabaseConfigured();
  const path = attachment.storagePath || attachment.filePath;
  if (!path) throw new Error("Pièce jointe introuvable");
  const { data, error } = await supabase.storage.from(attachmentsBucket).download(path);
  assertRemoteError(error);
  if (!data) throw new Error("Pièce jointe introuvable");
  downloadBlob(data, attachment.name);
}

export async function deleteRemoteAttachment(attachment: DocumentAttachment) {
  assertSupabaseConfigured();
  const path = attachment.storagePath || attachment.filePath;
  if (!path) return;
  const { error } = await supabase.storage.from(attachmentsBucket).remove([path]);
  assertRemoteError(error);
}
