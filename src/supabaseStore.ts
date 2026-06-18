import { createClient, type Session } from "@supabase/supabase-js";
import { createDefaultAppData, normalizeData } from "./defaultData";
import type { AppData, DocumentAttachment, DocumentType } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://srfaeqhepmogxsdiympq.supabase.co";
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_zjwJgUjvYlh6F_ltZOXEHQ_lbINP1L9";
const attachmentsBucket = "document-attachments";
const desktopRedirectUrl = "atelier://app/index.html";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";
export type InviteRole = Exclude<WorkspaceRole, "owner">;

export interface WorkspaceContext {
  organizationId: string;
  organizationName: string;
  role: WorkspaceRole;
  userEmail: string;
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
  data: Partial<AppData> | null;
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

function assertRemoteError(error: unknown) {
  if (!error) return;
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message || error);
  throw new Error(message);
}

function authRedirectUrl() {
  if (window.location.protocol === "atelier:") return desktopRedirectUrl;
  return window.location.origin;
}

function defaultWorkspaceData(organizationName: string) {
  const fallback = createDefaultAppData();
  return normalizeData({
    ...fallback,
    company: {
      ...fallback.company,
      name: fallback.company.name,
      legalName: fallback.company.legalName,
    },
  });
}

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  assertRemoteError(error);
  return data.session;
}

export function onRemoteAuthStateChange(callback: (session: Session | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  assertRemoteError(error);
  return data.session;
}

export async function signUpWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: authRedirectUrl(),
    },
  });
  assertRemoteError(error);
  return data.session;
}

export async function sendPasswordSetupEmail(email: string) {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) throw new Error("Email invalide");
  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo: authRedirectUrl(),
  });
  assertRemoteError(error);
}

export async function updateCurrentUserPassword(password: string) {
  const nextPassword = password.trim();
  if (nextPassword.length < 8) throw new Error("Le mot de passe doit contenir au moins 8 caracteres.");
  const { data, error } = await supabase.auth.updateUser({ password: nextPassword });
  assertRemoteError(error);
  return data.user;
}

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: authRedirectUrl(),
    },
  });
  assertRemoteError(error);
  return data;
}

export async function signOutRemote() {
  const { error } = await supabase.auth.signOut();
  assertRemoteError(error);
}

async function claimPendingInvitation() {
  const { data, error } = await supabase.rpc("claim_pending_organization_invitation");
  assertRemoteError(error);
  return typeof data === "string" ? data : "";
}

async function getOrganization(organizationId: string) {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", organizationId)
    .single<OrganizationRow>();
  assertRemoteError(error);
  if (!data) throw new Error("Entreprise introuvable");
  return data;
}

