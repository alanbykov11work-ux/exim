import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EximApp from "@/components/EximApp";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!user.email_confirmed_at) redirect("/verify");

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
        role: profile?.role ?? "client",
        fullName: profile?.full_name ?? "",
        company: profile?.company ?? "",
        phone: profile?.phone ?? "",
        bin: profile?.bin ?? "",
        verified: profile?.verified ?? false,
      }}
    />
  );
}
