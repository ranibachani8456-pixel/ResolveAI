import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";
import Button from "../../components/common/Button.jsx";
import { Field, Input } from "../../components/common/FormControls.jsx";
import AuthLayout from "./AuthLayout.jsx";

const initialForm = { organizationName: "", organizationSlug: "", name: "", email: "", password: "" };

export default function RegisterPage() {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const activeRequest = useRef(null);

  useEffect(() => () => activeRequest.current?.abort(), []);
  const { register } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => {
      if (name === "organizationName" && !current.organizationSlug) {
        return {
          ...current,
          organizationName: value,
          organizationSlug: value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        };
      }
      return { ...current, [name]: value };
    });
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    const controller = new AbortController();
    activeRequest.current = controller;
    try {
      await register(form, controller.signal);
      notify("Your ResolveAI organization is ready.", "success");
      navigate("/app/dashboard", { replace: true });
    } catch (requestError) {
      if (requestError.name !== "AbortError") setError(requestError.message);
    } finally {
      if (activeRequest.current === controller) setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create your workspace"
      description="Registration creates an organization and its first owner account."
      footer={<p>Already have an account? <Link to="/login">Sign in</Link></p>}
    >
      <form className="form-stack" onSubmit={onSubmit}>
        {error ? <div className="inline-alert inline-alert--error" role="alert">{error}</div> : null}
        <div className="form-grid">
          <Field label="Organization name" htmlFor="organizationName">
            <Input id="organizationName" name="organizationName" value={form.organizationName} onChange={update} required />
          </Field>
          <Field label="Organization slug" htmlFor="organizationSlug" hint="Lowercase letters, numbers, and hyphens.">
            <Input id="organizationSlug" name="organizationSlug" value={form.organizationSlug} onChange={update} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required />
          </Field>
        </div>
        <Field label="Your name" htmlFor="name">
          <Input id="name" name="name" value={form.name} onChange={update} autoComplete="name" required />
        </Field>
        <Field label="Work email" htmlFor="email">
          <Input id="email" name="email" type="email" value={form.email} onChange={update} autoComplete="email" required />
        </Field>
        <Field label="Password" htmlFor="password" hint="Use at least 8 characters.">
          <Input id="password" name="password" type="password" minLength="8" value={form.password} onChange={update} autoComplete="new-password" required />
        </Field>
        <Button type="submit" loading={submitting} className="button--full">Create workspace</Button>
      </form>
    </AuthLayout>
  );
}
