import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { customerApi } from "../../api/customerApi.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";
import { canWrite } from "../../constants/roles.js";
import { formatRelativeTime } from "../../utils/format.js";
import PageHeader from "../../components/common/PageHeader.jsx";
import Button from "../../components/common/Button.jsx";
import Avatar from "../../components/common/Avatar.jsx";
import Icon from "../../components/common/Icon.jsx";
import Modal from "../../components/common/Modal.jsx";
import { Field, Input } from "../../components/common/FormControls.jsx";
import PageSkeleton from "../../components/feedback/PageSkeleton.jsx";
import { EmptyState, ErrorState } from "../../components/feedback/States.jsx";

const CustomerRow = memo(function CustomerRow({ customer }) {
  return (
    <Link className="data-row customer-row" to={`/app/customers/${customer.id}`}>
      <div className="data-row__primary"><Avatar name={customer.name} /><div><strong>{customer.name}</strong><span>Customer #{customer.id}</span></div></div>
      <span>{customer.email}</span>
      <time>{formatRelativeTime(customer.createdAt)}</time>
      <Icon name="arrow" size={16} />
    </Link>
  );
});

export default function CustomersPage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState({ loading: true, error: "", customers: [] });
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(searchParams.get("create") === "1");
  const [form, setForm] = useState({ name: "", email: "" });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    const controller = new AbortController();
    customerApi.list(controller.signal).then((response) => setState({ loading: false, error: "", customers: response.data.customers })).catch((error) => {
      if (error.name !== "AbortError") setState({ loading: false, error: error.message, customers: [] });
    });
    return controller;
  }, []);
  useEffect(() => { const controller = load(); return () => controller.abort(); }, [load]);

  const visibleCustomers = useMemo(() => {
    const value = search.trim().toLowerCase();
    return value ? state.customers.filter((customer) => customer.name.toLowerCase().includes(value) || customer.email.toLowerCase().includes(value)) : state.customers;
  }, [state.customers, search]);

  const close = () => {
    setCreateOpen(false);
    setSearchParams((current) => { current.delete("create"); return current; }, { replace: true });
    setForm({ name: "", email: "" });
    setFormError("");
  };

  const create = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFormError("");
    try {
      const response = await customerApi.create(form);
      setState((current) => ({ ...current, customers: [response.data.customer, ...current.customers] }));
      notify("Customer created successfully.", "success");
      close();
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
      <PageHeader eyebrow="Customer directory" title="Customers" description="Keep customer identities and their support history easy to find." actions={canWrite(user.role) ? <Button icon="plus" onClick={() => setCreateOpen(true)}>New customer</Button> : null} />
      <section className="toolbar"><label className="search-control search-control--wide"><Icon name="search" /><span className="sr-only">Search customers</span><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or email" /></label><span className="toolbar__count">{visibleCustomers.length} customer{visibleCustomers.length === 1 ? "" : "s"}</span></section>
      <section className="data-list" aria-label="Customers">
        <div className="data-list__header customer-row"><span>Customer</span><span>Email</span><span>Added</span><span /></div>
        {visibleCustomers.length ? visibleCustomers.map((customer) => <CustomerRow customer={customer} key={customer.id} />) : <EmptyState title="No customers found" description="Add your first customer or adjust the search." />}
      </section>
      <Modal open={createOpen} onClose={close} title="Add customer" description="Create a tenant-scoped customer record." footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button form="create-customer-form" type="submit" loading={submitting}>Add customer</Button></>}>
        <form id="create-customer-form" className="form-stack" onSubmit={create}>
          {formError ? <div className="inline-alert inline-alert--error" role="alert">{formError}</div> : null}
          <Field label="Full name" htmlFor="customer-name"><Input id="customer-name" value={form.name} maxLength="191" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></Field>
          <Field label="Email" htmlFor="customer-email"><Input id="customer-email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required /></Field>
        </form>
      </Modal>
    </div>
  );
}
