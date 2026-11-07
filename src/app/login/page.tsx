import { ArrowRight, Eye, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { credentialsLogin, demoLogin, googleLogin } from "./actions";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const demoEnabled = process.env.AUTH_MODE !== "production" && process.env.AUTH_DEMO_ENABLED !== "false";
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand-mark">UT</div>
        <p className="eyebrow">UTERO OPERATIONS</p>
        <h1>Satu ruang kerja untuk melihat apa yang bergerak dan apa yang tertahan.</h1>
        <p>Proyek desain, KPI operasional, onboarding, bukti, dan keputusan manajer berada dalam satu alur yang dapat diaudit.</p>
        <div className="login-points">
          <span><Eye size={18} /> Risiko terlihat lebih awal</span>
          <span><ShieldCheck size={18} /> Perubahan penting tercatat</span>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <p className="eyebrow">AKSES INTERNAL</p>
          <h2>Masuk ke dashboard</h2>
          <p className="muted">{demoEnabled ? "Mode pengembangan memakai akun lokal." : "Masuk dengan akun Google yang telah terdaftar."}</p>
          {demoEnabled ? <form action={credentialsLogin} className="form-stack">
            <label>Email<input name="email" type="email" defaultValue="admin@utero.local" required /></label>
            <label>Password<input name="password" type="password" required /></label>
            <button className="primary-button">Masuk<ArrowRight size={17} /></button>
          </form> : null}
          {demoEnabled && googleEnabled ? <div className="or-line"><span>atau</span></div> : null}
          {demoEnabled ? <form action={demoLogin}><button className="secondary-button login-option"><LockKeyhole size={17} /> Masuk sebagai Admin Demo</button></form> : null}
          {googleEnabled ? <form action={googleLogin}><button className="secondary-button login-option"><Mail size={17} /> Masuk dengan Google</button></form> : null}
          {demoEnabled ? <p className="tiny-note">Akun demo hanya aktif pada environment development.</p> : null}
        </div>
      </section>
    </main>
  );
}


