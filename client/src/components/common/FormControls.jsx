import { forwardRef } from "react";

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <p className="field__error" role="alert">{error}</p> : hint ? <p className="field__hint">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ className = "", ...props }, ref) {
  return <input ref={ref} className={`input ${className}`.trim()} {...props} />;
});

export function Select({ className = "", children, ...props }) {
  return <select className={`input select ${className}`.trim()} {...props}>{children}</select>;
}

export function Textarea({ className = "", ...props }) {
  return <textarea className={`input textarea ${className}`.trim()} {...props} />;
}
