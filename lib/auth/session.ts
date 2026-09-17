import { createHash, createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { query } from "@/lib/db";

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

export type Actor = SessionUser & {
  workspaceId: string;
  organizationId: string;
  role: "client" | "manager" | "logistician" | "tenant_admin";
  clientCompanyId: string | null;
};

function digest(token: string) {
  if (process.env.SESSION_SECRET) {
    return createHmac("sha256", process.env.SESSION_SECRET).update(token).digest("hex");
  }
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, response: NextResponse) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await query(
    `insert into app_sessions (user_id, token_hash, expires_at)
     values ($1, $2, $3)`,
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
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const result = await query<{
    id: string;
    email: string;
    email_confirmed_at: string | null;
    full_name: string;
    company: string;
    phone: string;
    bin: string;
    verified: boolean;
  }>(
    `select u.id, u.email, u.email_confirmed_at,
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

export async function currentActor(): Promise<Actor | null> {
  const user = await currentSessionUser();
  if (!user) return null;
  const membership = await query<{
    workspace_id: string;
    organization_id: string;
    role: Actor["role"];
    client_company_id: string | null;
  }>(
    `select m.workspace_id, w.organization_id, m.role, m.client_company_id
       from workspace_memberships m
       join tenant_workspaces w on w.id = m.workspace_id
      where m.user_id = $1 and m.status = 'active'
      order by case m.role
        when 'tenant_admin' then 1 when 'manager' then 2
        when 'logistician' then 3 else 4 end
      limit 1`,
    [user.id]
  );
  const row = membership.rows[0];
  if (!row) return null;
  return {
    ...user,
    workspaceId: row.workspace_id,
    organizationId: row.organization_id,
    role: row.role,
    clientCompanyId: row.client_company_id,
  };
}
