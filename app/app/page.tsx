import { redirect } from "next/navigation";
import EximApp from "@/components/EximApp";
import { currentActor, currentSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const user = await currentSessionUser();
  if (!user) redirect("/login");
  if (!user.emailConfirmedAt) redirect("/verify");
  const actor = await currentActor();
  if (!actor) redirect("/access-required?code=no-membership");

  return (
    <EximApp
      user={{
        id: actor.id,
        email: actor.email,
        role:
          actor.role === "logistician"
            ? "logist"
            : actor.role === "tenant_admin"
              ? "admin"
              : actor.role,
        workspaceId: actor.workspaceId,
        clientCompanyId: actor.clientCompanyId,
        fullName: actor.fullName,
        company: actor.company,
        phone: actor.phone,
        bin: actor.bin,
        verified: actor.verified,
      }}
    />
  );
}