async function createOrganization(session: Session) {
  const defaultName = "Nouvelle entreprise";
  const { error } = await supabase
    .from("organizations")
    .insert({ name: defaultName, created_by: session.user.id });
  assertRemoteError(error);

  const membership = await getFirstMembership();
  if (!membership) throw new Error("Creation de l'entreprise impossible");
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

async function getFirstMembership() {
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id, role, email")
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

async function getWorkspaceData(organization: OrganizationRow) {
  const { data, error } = await supabase
    .from("organization_workspaces")
    .select("data")
    .eq("organization_id", organization.id)
    .maybeSingle<WorkspaceRow>();
  assertRemoteError(error);

  const workspaceData = data?.data && Object.keys(data.data).length ? normalizeData(data.data) : defaultWorkspaceData(organization.name);
  const { data: counters, error: countersError } = await supabase
    .from("organization_counters")
    .select("counter_type, next_value")
    .eq("organization_id", organization.id)
    .returns<CounterRow[]>();
  assertRemoteError(countersError);

  if (!counters?.length) return workspaceData;
  return normalizeData({
    ...workspaceData,
    counters: counters.reduce(
      (acc, row) => ({
        ...acc,
        [row.counter_type]: row.next_value,
      }),
      workspaceData.counters
    ),
  });
}

export async function loadRemoteWorkspace(preferredOrganizationId?: string) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Session absente");

  const invitedOrganizationId = preferredOrganizationId ? "" : await claimPendingInvitation();
  const targetOrganizationId = preferredOrganizationId || invitedOrganizationId;
  let membership = targetOrganizationId ? await getMembership(targetOrganizationId, session.user.id) : await getFirstMembership();
  let organization: OrganizationRow;

  if (!membership) {
    organization = await createOrganization(session);
    membership = await getMembership(organization.id, session.user.id);
  } else {
    organization = await getOrganization(membership.organization_id);
  }

  const data = await getWorkspaceData(organization);
  const context: WorkspaceContext = {
    organizationId: organization.id,
    organizationName: organization.name,
    role: membership.role,
    userEmail: session.user.email || membership.email || "",
  };

  return { context, data };
}

export async function listTeamMembers(context: WorkspaceContext) {
  const session = await getCurrentSession();
  if (!session) throw new Error("Session absente");

  const { data, error } = await supabase
    .from("organization_members")
    .select("id, user_id, email, role, created_at")
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: true })
    .returns<TeamMemberRow[]>();
  assertRemoteError(error);

  return (data || []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    email: row.email || "",
    role: row.role,
    createdAt: row.created_at,
    isCurrentUser: row.user_id === session.user.id,
  }));
}

export async function listTeamInvitations(context: WorkspaceContext) {
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
  const { error } = await supabase
    .from("organization_invitations")
    .delete()
    .eq("organization_id", context.organizationId)
    .eq("id", invitationId);
  assertRemoteError(error);
}

export async function updateTeamMemberRole(context: WorkspaceContext, memberId: string, role: InviteRole) {
  const { error } = await supabase
    .from("organization_members")
    .update({ role })
    .eq("organization_id", context.organizationId)
    .eq("id", memberId);
  assertRemoteError(error);
}

export async function removeTeamMember(context: WorkspaceContext, memberId: string) {
  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("organization_id", context.organizationId)
    .eq("id", memberId);
  assertRemoteError(error);
}

export async function saveRemoteWorkspace(context: WorkspaceContext, data: AppData) {
  const normalized = normalizeData(data);
  const nextName = normalized.company.name.trim() || context.organizationName;
  const { data: sessionData } = await supabase.auth.getSession();
  const updatedBy = sessionData.session?.user.id;

  if (nextName && nextName !== context.organizationName) {
    const { error } = await supabase.from("organizations").update({ name: nextName }).eq("id", context.organizationId);
    assertRemoteError(error);
  }

  const { error } = await supabase.from("organization_workspaces").upsert({
    organization_id: context.organizationId,
    data: normalized,
    updated_by: updatedBy,
  });
  assertRemoteError(error);
  return { ...context, organizationName: nextName };
}

export async function reserveRemoteCounter(context: WorkspaceContext, type: DocumentType | "client") {
  const { data, error } = await supabase.rpc("reserve_business_number", {
    target_organization_id: context.organizationId,
    target_counter_type: type,
  });
  assertRemoteError(error);
  if (typeof data !== "number") throw new Error("Numerotation indisponible");
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
  const dataUrl = attachmentDataUrl(attachment);
  if (!dataUrl) throw new Error("Lecture de la piece jointe impossible");

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
  const path = attachment.storagePath || attachment.filePath;
  if (!path) throw new Error("Piece jointe introuvable");
  const { data, error } = await supabase.storage.from(attachmentsBucket).download(path);
  assertRemoteError(error);
  if (!data) throw new Error("Piece jointe introuvable");
  downloadBlob(data, attachment.name);
}

export async function deleteRemoteAttachment(attachment: DocumentAttachment) {
  const path = attachment.storagePath || attachment.filePath;
  if (!path) return;
  const { error } = await supabase.storage.from(attachmentsBucket).remove([path]);
  assertRemoteError(error);
}

