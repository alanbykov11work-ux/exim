"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthHero from "@/components/AuthHero";

function VerifyInner() {
  const params = useSearchParams();
  const router = useRouter();
  const supabase = createClient();
  const emailFromUrl = params.get("email") || "";
  const [msg, setMsg] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(
    params.get("sent")
      ? { kind: "info", text: "Письмо с подтверждением отправлено. Проверьте почту (и папку «Спам»)." }
      : null
  );
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true);
    setMsg(null);
    let email = emailFromUrl;
    if (!email) {
      const { data } = await supabase.auth.getUser();
      email = data.user?.email || "";
    }
    if (!email) {
      setMsg({ kind: "error", text: "Не удалось определить email. Войдите заново." });
      setBusy(false);
      return;
    }
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    setMsg(
      error
        ? { kind: "error", text: error.message }
        : { kind: "ok", text: "Письмо отправлено повторно на " + email }
    );
  }

  async function checkConfirmed() {
    setBusy(true);
    const { data } = await supabase.auth.getUser();
    setBusy(false);
    if (data.user?.email_confirmed_at) {
      router.push("/app");
      router.refresh();
    } else {
      setMsg({
        kind: "info",
        text: "Почта пока не подтверждена. Перейдите по ссылке из письма, затем нажмите «Я подтвердил».",
      });
    }
  }

  return (
    <div className="auth-wrap">
      <AuthHero />
      <div className="auth-form-wrap">
        <div className="auth-card" style={{ textAlign: "center" }}>
          <span className="eyebrow">Верификация</span>
          <h2>Подтвердите почту</h2>
          <p style={{ color: "var(--muted)", fontSize: 14.5, marginBottom: 20 }}>
            Мы отправили письмо со ссылкой подтверждения
            {emailFromUrl ? (
              <>
                {" "}на <b style={{ color: "var(--ink)" }}>{emailFromUrl}</b>
              </>
            ) : null}
            . Без подтверждения почты вход в приложение закрыт.
          </p>

          {msg && <div className={`auth-msg ${msg.kind}`}>{msg.text}</div>}

          <button className="btn btn-primary btn-lg" onClick={checkConfirmed} disabled={busy}>
            Я подтвердил — продолжить
          </button>
          <div style={{ height: 10 }} />
          <button className="btn btn-quiet btn-lg" onClick={resend} disabled={busy}>
            Отправить письмо ещё раз
          </button>

          <div className="auth-alt">
            <a href="/login">← Вернуться ко входу</a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyInner />
    </Suspense>
  );
}
