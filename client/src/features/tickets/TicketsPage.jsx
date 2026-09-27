import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ticketApi } from "../../api/ticketApi.js";
import { customerApi } from "../../api/customerApi.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";
import { canWrite } from "../../constants/roles.js";
import { enumLabel, TICKET_PRIORITIES, TICKET_STATUSES } from "../../constants/tickets.js";
import { formatRelativeTime } from "../../utils/format.js";
import PageHeader from "../../components/common/PageHeader.jsx";
import Button from "../../components/common/Button.jsx";
import Badge from "../../components/common/Badge.jsx";
import Icon from "../../components/common/Icon.jsx";
import Modal from "../../components/common/Modal.jsx";
import { Field, Input, Select, Textarea } from "../../components/common/FormControls.jsx";
import PageSkeleton from "../../components/feedback/PageSkeleton.jsx";
import { EmptyState, ErrorState } from "../../components/feedback/States.jsx";

const initialTicket = { customerId: "", subject: "", description: "", priority: "MEDIUM" };

const TicketRow = memo(function TicketRow({ ticket }) {
  return (
    <Link className="data-row ticket-row" to={`/app/tickets/${ticket.id}`}>
      <div className="data-row__primary"><span className="mono-id">#{ticket.id}</span><div><strong>{ticket.subject}</strong><span>{ticket.customer.name}</span></div></div>
      <div><Badge value={ticket.status} /></div>
      <div><Badge value={ticket.priority} /></div>
      <div className="assignee-cell">{ticket.assignedTo?.name || <span className="muted">Unassigned</span>}</div>
      <time>{formatRelativeTime(ticket.updatedAt)}</time>
      <Icon name="arrow" size={16} />
    </Link>
  );
});

export default function TicketsPage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState({ loading: true, error: "", tickets: [], customers: [] });
  const [filters, setFilters] = useState({ status: "", priority: "", search: "" });
  const [createOpen, setCreateOpen] = useState(searchParams.get("create") === "1");
  const [form, setForm] = useState(initialTicket);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: "" }));
    Promise.all([
      ticketApi.list({ status: filters.status, priority: filters.priority }, controller.signal),
      customerApi.list(controller.signal),
    ]).then(([tickets, customers]) => setState({
      loading: false, error: "", tickets: tickets.data.tickets, customers: customers.data.customers,
    })).catch((error) => {
      if (error.name !== "AbortError") setState((current) => ({ ...current, loading: false, error: error.message }));
    });
    return controller;
  }, [filters.status, filters.priority]);

  useEffect(() => {
    const controller = load();
    return () => controller.abort();
  }, [load]);

  const visibleTickets = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    if (!search) return state.tickets;
    return state.tickets.filter((ticket) => (
      ticket.subject.toLowerCase().includes(search) ||
      ticket.customer.name.toLowerCase().includes(search) ||
      String(ticket.id).includes(search)
    ));
  }, [state.tickets, filters.search]);

  const closeCreate = () => {
    setCreateOpen(false);
    setSearchParams((current) => { current.delete("create"); return current; }, { replace: true });
    setForm(initialTicket);
    setFormError("");
  };

  const createTicket = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFormError("");
    try {
      const response = await ticketApi.create({ ...form, customerId: Number(form.customerId) });
      setState((current) => ({ ...current, tickets: [response.data.ticket, ...current.tickets] }));
      notify("Ticket created successfully.", "success");
      closeCreate();
    } catch (error) {
      setFormError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (state.loading) return <PageSkeleton />;
  if (state.error) return <ErrorState message={state.error} onRetry={load} />;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Support queue"
        title="Tickets"
        description="Prioritize requests, assign ownership, and keep every customer conversation moving."
        actions={canWrite(user.role) ? <Button icon="plus" onClick={() => setCreateOpen(true)}>New ticket</Button> : null}
      />
      <section className="toolbar" aria-label="Ticket filters">
        <label className="search-control"><Icon name="search" /><span className="sr-only">Search tickets</span><Input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Search by subject, customer, or ID" /></label>
        <Select aria-label="Filter by status" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
          <option value="">All statuses</option>{TICKET_STATUSES.map((value) => <option key={value} value={value}>{enumLabel(value)}</option>)}
        </Select>
        <Select aria-label="Filter by priority" value={filters.priority} onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value }))}>
          <option value="">All priorities</option>{TICKET_PRIORITIES.map((value) => <option key={value} value={value}>{enumLabel(value)}</option>)}
        </Select>
        <span className="toolbar__count">{visibleTickets.length} ticket{visibleTickets.length === 1 ? "" : "s"}</span>
      </section>

      <section className="data-list" aria-label="Tickets">
        <div className="data-list__header ticket-row"><span>Ticket</span><span>Status</span><span>Priority</span><span>Assignee</span><span>Updated</span><span /></div>
        {visibleTickets.length ? visibleTickets.map((ticket) => <TicketRow ticket={ticket} key={ticket.id} />) : (
          <EmptyState title="No tickets found" description="Adjust the filters or create a new customer request." />
        )}
      </section>

      <Modal open={createOpen} onClose={closeCreate} title="Create ticket" description="Open a support request for an existing customer." footer={<><Button variant="secondary" onClick={closeCreate}>Cancel</Button><Button type="submit" form="create-ticket-form" loading={submitting}>Create ticket</Button></>}>
        <form id="create-ticket-form" className="form-stack" onSubmit={createTicket}>
          {formError ? <div className="inline-alert inline-alert--error" role="alert">{formError}</div> : null}
          <Field label="Customer" htmlFor="ticket-customer"><Select id="ticket-customer" value={form.customerId} onChange={(event) => setForm((current) => ({ ...current, customerId: event.target.value }))} required><option value="">Select a customer</option>{state.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.email}</option>)}</Select></Field>
          <Field label="Subject" htmlFor="ticket-subject"><Input id="ticket-subject" maxLength="255" value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} required /></Field>
          <Field label="Description" htmlFor="ticket-description"><Textarea id="ticket-description" rows="5" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} required /></Field>
          <Field label="Priority" htmlFor="ticket-priority"><Select id="ticket-priority" value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}>{TICKET_PRIORITIES.map((value) => <option key={value} value={value}>{enumLabel(value)}</option>)}</Select></Field>
        </form>
      </Modal>
    </div>
  );
}
