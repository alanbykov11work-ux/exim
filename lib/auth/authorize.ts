import { NextResponse } from "next/server";
import { currentActor, type Actor, type ActorRole } from "@/lib/auth/session";
import { query } from "@/lib/db";

type AuthorizationOptions = {
  roles?: ActorRole[];
  moduleKey?: string;
};

type AuthorizationResult =
  | { ok: true; actor: Actor }
  | { ok: false; response: NextResponse };

export async function hasModuleEntitlement(actor: Actor, moduleKey: string) {
  const entitlement = await query<{ enabled: boolean }>(
    `select enabled
       from module_entitlements
      where workspace_id = $1 and module_key = $2`,
    [actor.workspaceId, moduleKey]
  );
  return Boolean(entitlement.rows[0]?.enabled);
}

export async function authorizeActor(
  options: AuthorizationOptions = {}
): Promise<AuthorizationResult> {
  const actor = await currentActor();
  if (!actor) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "access_context_required" },
        { status: 401 }
      ),
    };
  }
  if (options.roles && !options.roles.includes(actor.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }
  if (options.moduleKey) {
    if (!(await hasModuleEntitlement(actor, options.moduleKey))) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "module_not_enabled", module: options.moduleKey },
          { status: 403 }
        ),
      };
    }
  }
  return { ok: true, actor };
}
