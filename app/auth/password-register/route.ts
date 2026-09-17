import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { transaction } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { sameOrigin, requestIp } from "@/lib/auth/request";
import { createSession } from "@/lib/auth/session";
import { rateLimitStatus, recordFailure } from "@/lib/auth/rate-limit";

const MAX_REGISTRATIONS = 3;

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Недопустимый источник запроса." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const fullName = String(body.full_name || "").trim();
  const company = String(body.company || "").trim();
  const phone = String(body.phone || "").trim();

  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || !fullName) {
    return NextResponse.json(
      { error: "Укажите имя, корректный email и пароль не короче 8 символов." },
      { status: 400 }
    );
  }

  const rateKey = `register:${requestIp(request)}`;
  const rate = await rateLimitStatus(rateKey, MAX_REGISTRATIONS);
  if (rate.locked) {
    return NextResponse.json({ error: "Слишком много регистраций. Попробуйте позже." }, { status: 429 });
  }

  const passwordHash = await hashPassword(password);
  const userId = randomUUID();
  const organizationId = randomUUID();
  const workspaceId = randomUUID();
  const clientCompanyId = randomUUID();
  const slugSuffix = userId.slice(0, 8);
  const confirmedAt = process.env.EMAIL_VERIFICATION_MODE === "smtp" ? null : new Date();

  try {
    await transaction(async (client) => {
      await client.query(
        `insert into app_users (id, email, password_hash, email_confirmed_at)
         values ($1, $2, $3, $4)`,
        [userId, email, passwordHash, confirmedAt]
      );
      await client.query(
        `insert into profiles (id, email, full_name, company, phone, role)
         values ($1, $2, $3, $4, $5, 'client')`,
        [userId, email, fullName, company, phone]
      );
      await client.query(
        `insert into organizations (id, name, slug, status)
         values ($1, $2, $3, 'active')`,
        [organizationId, company || fullName, `self-${slugSuffix}`]
      );
      await client.query(
        `insert into tenant_workspaces (id, organization_id, name, slug, status)
         values ($1, $2, $3, $4, 'active')`,
        [workspaceId, organizationId, company || fullName, `workspace-${slugSuffix}`]
      );
      await client.query(
        `insert into client_companies (id, workspace_id, name, status)
         values ($1, $2, $3, 'active')`,
        [clientCompanyId, workspaceId, company || fullName]
      );
      await client.query(
        `insert into workspace_memberships
           (workspace_id, user_id, role, client_company_id, status)
         values ($1, $2, 'client', $3, 'active')`,
        [workspaceId, userId, clientCompanyId]
      );
      await client.query(
        `insert into module_entitlements (workspace_id, module_key, enabled)
         values ($1, 'private_os', true)`,
        [workspaceId]
      );
      await client.query(
        `insert into tenant_audit_events
           (workspace_id, actor_user_id, client_company_id, event_type, entity_type, entity_id, metadata)
         values ($1, $2, $4, 'self_registration', 'user', $2::text, jsonb_build_object('email', $3))`,
        [workspaceId, userId, email, clientCompanyId]
      );
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      return NextResponse.json({ error: "Этот email уже зарегистрирован." }, { status: 409 });
    }
    console.error("registration failed", error);
    return NextResponse.json({ error: "Не удалось создать аккаунт." }, { status: 500 });
  }

  await recordFailure(rateKey, MAX_REGISTRATIONS, 3600, 3600);
  const response = NextResponse.json({ ok: true, confirmed: Boolean(confirmedAt) });
  if (confirmedAt) await createSession(userId, response);
  return response;
}
