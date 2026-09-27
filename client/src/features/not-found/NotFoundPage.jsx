import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <main className="not-found">
      <div className="brand-mark">R</div>
      <p className="page-header__eyebrow">404 · ResolveAI</p>
      <h1>This page isn’t in the support queue</h1>
      <p>The address may be incorrect or the resource may no longer be available.</p>
      <Link className="button button--primary button--medium" to="/app/dashboard">Return to dashboard</Link>
    </main>
  );
}
