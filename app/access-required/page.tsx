import Link from "next/link";

export default function AccessRequiredPage() {
  return (
    <main className="app-boot">
      <div className="auth-card" style={{ maxWidth: 520 }}>
        <span className="eyebrow">Доступ к рабочему пространству</span>
        <h2>Права ещё не настроены</h2>
        <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
          Аккаунт подтверждён, но ему не назначена компания и рабочая роль.
          Обратитесь к администратору EXIM. Данные других компаний не открыты.
        </p>
        <Link className="btn btn-primary btn-lg" href="/login">
          Вернуться ко входу
        </Link>
      </div>
    </main>
  );
}
