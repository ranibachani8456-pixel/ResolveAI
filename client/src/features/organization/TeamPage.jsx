import { memo, useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { organizationApi } from "../../api/organizationApi.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";
import { canManageTeam, roleLabel, ROLES } from "../../constants/roles.js";
import { formatDateTime } from "../../utils/format.js";
import PageHeader from "../../components/common/PageHeader.jsx";
import Button from "../../components/common/Button.jsx";
import Avatar from "../../components/common/Avatar.jsx";
import Badge from "../../components/common/Badge.jsx";
import Icon from "../../components/common/Icon.jsx";
import Modal from "../../components/common/Modal.jsx";
import { Field, Input, Select } from "../../components/common/FormControls.jsx";
import PageSkeleton from "../../components/feedback/PageSkeleton.jsx";
import { ErrorState } from "../../components/feedback/States.jsx";

const MemberRow = memo(function MemberRow({ member, canEditRole, onRoleChange, updating }) {
  return (
    <div className="data-row team-row">
      <div className="data-row__primary"><Avatar name={member.name} /><div><strong>{member.name}</strong><span>{member.email}</span></div></div>
      <div>{canEditRole ? <Select aria-label={`Role for ${member.name}`} value={member.role} disabled={updating} onChange={(event) => onRoleChange(member.id, event.target.value)}>{Object.values(ROLES).map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</Select> : <Badge tone="neutral">{roleLabel(member.role)}</Badge>}</div>
      <time>{formatDateTime(member.createdAt)}</time>
      <span className="member-state"><span className="status-dot" />Active</span>
    </div>
  );
});

export default function TeamPage() {
  const { user, organization } = useAuth();
  const { notify } = useToast();
  const [state, setState] = useState({ loading: true, error: "", users: [], organization: null });
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "SUPPORT_AGENT" });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [updating, setUpdating] = useState(null);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const load = useCallback(() => {
    const controller = new AbortController();
    Promise.all([organizationApi.get(controller.signal), organizationApi.users(controller.signal)])
      .then(([organizationResponse, usersResponse]) => setState({ loading: false, error: "", organization: organizationResponse.data.organization, users: usersResponse.data.users }))
      .catch((error) => { if (error.name !== "AbortError") setState((current) => ({ ...current, loading: false, error: error.message })); });
    return controller;
  }, []);
  useEffect(() => { if (!canManageTeam(user.role)) return undefined; const controller = load(); return () => controller.abort(); }, [load, user.role]);

  const closeCreate = useCallback(() => {
    setCreateOpen(false);
    setPasswordVisible(false);
  }, []);

  if (!canManageTeam(user.role)) return <Navigate to="/app/dashboard" replace />;

  const createMember = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true); setFormError("");
    try {
      const response = await organizationApi.createUser(form);
      setState((current) => ({ ...current, users: [...current.users, response.data.user] }));
      setForm({ name: "", email: "", password: "", role: "SUPPORT_AGENT" });
      setCreateOpen(false);
      notify("Team member created.", "success");
    } catch (error) { setFormError(error.message); } finally { setSubmitting(false); }
  };

  const updateRole = async (memberId, role) => {
    if (updating) return;
    setUpdating(memberId);
    try {
      const response = await organizationApi.updateRole(memberId, role);
      setState((current) => ({ ...current, users: current.users.map((member) => member.id === memberId ? response.data.user : member) }));
      notify("Member role updated.", "success");
    } catch (error) { notify(error.message, "error"); } finally { setUpdating(null); }
  };

  if (state.loading) return <PageSkeleton />;
  if (state.error) return <ErrorState title="Unable to load team" message={state.error} onRetry={load} />;
  const activeOrganization = state.organization || organization;
  return (
    <div className="page">
      <PageHeader eyebrow="Organization settings" title="Team" description={`Manage access to ${activeOrganization?.name || "your workspace"}. Backend role checks remain authoritative.`} actions={<Button icon="plus" onClick={() => setCreateOpen(true)}>Add member</Button>} />
      <section className="organization-strip"><div><span>Organization</span><strong>{activeOrganization?.name}</strong></div><div><span>Workspace slug</span><strong>{activeOrganization?.slug}</strong></div><div><span>Members</span><strong>{state.users.length}</strong></div></section>
      <section className="data-list" aria-label="Organization members"><div className="data-list__header team-row"><span>Member</span><span>Role</span><span>Joined</span><span>Status</span></div>{state.users.map((member) => <MemberRow key={member.id} member={member} canEditRole={user.role === ROLES.OWNER} updating={updating === member.id} onRoleChange={updateRole} />)}</section>
      <Modal open={createOpen} onClose={closeCreate} title="Add team member" description="Owners and admins may create admins, support agents, or viewers." footer={<><Button variant="secondary" onClick={closeCreate}>Cancel</Button><Button type="submit" form="create-member-form" loading={submitting}>Add member</Button></>}><form id="create-member-form" className="form-stack" onSubmit={createMember}>{formError ? <div className="inline-alert inline-alert--error" role="alert">{formError}</div> : null}<Field label="Name" htmlFor="member-name"><Input id="member-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></Field><Field label="Email" htmlFor="member-email"><Input id="member-email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required /></Field><Field label="Temporary password" htmlFor="member-password" hint="At least 8 characters; share it securely."><div className="password-input"><Input id="member-password" type={passwordVisible ? "text" : "password"} minLength="8" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} required /><button type="button" className="password-input__toggle" aria-label={passwordVisible ? "Hide password" : "Show password"} aria-pressed={passwordVisible} onMouseDown={(event) => event.preventDefault()} onClick={() => setPasswordVisible((visible) => !visible)}><Icon name={passwordVisible ? "eyeOff" : "eye"} size={18} /></button></div></Field><Field label="Role" htmlFor="member-role"><Select id="member-role" value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}><option value="ADMIN">Admin</option><option value="SUPPORT_AGENT">Support agent</option><option value="VIEWER">Viewer</option></Select></Field></form></Modal>
    </div>
  );
}
