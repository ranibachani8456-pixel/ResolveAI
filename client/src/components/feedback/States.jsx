import Button from "../common/Button.jsx";

export function EmptyState({ title, description, action }) {
  return (
    <div className="state-panel">
      <div className="state-panel__mark" aria-hidden="true">—</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, onRetry }) {
  return (
    <div className="state-panel state-panel--error" role="alert">
      <div className="state-panel__mark" aria-hidden="true">!</div>
      <h3>{title}</h3>
      <p>{message}</p>
      {onRetry ? <Button variant="secondary" icon="refresh" onClick={onRetry}>Try again</Button> : null}
    </div>
  );
}
