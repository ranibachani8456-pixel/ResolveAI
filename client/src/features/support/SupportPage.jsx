import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { publicSupportApi } from "../../api/publicSupportApi.js";
import Button from "../../components/common/Button.jsx";
import { Field, Input, Textarea } from "../../components/common/FormControls.jsx";

const initialForm = { name: "", email: "", subject: "", message: "" };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSupportForm(form) {
  const errors = {};
  const name = form.name.trim();
  const email = form.email.trim();
  const subject = form.subject.trim();
  const message = form.message.trim();

  if (!name) errors.name = "Enter your name.";
  else if (name.length > 191) errors.name = "Name must not exceed 191 characters.";
  if (!email || !EMAIL_PATTERN.test(email) || email.length > 191) {
    errors.email = "Enter a valid email address.";
  }
  if (!subject) errors.subject = "Enter a subject.";
  else if (subject.length > 255) errors.subject = "Subject must not exceed 255 characters.";
  if (!message) errors.message = "Tell us how we can help.";
  else if (message.length > 10_000) errors.message = "Message must not exceed 10,000 characters.";
  return errors;
}

export default function SupportPage() {
  const { organizationSlug } = useParams();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState(null);
  const activeRequest = useRef(null);
  const submissionActive = useRef(false);

  useEffect(() => () => activeRequest.current?.abort(), []);

  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "" }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (submissionActive.current) return;

    const validationErrors = validateSupportForm(form);
    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors);
      return;
    }

    submissionActive.current = true;
    setSubmitting(true);
    setRequestError("");
    const controller = new AbortController();
    activeRequest.current = controller;
    try {
      const response = await publicSupportApi.submit(organizationSlug, {
        name: form.name.trim(),
        email: form.email.trim(),
        subject: form.subject.trim(),
        message: form.message.trim(),
      }, controller.signal);
      setSubmittedTicket(response.data.ticket);
    } catch (error) {
      if (error.name !== "AbortError") setRequestError(error.message);
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
      submissionActive.current = false;
      setSubmitting(false);
    }
  };

  const startAnother = () => {
    setForm(initialForm);
    setErrors({});
    setRequestError("");
    setSubmittedTicket(null);
  };

  return (
    <main className="support-page">
      <header className="support-header">
        <div className="support-brand"><span className="brand-mark">R</span><span>ResolveAI Support</span></div>
        <span className="support-workspace">{organizationSlug}</span>
      </header>
      <div className="support-layout">
        <section className="support-copy">
          <p className="page-header__eyebrow">Customer support</p>
          <h1>How can we help?</h1>
          <p>Share the details of your request so the support team has the context needed to review it.</p>
          <dl>
            <div><dt>1</dt><dd><strong>Describe the issue</strong><span>Include the context the team needs to investigate.</span></dd></div>
            <div><dt>2</dt><dd><strong>Receive a reference</strong><span>Keep it available when following up with support.</span></dd></div>
            <div><dt>3</dt><dd><strong>The support team reviews it</strong><span>Your request enters their existing support queue.</span></dd></div>
          </dl>
        </section>

        <section className="support-form-panel" aria-labelledby="support-form-title">
          {submittedTicket ? (
            <div className="support-success" role="status">
              <span className="support-success__mark" aria-hidden="true">✓</span>
              <p className="page-header__eyebrow">Request received</p>
              <h2 id="support-form-title">We’ve received your support request.</h2>
              <p>The support team can now review your message.</p>
              <div className="support-reference"><span>Reference</span><strong>#{submittedTicket.reference}</strong></div>
              <div className="support-subject"><span>Subject</span><strong>{submittedTicket.subject}</strong></div>
              <Button variant="secondary" onClick={startAnother}>Submit another request</Button>
            </div>
          ) : (
            <>
              <div className="support-form-heading">
                <p className="page-header__eyebrow">Support request</p>
                <h2 id="support-form-title">Tell us what happened</h2>
                <p>All fields are required.</p>
              </div>
              <form className="form-stack" onSubmit={submit} noValidate>
                {requestError ? <div className="inline-alert inline-alert--error" role="alert">{requestError}</div> : null}
                <Field label="Name" htmlFor="support-name" error={errors.name}>
                  <Input id="support-name" name="name" value={form.name} onChange={update} maxLength="191" autoComplete="name" required />
                </Field>
                <Field label="Email" htmlFor="support-email" error={errors.email}>
                  <Input id="support-email" name="email" type="email" value={form.email} onChange={update} maxLength="191" autoComplete="email" required />
                </Field>
                <Field label="Subject" htmlFor="support-subject" error={errors.subject}>
                  <Input id="support-subject" name="subject" value={form.subject} onChange={update} maxLength="255" required />
                </Field>
                <Field label="How can we help?" htmlFor="support-message" error={errors.message} hint={`${form.message.length.toLocaleString()} / 10,000 characters`}>
                  <Textarea id="support-message" name="message" value={form.message} onChange={update} maxLength="10000" rows="7" required />
                </Field>
                <Button type="submit" loading={submitting} className="button--full">Submit request</Button>
              </form>
            </>
          )}
        </section>
      </div>
      <footer className="support-footer">Support requests are securely routed to this organization’s workspace.</footer>
    </main>
  );
}
