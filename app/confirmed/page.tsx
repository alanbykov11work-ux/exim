"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthHero from "@/components/AuthHero";

export default function ConfirmedPage() {
  const router = useRouter();
  const [sec, setSec] = useState(5);

  useEffect(() => {
    const t = setInterval(() => setSec((s) => (s > 0 ? s - 1 : 0)), 1000);
    const r = setTimeout(() => {
      router.replace("/app");
      router.refresh();
    }, 5000);
    return () => {
      clearInterval(t);
      clearTimeout(r);
    };
  }, [router]);

  return (
    <div className="auth-wrap">
      <AuthHero />
      <div className="auth-form-wrap">
        <div className="auth-card" style={{ textAlign: "center" }}>
          <div
            aria-hidden
            style={{
              width: 64,
              height: 64,
              margin: "0 auto 22px",
              borderRadius: "50%",
              background: "#f2f9f3",
              border: "1px solid #c4e3c9",
              display: "grid",
              placeItems: "center",
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1c6b2c" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <span className="eyebrow">Верификация завершена</span>
          <h2>Почта подтверждена</h2>
          <p style={{ color: "var(--muted)", fontSize: 14.5, marginBottom: 26 }}>
            Ваш аккаунт активирован. Через {sec} сек. вы автоматически попадёте
            в личный кабинет.
          </p>
          <button
            className="btn btn-primary btn-lg"
            onClick={() => {
              router.replace("/app");
              router.refresh();
            }}
          >
            Перейти в кабинет
          </button>
        </div>
      </div>
    </div>
  );
}
