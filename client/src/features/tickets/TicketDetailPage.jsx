import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ticketApi } from "../../api/ticketApi.js";
import { organizationApi } from "../../api/organizationApi.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";
import { canManageTeam, canWrite } from "../../constants/roles.js";
import { enumLabel, TICKET_PRIORITIES, TICKET_STATUSES } from "../../constants/tickets.js";
import { formatDateTime } from "../../utils/format.js";
import Button from "../../components/common/Button.jsx";
import Badge from "../../components/common/Badge.jsx";
import Avatar from "../../components/common/Avatar.jsx";
import Icon from "../../components/common/Icon.jsx";
import { Field, Select, Textarea } from "../../components/common/FormControls.jsx";
import PageSkeleton from "../../components/feedback/PageSkeleton.jsx";
import { EmptyState, ErrorState } from "../../components/feedback/States.jsx";

const MessageItem = memo(function MessageItem({ message }) {
  const sender = message.user?.name || message.customer?.name || enumLabel(message.senderType);
  return (
    <article className={`ticket-message ticket-message--${message.senderType.toLowerCase()}`}>
      <Avatar name={sender} size="small" />
      <div><header><strong>{sender}</strong><span>{enumLabel(message.senderType)} · {formatDateTime(message.createdAt)}</span></header><p>{message.content}</p></div>
    </article>
  );
});

export default function TicketDetailPage() {
  const { ticketId } = useParams();
  const { user } = useAuth();
  const { notify } = useToast();
  const [state, setState] = useState({ loading: true, error: "", ticket: null, messages: [], users: [] });
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState("");
  const messagesEnd = useRef(null);

  const load = useCallback(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: "" }));
    const userRequest = canManageTeam(user.role)
      ? organizationApi.users(controller.signal)
      : Promise.resolve({ data: { users: [] } });
    Promise.all([
      ticketApi.get(ticketId, controller.signal),
      ticketApi.messages(ticketId, controller.signal),
      userRequest,
    ]).then(([ticket, messages, users]) => setState({
      loading: false,
      error: "",
      ticket: ticket.data.ticket,
      messages: messages.data.messages,
      users: users.data.users,
    })).catch((error) => {
      if (error.name !== "AbortError") setState((current) => ({ ...current, loading: false, error: error.message }));
    });
    return controller;
  }, [ticketId, user.role]);

  useEffect(() => {
    const controller = load();
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ block: "nearest" });
  }, [state.messages.length]);

  const updateTicket = async (field, value) => {
    if (updating) return;
    setUpdating(field);
    try {
      const response = await ticketApi.update(ticketId, { [field]: value });
      setState((current) => ({ ...current, ticket: response.data.ticket }));
      notify("Ticket updated.", "success");
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setUpdating("");
    }
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    if (sending || !message.trim()) return;
    setSending(true);
    try {
      const response = await ticketApi.sendMessage(ticketId, message.trim());
      setState((current) => ({ ...current, messages: [...current.messages, response.data.message] }));
      setMessage("");
      notify("Reply added to the ticket.", "success");
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setSending(false);
    }
  };

  if (state.loading) return <PageSkeleton rows={7} />;
  if (state.error) return <ErrorState title="Unable to load ticket" message={state.error} onRetry={load} />;
  const { ticket } = state;

  return (
    <div className="page ticket-detail-page">
      <div className="breadcrumb"><Link to="/app/tickets">Tickets</Link><Icon name="arrow" size={13} /><span>#{ticket.id}</span></div>
      <header className="ticket-heading">
        <div><div className="ticket-heading__meta"><span className="mono-id">Ticket #{ticket.id}</span><Badge value={ticket.status} /><Badge value={ticket.priority} /></div><h1>{ticket.subject}</h1><p>Opened by {ticket.customer.name} on {formatDateTime(ticket.createdAt)}</p></div>
      </header>

      <div className="ticket-detail-grid">
        <section className="panel conversation-panel">
          <div className="panel__header"><div><h2>Conversation</h2><p>{state.messages.length} message{state.messages.length === 1 ? "" : "s"}</p></div></div>
          <div className="ticket-description"><span>Original request</span><p>{ticket.description}</p></div>
          <div className="message-thread">
            {state.messages.length ? state.messages.map((item) => <MessageItem message={item} key={item.id} />) : <EmptyState title="No replies yet" description="The original request is ready for your first response." />}
            <div ref={messagesEnd} />
          </div>
          {canWrite(user.role) ? (
            <form className="reply-composer" onSubmit={sendMessage}>
              <Field label="Add internal support reply" htmlFor="ticket-reply"><Textarea id="ticket-reply" rows="4" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write a clear update for the support thread…" required /></Field>
              <div className="reply-composer__actions"><span>Reply is recorded as a support-agent message.</span><Button type="submit" icon="send" loading={sending} disabled={!message.trim()}>Send reply</Button></div>
            </form>
          ) : <div className="read-only-note">You have read-only access to this ticket.</div>}
        </section>

        <aside className="ticket-sidebar">
          <section className="panel detail-panel">
            <div className="panel__header"><div><h2>Ticket details</h2><p>Ownership and workflow</p></div></div>
            {canWrite(user.role) ? (
              <>
                <Field label="Status" htmlFor="detail-status"><Select id="detail-status" value={ticket.status} disabled={Boolean(updating)} onChange={(event) => updateTicket("status", event.target.value)}>{TICKET_STATUSES.map((value) => <option value={value} key={value}>{enumLabel(value)}</option>)}</Select></Field>
                <Field label="Priority" htmlFor="detail-priority"><Select id="detail-priority" value={ticket.priority} disabled={Boolean(updating)} onChange={(event) => updateTicket("priority", event.target.value)}>{TICKET_PRIORITIES.map((value) => <option value={value} key={value}>{enumLabel(value)}</option>)}</Select></Field>
                {canManageTeam(user.role) ? <Field label="Assigned to" htmlFor="detail-assignee"><Select id="detail-assignee" value={ticket.assignedToId ?? ""} disabled={Boolean(updating)} onChange={(event) => updateTicket("assignedToId", event.target.value ? Number(event.target.value) : null)}><option value="">Unassigned</option>{state.users.map((member) => <option value={member.id} key={member.id}>{member.name} · {enumLabel(member.role)}</option>)}</Select></Field> : null}
              </>
            ) : (
              <dl className="definition-list"><div><dt>Status</dt><dd><Badge value={ticket.status} /></dd></div><div><dt>Priority</dt><dd><Badge value={ticket.priority} /></dd></div><div><dt>Assigned to</dt><dd>{ticket.assignedTo?.name || "Unassigned"}</dd></div></dl>
            )}
          </section>
          <section className="panel detail-panel">
            <div className="panel__header"><div><h2>Customer</h2></div></div>
            <Link className="customer-summary" to={`/app/customers/${ticket.customer.id}`}><Avatar name={ticket.customer.name} /><div><strong>{ticket.customer.name}</strong><span>{ticket.customer.email}</span></div><Icon name="arrow" size={15} /></Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
