import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ticketApi } from "../../api/ticketApi.js";
import { documentApi } from "../../api/documentApi.js";
import { useAuth } from "../../hooks/useAuth.js";
import { canWrite, canUploadDocuments } from "../../constants/roles.js";
import { enumLabel } from "../../constants/tickets.js";
import { formatRelativeTime } from "../../utils/format.js";
import PageHeader from "../../components/common/PageHeader.jsx";
import Badge from "../../components/common/Badge.jsx";
import Icon from "../../components/common/Icon.jsx";
import PageSkeleton from "../../components/feedback/PageSkeleton.jsx";
import { EmptyState, ErrorState } from "../../components/feedback/States.jsx";

function Stat({ label, value, detail, tone = "neutral" }) {
  return (
    <div className="metric">
      <span className={`metric__indicator metric__indicator--${tone}`} />
      <div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, error: "", tickets: [], documents: [] });

  const load = useCallback(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: "" }));
    Promise.all([
      ticketApi.list({}, controller.signal),
      documentApi.list(controller.signal),
    ]).then(([tickets, documents]) => {
      setState({
        loading: false,
        error: "",
        tickets: tickets.data.tickets,
        documents: documents.data.documents,
      });
    }).catch((error) => {
      if (error.name !== "AbortError") setState((current) => ({ ...current, loading: false, error: error.message }));
    });
    return controller;
  }, []);

  useEffect(() => {
    const controller = load();
    return () => controller.abort();
  }, [load]);

  const metrics = useMemo(() => {
    const open = state.tickets.filter(({ status }) => !["RESOLVED", "CLOSED"].includes(status)).length;
    const urgent = state.tickets.filter(({ priority }) => priority === "URGENT").length;
    const unassigned = state.tickets.filter(({ assignedToId, status }) => !assignedToId && !["RESOLVED", "CLOSED"].includes(status)).length;
    const ready = state.documents.filter(({ status }) => status === "READY").length;
    return { open, urgent, unassigned, ready };
  }, [state.tickets, state.documents]);

  if (state.loading) return <PageSkeleton />;
  if (state.error) return <ErrorState message={state.error} onRetry={load} />;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Operations overview"
        title={`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${user.name.split(" ")[0]}`}
        description="Monitor active support work and knowledge readiness across your organization."
        actions={<Link className="button button--secondary button--medium" to="/app/ai"><Icon name="ai" size={16} />Ask the knowledge base</Link>}
      />

      <section className="metrics-grid" aria-label="Support metrics">
        <Stat label="Active tickets" value={metrics.open} detail={`${state.tickets.length} total`} tone="blue" />
        <Stat label="Urgent priority" value={metrics.urgent} detail="Requires attention" tone="red" />
        <Stat label="Unassigned" value={metrics.unassigned} detail="Active queue" tone="amber" />
        <Stat label="Ready documents" value={metrics.ready} detail={`${state.documents.length} uploaded`} tone="green" />
      </section>

      <div className="dashboard-grid">
        <section className="panel panel--flush">
          <div className="panel__header"><div><h2>Recent tickets</h2><p>Newest customer requests</p></div><Link to="/app/tickets">View all <Icon name="arrow" size={14} /></Link></div>
          {state.tickets.length ? (
            <div className="compact-list">
              {state.tickets.slice(0, 6).map((ticket) => (
                <Link className="compact-ticket" to={`/app/tickets/${ticket.id}`} key={ticket.id}>
                  <div className="compact-ticket__id">#{ticket.id}</div>
                  <div className="compact-ticket__main"><strong>{ticket.subject}</strong><span>{ticket.customer.name} · {formatRelativeTime(ticket.createdAt)}</span></div>
                  <Badge value={ticket.status} />
                  <Badge value={ticket.priority} />
                  <Icon name="arrow" size={16} />
                </Link>
              ))}
            </div>
          ) : <EmptyState title="No tickets yet" description="New customer requests will appear here." />}
        </section>

        <aside className="dashboard-side">
          <section className="panel">
            <div className="panel__header"><div><h2>Queue health</h2><p>Current ticket distribution</p></div></div>
            <div className="distribution-list">
              {["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"].map((status) => {
                const count = state.tickets.filter((ticket) => ticket.status === status).length;
                const percentage = state.tickets.length ? Math.round((count / state.tickets.length) * 100) : 0;
                return <div key={status}><div><span>{enumLabel(status)}</span><strong>{count}</strong></div><span className="progress"><i style={{ width: `${percentage}%` }} /></span></div>;
              })}
            </div>
          </section>
          <section className="panel quick-actions">
            <div className="panel__header"><div><h2>Quick actions</h2><p>Common support workflows</p></div></div>
            {canWrite(user.role) ? <Link to="/app/tickets?create=1"><Icon name="plus" />Create a ticket</Link> : null}
            {canWrite(user.role) ? <Link to="/app/customers?create=1"><Icon name="customers" />Add a customer</Link> : null}
            {canUploadDocuments(user.role) ? <Link to="/app/knowledge"><Icon name="upload" />Upload knowledge</Link> : null}
            <Link to="/app/ai"><Icon name="ai" />Start an AI conversation</Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
