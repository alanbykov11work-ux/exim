import { redirect } from "next/navigation";
import { currentSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await currentSessionUser();
  if (!user) redirect("/login");
  if (!user.emailConfirmedAt) redirect("/verify");
  redirect("/app");
}
