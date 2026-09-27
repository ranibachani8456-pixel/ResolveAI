import { initials } from "../../utils/format.js";

export default function Avatar({ name, size = "medium" }) {
  return <span className={`avatar avatar--${size}`} aria-hidden="true">{initials(name)}</span>;
}
