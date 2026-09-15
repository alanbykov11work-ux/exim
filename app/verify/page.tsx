"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthHero from "@/components/AuthHero";

function Step({
  n,
  title,
  text,
  done,
}: {
  n: number;
  title: string;
  text: string;
  done?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 14, textAlign: "left" }}>
      <div
        style={{
          width: 28,
          height: 28,
          flex: "none",
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          fontSize: 13,
          fontWeight: 650,
          background: done ? "#f2f9f3" : "#f0f0ec",
          border: `1px solid ${done ? "#c4e3c9" : "var(--border-strong)"}`,
          color: done ? "#1c6b2c" : "var(--ink-2)",
        }}
      >
        {done ? "✓" : n}
      </div>
      <div style={{ paddingBottom: 18 }}>
        <div style={{ fontWeight: 600, fontSize: 14.5 }}>{title}</div>
        <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 2 }}>
          {text}
        </div>
      </div>
    </div>
  );
}

function VerifyInner() {
  const params = useSearchParams();
  const router = useRouter();
  const supabase = createClient();
  const emailFromUrl = params.get("email") || "";
  const [msg, setMsg] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!cooldown) return;
    const t = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // как только почта подтверждена (в т.ч. в другой вкладке) — уводим в кабинет
  useEffect(() => {
    const iv = setInterval(async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user?.email_confirmed_at) {
        router.replace("/confirmed");
        router.refresh();
      }
    }, 4000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (error) {
      setMsg({ kind: "error", text: error.message });
    } else {
      setMsg({ kind: "ok", text: "Письмо отправлено повторно на " + email });
      setCooldown(60);
    }
  }

  return (
    <div className="auth-wrap">
      <AuthHero />
      <div className="auth-form-wrap">
        <div className="auth-card">
          <span className="eyebrow">Шаг 2 из 2 — верификация</span>
          <h2>Подтвердите почту</h2>

          {emailFromUrl && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "10px 13px",
                marginBottom: 22,
                fontSize: 14.5,
                background: "var(--card)",
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-10 6L2 7" />
              </svg>
              <b style={{ fontWeight: 600 }}>{emailFromUrl}</b>
            </div>
          )}

          <Step
            n={1}
            done
            title="Аккаунт создан"
            text="Мы отправили письмо со ссылкой подтверждения."
          />
          <Step
            n={2}
            title="Перейдите по ссылке из письма"
            text="Откройте письмо «Подтвердите почту — EXIM Super App» и нажмите красную кнопку. Проверьте папку «Спам», если письма не видно."
          />

          {msg && <div className={`auth-msg ${msg.kind}`}>{msg.text}</div>}

          <button
            className="btn btn-quiet btn-lg"
            onClick={resend}
            disabled={busy || cooldown > 0}
            style={{ marginTop: 6 }}
          >
            {cooldown > 0
              ? `Отправить ещё раз (${cooldown} c)`
              : busy
                ? "Отправляем…"
                : "Отправить письмо ещё раз"}
          </button>

          <div className="auth-alt">
            <a href="/login">← Вернуться ко входу</a>
          </div>

          <div className="auth-foot">
            Эта страница сама обновится, как только вы подтвердите почту.
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
