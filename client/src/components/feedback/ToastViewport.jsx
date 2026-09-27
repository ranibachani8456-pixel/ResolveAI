export default function ToastViewport({ toasts, onDismiss }) {
  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div className={`toast toast--${toast.variant}`} key={toast.id} role="status">
          <span className="toast__indicator" aria-hidden="true" />
          <p>{toast.message}</p>
          <button onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">×</button>
        </div>
      ))}
    </div>
  );
}
