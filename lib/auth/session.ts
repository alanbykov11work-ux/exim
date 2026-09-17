import { createHash, createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";

export const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-exim_session" : "exim_session";
const SESSION_DAYS = 14;

export type SessionUser = {
  id: string;
  email: string;
  emailConfirmedAt: string | null;
  fullName: string;
  company: string;
  phone: string;
  bin: string;
  verified: boolean;
};

export type ActorRole = "client" | "manager" | "logistician" | "tenant_admin";

export type Actor = SessionUser & {
  membershipId: string;
  workspaceId: string;
  organizationId: string;
  role: ActorRole;
  clientCompanyId: string | null;
};

export type ActorContext = {
  membershipId: string;
  workspaceId: string;
  workspaceName: string;
  organizationId: string;
  organizationName: string;
  role: ActorRole;
  clientCompanyId: string | null;
  clientCompanyName: string | null;
};

type SessionRecord = SessionUser & {
  sessionId: string;
  activeMembershipId: string | null;
};

function digest(token: string) {
  if (process.env.SESSION_SECRET) {
    return createHmac("sha256", process.env.SESSION_SECRET).update(token).digest("hex");
  }
  return createHash("sha256").update(token).digest("hex");
}

async function sessionToken() {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}

async function sessionRecord(): Promise<SessionRecord | null> {
  const token = await sessionToken();
  if (!token) return null;
  const result = await query<{
    session_id: string;
    active_membership_id: string | null;
    id: string;
    email: string;
    email_confirmed_at: string | null;
    full_name: string;
    company: string;
    phone: string;
    bin: string;
    verified: boolean;
  }>(
    `select s.id as session_id, s.active_membership_id,
            u.id, u.email, u.email_confirmed_at,
            coalesce(p.full_name, '') as full_name,
            coalesce(p.company, '') as company,
            coalesce(p.phone, '') as phone,
            coalesce(p.bin, '') as bin,
            coalesce(p.verified, false) as verified
       from app_sessions s
       join app_users u on u.id = s.user_id
       left join profiles p on p.id = u.id
      where s.token_hash = $1
        and s.expires_at > now()
      limit 1`,
    [digest(token)]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    sessionId: row.session_id,
    activeMembershipId: row.active_membership_id,
    id: row.id,
    email: row.email,
    emailConfirmedAt: row.email_confirmed_at,
    fullName: row.full_name,
    company: row.company,
    phone: row.phone,
    bin: row.bin,
    verified: row.verified,
  };
}

export async function createSession(userId: string, response: NextResponse) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await query(
    `insert into app_sessions (user_id, token_hash, expires_at, active_membership_id)
     select $1, $2, $3,
            case when count(*) = 1 then (array_agg(id order by created_at, id))[1] else null end
       from workspace_memberships
      where user_id = $1 and status = 'active'`,
    [userId, digest(token), expiresAt]
  );
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(token: string | undefined, response: NextResponse) {
  if (token) {
    await query("delete from app_sessions where token_hash = $1", [digest(token)]);
  }
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function currentSessionUser(): Promise<SessionUser | null> {
  const record = await sessionRecord();
  if (!record) return null;
  const { sessionId: _sessionId, activeMembershipId: _activeMembershipId, ...user } = record;
  return user;
}

export async function listActorContexts(): Promise<{
  activeMembershipId: string | null;
  contexts: ActorContext[];
} | null> {
  const record = await sessionRecord();
  if (!record) return null;
  const result = await query<{
    membership_id: string;
    workspace_id: string;
    workspace_name: string;
    organization_id: string;
    organization_name: string;
    role: ActorRole;
    client_company_id: string | null;
    client_company_name: string | null;
  }>(
    `select m.id as membership_id, m.workspace_id, w.name as workspace_name,
            w.organization_id, o.name as organization_name, m.role,
            m.client_company_id, c.name as client_company_name
       from workspace_memberships m
       join tenant_workspaces w on w.id = m.workspace_id and w.status = 'active'
       join organizations o on o.id = w.organization_id and o.status = 'active'
       left join client_companies c
         on c.id = m.client_company_id and c.workspace_id = m.workspace_id and c.status = 'active'
      where m.user_id = $1 and m.status = 'active'
      order by o.name, w.name, m.role, m.created_at, m.id`,
    [record.id]
  );
  return {
    activeMembershipId: record.activeMembershipId,
    contexts: result.rows.map((row) => ({
      membershipId: row.membership_id,
      workspaceId: row.workspace_id,
      workspaceName: row.workspace_name,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      role: row.role,
      clientCompanyId: row.client_company_id,
      clientCompanyName: row.client_company_name,
    })),
  };
}

export async function currentActor(): Promise<Actor | null> {
  const record = await sessionRecord();
  if (!record) return null;
  const result = await query<{
    membership_id: string;
    workspace_id: string;
    organization_id: string;
    role: ActorRole;
    client_company_id: string | null;
  }>(
    `select m.id as membership_id, m.workspace_id, w.organization_id, m.role, m.client_company_id
       from workspace_memberships m
       join tenant_workspaces w on w.id = m.workspace_id and w.status = 'active'
       join organizations o on o.id = w.organization_id and o.status = 'active'
       left join client_companies c
         on c.id = m.client_company_id and c.workspace_id = m.workspace_id
      where m.user_id = $1
        and m.status = 'active'
        and ($2::uuid is not null and m.id = $2::uuid)
        and (m.role <> 'client' or c.status = 'active')
      limit 1`,
    [record.id, record.activeMembershipId]
  );
  const row = result.rows[0];
  if (!row) return null;
  const { sessionId: _sessionId, activeMembershipId: _activeMembershipId, ...user } = record;
  return {
    ...user,
    membershipId: row.membership_id,
    workspaceId: row.workspace_id,
    organizationId: row.organization_id,
    role: row.role,
    clientCompanyId: row.client_company_id,
  };
}

export async function selectActorContext(membershipId: string): Promise<ActorContext | null> {
  const token = await sessionToken();
  if (!token) return null;
  return transaction(async (client) => {
    const session = await client.query<{
      session_id: string;
      user_id: string;
      active_membership_id: string | null;
      previous_workspace_id: string | null;
    }>(
      `select s.id as session_id, s.user_id, s.active_membership_id,
              previous.workspace_id as previous_workspace_id
         from app_sessions s
         left join workspace_memberships previous on previous.id = s.active_membership_id
        where s.token_hash = $1 and s.expires_at > now()
        for update of s`,
      [digest(token)]
    );
    const current = session.rows[0];
    if (!current) return null;

    const selected = await client.query<{
      membership_id: string;
      workspace_id: string;
      workspace_name: string;
      organization_id: string;
      organization_name: string;
      role: ActorRole;
      client_company_id: string | null;
      client_company_name: string | null;
    }>(
      `select m.id as membership_id, m.workspace_id, w.name as workspace_name,
              w.organization_id, o.name as organization_name, m.role,
              m.client_company_id, c.name as client_company_name
         from workspace_memberships m
         join tenant_workspaces w on w.id = m.workspace_id and w.status = 'active'
         join organizations o on o.id = w.organization_id and o.status = 'active'
         left join client_companies c
           on c.id = m.client_company_id and c.workspace_id = m.workspace_id and c.status = 'active'
        where m.id = $1 and m.user_id = $2 and m.status = 'active'
          and (m.role <> 'client' or c.id is not null)
        limit 1`,
      [membershipId, current.user_id]
    );
    const row = selected.rows[0];
    if (!row) return null;

    await client.query(
      "update app_sessions set active_membership_id = $2, last_seen_at = now() where id = $1",
      [current.session_id, row.membership_id]
    );

    if (current.previous_workspace_id && current.previous_workspace_id !== row.workspace_id) {
      await client.query(
        `insert into tenant_audit_events
           (workspace_id, actor_user_id, event_type, entity_type, entity_id, metadata)
         values ($1, $2, 'access_context.left', 'workspace_membership', $3, $4::jsonb)`,
        [
          current.previous_workspace_id,
          current.user_id,
          current.active_membership_id,
          JSON.stringify({ next_workspace_id: row.workspace_id }),
        ]
      );
    }
    await client.query(
      `insert into tenant_audit_events
         (workspace_id, actor_user_id, client_company_id, event_type, entity_type, entity_id, metadata)
       values ($1, $2, $3, 'access_context.selected', 'workspace_membership', $4, $5::jsonb)`,
      [
        row.workspace_id,
        current.user_id,
        row.client_company_id,
        row.membership_id,
        JSON.stringify({ role: row.role, previous_workspace_id: current.previous_workspace_id }),
      ]
    );

    return {
      membershipId: row.membership_id,
      workspaceId: row.workspace_id,
      workspaceName: row.workspace_name,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      role: row.role,
      clientCompanyId: row.client_company_id,
      clientCompanyName: row.client_company_name,
    };
  });
}
