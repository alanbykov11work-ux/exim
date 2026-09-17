"use client";

import { useEffect, useState } from "react";

type Context = {
  membershipId: string;
  workspaceName: string;
  organizationName: string;
  role: "client" | "manager" | "logistician" | "tenant_admin";
  clientCompanyName: string | null;
};

const roleLabels: Record<Context["role"], string> = {
  client: "Клиент",
  manager: "Менеджер",
  logistician: "Логист",
  tenant_admin: "Администратор компании",
};

export default function AccessContextChooser() {
  const [contexts, setContexts] = useState<Context[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/access-context", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Не удалось загрузить доступы.");
      setContexts(body.data ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить доступы.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function choose(membershipId: string) {
    setSelecting(membershipId);
    setError(null);
    try {
      const response = await fetch("/api/access-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membership_id: membershipId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Не удалось выбрать рабочий контур.");
      window.location.assign("/app");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось выбрать рабочий контур.");
      setSelecting(null);
    }
  }

  return (
    <main className="app-boot">
      <section className="auth-card" style={{ maxWidth: 620, width: "calc(100% - 32px)" }}>
        <span className="eyebrow">Рабочий контур</span>
        <h2>Выберите компанию и роль</h2>
        <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
          Вы увидите только данные выбранной компании. Роль нельзя повысить переключателем — список формируется сервером из назначенных доступов.
        </p>

        {loading && <p>Загружаем доступы…</p>}
        {!loading && contexts.length === 0 && (
          <div className="auth-msg error">
            Активных доступов нет. Обратитесь к администратору вашей компании.
          </div>
        )}
        <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
          {contexts.map((context) => (
            <button
              key={context.membershipId}
              className="btn btn-primary"
              style={{ textAlign: "left", padding: 16, height: "auto" }}
              disabled={Boolean(selecting)}
              onClick={() => void choose(context.membershipId)}
            >
              <strong>{context.clientCompanyName || context.workspaceName}</strong>
              <span style={{ display: "block", opacity: 0.85, marginTop: 4 }}>
                {context.organizationName} · {roleLabels[context.role]}
              </span>
              {selecting === context.membershipId && (
                <span style={{ display: "block", marginTop: 6 }}>Открываем…</span>
              )}
            </button>
          ))}
        </div>
        {error && <div className="auth-msg error" style={{ marginTop: 16 }}>{error}</div>}
        {error && (
          <button className="btn" style={{ marginTop: 12 }} onClick={() => void load()}>
            Повторить
          </button>
        )}
        <button
          className="btn"
          style={{ marginTop: 24 }}
          onClick={async () => {
            await fetch("/auth/logout", { method: "POST" });
            window.location.assign("/login");
          }}
        >
          Выйти
        </button>
      </section>
    </main>
  );
}
