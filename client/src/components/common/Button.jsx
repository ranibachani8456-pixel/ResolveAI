import Icon from "./Icon.jsx";

export default function Button({
  children,
  variant = "primary",
  size = "medium",
  icon,
  loading = false,
  className = "",
  type = "button",
  ...props
}) {
  return (
    <button
      {...props}
      type={type}
      className={`button button--${variant} button--${size} ${className}`.trim()}
      disabled={loading || props.disabled}
    >
      {loading ? <span className="button__spinner" aria-hidden="true" /> : icon ? <Icon name={icon} size={16} /> : null}
      <span>{children}</span>
    </button>
  );
}
