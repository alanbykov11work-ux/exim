import Link from "next/link";
import AuthHero from "@/components/AuthHero";

export default function VerifyPage() {
  return (
    <div className="auth-wrap">
      <AuthHero />
      <div className="auth-form-wrap">
        <div className="auth-card">
          <span className="eyebrow">Подтверждение почты</span>
          <h2>Проверьте почту</h2>
          <div className="auth-msg info">Подтверждение по email будет включено после подключения SMTP. В текущем тестовом контуре новые аккаунты подтверждаются автоматически.</div>
          <div className="auth-alt"><Link href="/login">Вернуться ко входу</Link></div>
        </div>
      </div>
    </div>
  );
}
