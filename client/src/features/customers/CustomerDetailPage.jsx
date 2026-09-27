import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { customerApi } from "../../api/customerApi.js";
import { ticketApi } from "../../api/ticketApi.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";
import { canWrite } from "../../constants/roles.js";
import { formatDateTime, formatRelativeTime } from "../../utils/format.js";
import PageHeader from "../../components/common/PageHeader.jsx";
import Avatar from "../../components/common/Avatar.jsx";
import Badge from "../../components/common/Badge.jsx";
import Button from "../../components/common/Button.jsx";
import Icon from "../../components/common/Icon.jsx";
import Modal from "../../components/common/Modal.jsx";
import { Field, Input } from "../../components/common/FormControls.jsx";
import PageSkeleton from "../../components/feedback/PageSkeleton.jsx";
import { EmptyState, ErrorState } from "../../components/feedback/States.jsx";

export default function CustomerDetailPage() {
  const { customerId } = useParams();
  const { user } = useAuth();
  const { notify } = useToast();
  const [state, setState] = useState({ loading: true, error: "", customer: null, tickets: [] });
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "" });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    const controller = new AbortController();
    Promise.all([customerApi.get(customerId, controller.signal), ticketApi.list({ customerId }, controller.signal)])
      .then(([customer, tickets]) => {
        setState({ loading: false, error: "", customer: customer.data.customer, tickets: tickets.data.tickets });
        setForm({ name: customer.data.customer.name, email: customer.data.customer.email });
      }).catch((error) => {
        if (error.name !== "AbortError") setState((current) => ({ ...current, loading: false, error: error.message }));
      });
    return controller;
  }, [customerId]);
  useEffect(() => { const controller = load(); return () => controller.abort(); }, [load]);

  const update = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true); setFormError("");
    try {
      const response = await customerApi.update(customerId, form);
      setState((current) => ({ ...current, customer: response.data.customer }));
      setEditOpen(false);
      notify("Customer updated.", "success");
    } catch (error) { setFormError(error.message); } finally { setSubmitting(false); }
  };

  if (state.loading) return <PageSkeleton />;
  if (state.error) return <ErrorState title="Unable to load customer" message={state.error} onRetry={load} />;
  const { customer } = state;
  return (
    <div className="page">
      <div className="breadcrumb"><Link to="/app/customers">Customers</Link><Icon name="arrow" size={13} /><span>{customer.name}</span></div>
      <PageHeader title={customer.name} description={customer.email} actions={canWrite(user.role) ? <Button variant="secondary" onClick={() => setEditOpen(true)}>Edit customer</Button> : null} />
      <div className="customer-detail-grid">
        <section className="panel customer-profile"><Avatar name={customer.name} size="large" /><div><h2>{customer.name}</h2><a href={`mailto:${customer.email}`}>{customer.email}</a></div><dl className="definition-list"><div><dt>Customer ID</dt><dd>#{customer.id}</dd></div><div><dt>Added</dt><dd>{formatDateTime(customer.createdAt)}</dd></div><div><dt>Last updated</dt><dd>{formatDateTime(customer.updatedAt)}</dd></div></dl></section>
        <section className="panel panel--flush"><div className="panel__header"><div><h2>Support history</h2><p>{state.tickets.length} associated ticket{state.tickets.length === 1 ? "" : "s"}</p></div></div>{state.tickets.length ? <div className="compact-list">{state.tickets.map((ticket) => <Link className="compact-ticket" to={`/app/tickets/${ticket.id}`} key={ticket.id}><div className="compact-ticket__id">#{ticket.id}</div><div className="compact-ticket__main"><strong>{ticket.subject}</strong><span>Updated {formatRelativeTime(ticket.updatedAt)}</span></div><Badge value={ticket.status} /><Badge value={ticket.priority} /><Icon name="arrow" size={16} /></Link>)}</div> : <EmptyState title="No support history" description="Tickets created for this customer will appear here." />}</section>
      </div>
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit customer" footer={<><Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button><Button form="edit-customer-form" type="submit" loading={submitting}>Save changes</Button></>}><form id="edit-customer-form" className="form-stack" onSubmit={update}>{formError ? <div className="inline-alert inline-alert--error" role="alert">{formError}</div> : null}<Field label="Full name" htmlFor="edit-customer-name"><Input id="edit-customer-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></Field><Field label="Email" htmlFor="edit-customer-email"><Input id="edit-customer-email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required /></Field></form></Modal>
    </div>
  );
}
