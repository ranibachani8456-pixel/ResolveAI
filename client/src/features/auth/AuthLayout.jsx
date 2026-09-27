import { Link } from "react-router-dom";

export default function AuthLayout({ title, description, footer, children }) {
  return (
    <main className="auth-page">
      <section className="auth-intro" aria-label="ResolveAI product overview">
        <div className="auth-intro__content">
          <Link className="auth-brand" to="/"><span className="brand-mark">R</span><span>ResolveAI</span></Link>
          <div>
            <p className="auth-intro__eyebrow">Support operations, resolved</p>
            <h1>One workspace for customer context and grounded answers.</h1>
            <p>Manage support workflows, organize your knowledge base, and help agents answer accurately with tenant-safe AI.</p>
          </div>
          <div className="auth-intro__proof">
            <span>Multi-tenant by design</span>
            <span>Role-aware workflows</span>
            <span>Grounded knowledge answers</span>
          </div>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-card__heading">
            <p className="page-header__eyebrow">ResolveAI workspace</p>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          {children}
          <div className="auth-card__footer">{footer}</div>
        </div>
      </section>
    </main>
  );
}
