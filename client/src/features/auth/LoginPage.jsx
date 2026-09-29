import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";
import Button from "../../components/common/Button.jsx";
import Icon from "../../components/common/Icon.jsx";
import { Field, Input } from "../../components/common/FormControls.jsx";
import AuthLayout from "./AuthLayout.jsx";
import GoogleSignInButton, { GOOGLE_SIGN_IN_ENABLED } from "./GoogleSignInButton.jsx";

export default function LoginPage() {
  const [form, setForm] = useState({ organizationSlug: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const activeRequest = useRef(null);

  useEffect(() => () => activeRequest.current?.abort(), []);
  const { login, googleLogin } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const onSubmit = async (event) => {
    event.preventDefault();
    if (submitting || activeRequest.current) return;
    setError("");
    setSubmitting(true);
    const controller = new AbortController();
    activeRequest.current = controller;
    try {
      await login(form, controller.signal);
      notify("Welcome back to ResolveAI.", "success");
      navigate(location.state?.from || "/app/dashboard", { replace: true });
    } catch (requestError) {
      if (requestError.name !== "AbortError") setError(requestError.message);
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setSubmitting(false);
      }
    }
  };

  const onGoogleCredential = async (credential) => {
    if (activeRequest.current) return;
    setError("");
    setGoogleSubmitting(true);
    const controller = new AbortController();
    activeRequest.current = controller;
    try {
      await googleLogin(credential, controller.signal);
      notify("Welcome back to ResolveAI.", "success");
      navigate(location.state?.from || "/app/dashboard", { replace: true });
    } catch (requestError) {
      if (requestError.name !== "AbortError") setError(requestError.message);
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setGoogleSubmitting(false);
      }
    }
  };

  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  return (
    <AuthLayout
      title="Sign in"
      description="Use your organization workspace and account details."
      footer={<p>New to ResolveAI? <Link to="/register">Create an organization</Link></p>}
    >
      <form className="form-stack" onSubmit={onSubmit}>
        {error ? <div className="inline-alert inline-alert--error" role="alert">{error}</div> : null}
        <Field label="Organization slug" htmlFor="organizationSlug">
          <Input id="organizationSlug" name="organizationSlug" value={form.organizationSlug} onChange={update} autoComplete="organization" placeholder="acme-support" required />
        </Field>
        <Field label="Work email" htmlFor="email">
          <Input id="email" name="email" type="email" value={form.email} onChange={update} autoComplete="email" placeholder="you@company.com" required />
        </Field>
        <Field label="Password" htmlFor="password">
          <div className="password-input">
            <Input id="password" name="password" type={passwordVisible ? "text" : "password"} value={form.password} onChange={update} autoComplete="current-password" required />
            <button type="button" className="password-input__toggle" aria-label={passwordVisible ? "Hide password" : "Show password"} aria-pressed={passwordVisible} onMouseDown={(event) => event.preventDefault()} onClick={() => setPasswordVisible((visible) => !visible)}>
              <Icon name={passwordVisible ? "eyeOff" : "eye"} size={18} />
            </button>
          </div>
        </Field>
        <Button type="submit" loading={submitting} disabled={googleSubmitting} className="button--full">Sign in</Button>
      </form>
      {GOOGLE_SIGN_IN_ENABLED ? (
        <div className="alternative-auth">
          <div className="auth-divider"><span>or</span></div>
          <GoogleSignInButton
            disabled={submitting || googleSubmitting}
            onCredential={onGoogleCredential}
            onError={setError}
          />
        </div>
      ) : null}
    </AuthLayout>
  );
}
