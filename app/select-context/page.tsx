import { redirect } from "next/navigation";
import AccessContextChooser from "@/components/AccessContextChooser";
import { currentSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function SelectContextPage() {
  const user = await currentSessionUser();
  if (!user) redirect("/login");
  if (!user.emailConfirmedAt) redirect("/verify");
  return <AccessContextChooser />;
}
