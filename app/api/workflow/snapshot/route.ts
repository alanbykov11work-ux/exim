import { NextResponse } from "next/server";
import { authorizeActor } from "@/lib/auth/authorize";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await authorizeActor({ moduleKey: "private_os" });
  if (!access.ok) return access.response;
  const { actor } = access;

  const staff = actor.role === "manager" || actor.role === "tenant_admin";
  const logistics = actor.role === "logistician";

  const orderFields = actor.role === "client"
    ? `id, workspace_id, client_company_id, ref, client_id, manager_id,
       origin, destination, transport, cargo, weight, container, comment,
       status, total_price, offer_comment, offer_sent_at, client_decision,
       client_decision_at, contract_signed_at, created_at, updated_at`
    : logistics
      ? `id, workspace_id, client_company_id, ref, client_id, manager_id, logist_id,
         origin, destination, transport, cargo, weight, container, comment,
         status, calc_deadline, calc_route, calc_days, calc_comment,
         calc_submitted_at, created_at, updated_at`
      : "*";

  const [orders, transports] = await Promise.all([
    query(
      `select ${orderFields} from orders
        where workspace_id = $1
          and ($2::boolean
            or ($3::boolean and logist_id = $4)
            or (client_company_id = $5))
        order by created_at desc`,
      [actor.workspaceId, staff, logistics, actor.id, actor.clientCompanyId]
    ),
    query(
      `select id, workspace_id, client_company_id, ref, order_id, client_id,
              manager_id, logist_id, origin, destination, status, progress,
              created_at, updated_at
         from transports
        where workspace_id = $1
          and ($2::boolean
            or ($3::boolean and logist_id = $4)
            or (client_company_id = $5))
        order by created_at desc`,
      [actor.workspaceId, staff, logistics, actor.id, actor.clientCompanyId]
    ),
  ]);

  const profiles = actor.role === "client"
    ? await query(
        `select p.id, p.full_name, p.email, p.company, null::text as staff_code, 'client'::text as role
           from profiles p
          where p.id = $1`,
        [actor.id]
      )
    : await query(
        `select p.id, p.full_name, p.email, p.company,
                case when m.role = 'client' then null else p.staff_code end as staff_code,
                case m.role when 'logistician' then 'logist'
                            when 'tenant_admin' then 'admin' else m.role end as role
           from workspace_memberships m
           join profiles p on p.id = m.user_id
          where m.workspace_id = $1 and m.status = 'active'
          order by p.full_name, p.email`,
        [actor.workspaceId]
      );

  let finance: unknown[] = [];
  if (staff) {
    const result = await query(
      `select f.* from order_finance f
        join orders o on o.id = f.order_id and o.workspace_id = f.workspace_id
       where o.workspace_id = $1`,
      [actor.workspaceId]
    );
    finance = result.rows;
  } else if (logistics) {
    const result = await query(
      `select f.order_id, f.workspace_id, f.cost, f.expenses, f.updated_at
         from order_finance f
         join orders o on o.id = f.order_id and o.workspace_id = f.workspace_id
        where o.workspace_id = $1 and o.logist_id = $2`,
      [actor.workspaceId, actor.id]
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
