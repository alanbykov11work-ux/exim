import { NextResponse } from "next/server";
import { currentActor } from "@/lib/auth/session";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const staff = actor.role === "manager" || actor.role === "tenant_admin";
  const logistics = actor.role === "logistician";
  const [orders, transports, profiles] = await Promise.all([
    query(
      `select * from orders
        where workspace_id = $1
          and ($2::boolean
            or ($3::boolean and logist_id = $4)
            or (client_company_id = $5))
        order by created_at desc`,
      [actor.workspaceId, staff, logistics, actor.id, actor.clientCompanyId]
    ),
    query(
      `select * from transports
        where workspace_id = $1
          and ($2::boolean
            or ($3::boolean and logist_id = $4)
            or (client_company_id = $5))
        order by created_at desc`,
      [actor.workspaceId, staff, logistics, actor.id, actor.clientCompanyId]
    ),
    query(
      `select p.id, p.full_name, p.email, p.company, p.staff_code,
              case m.role when 'logistician' then 'logist'
                          when 'tenant_admin' then 'admin' else m.role end as role
         from workspace_memberships m
         join profiles p on p.id = m.user_id
        where m.workspace_id = $1 and m.status = 'active'
        order by p.full_name, p.email`,
      [actor.workspaceId]
    ),
  ]);

  let finance: unknown[] = [];
  if (staff || logistics) {
    const result = await query(
      `select f.* from order_finance f
        join orders o on o.id = f.order_id
       where o.workspace_id = $1
         and ($2::boolean or o.logist_id = $3)`,
      [actor.workspaceId, staff, actor.id]
    );
    finance = result.rows;
  }

  return NextResponse.json({
    data: {
      orders: orders.rows,
      transports: transports.rows,
      profiles: profiles.rows,
      order_finance: finance,
    },
    capabilities: { workflowRead: true, workflowWrite: false },
  });
}

