import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EximApp from "@/components/EximApp";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!user.email_confirmed_at) redirect("/verify");

  const { data: memberships, error: membershipError } = await supabase
    .from("workspace_memberships")
    .select("workspace_id, role, client_company_id")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (membershipError) redirect("/access-required?code=configuration");
  if (!memberships?.length) redirect("/access-required?code=no-membership");

  const workspaceIds = [...new Set(memberships.map((membership) => membership.workspace_id))];
  if (workspaceIds.length !== 1) redirect("/access-required?code=workspace-choice");

  const rolePriority = ["tenant_admin", "manager", "logistician", "client"];
  const activeRole = rolePriority.find((role) =>
    memberships.some((membership) => membership.role === role)
  );
  if (!activeRole) redirect("/access-required?code=invalid-role");

  const clientCompanyIds = [
    ...new Set(
      memberships
        .filter((membership) => membership.role === "client")
        .map((membership) => membership.client_company_id)
        .filter(Boolean)
    ),
  ];
  if (activeRole === "client" && clientCompanyIds.length !== 1) {
    redirect("/access-required?code=client-scope");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, company, phone, bin, role, verified")
    .eq("id", user.id)
    .single();

  return (
    <EximApp
      user={{
        id: user.id,
        email: user.email ?? "",
        role:
          activeRole === "logistician"
            ? "logist"
            : activeRole === "tenant_admin"
              ? "admin"
              : activeRole,
        workspaceId: workspaceIds[0],
        clientCompanyId:
          activeRole === "client" ? (clientCompanyIds[0] as string) : null,
        fullName: profile?.full_name ?? "",
        company: profile?.company ?? "",
        phone: profile?.phone ?? "",
        bin: profile?.bin ?? "",
        verified: profile?.verified ?? false,
      }}
    />
  );
}
