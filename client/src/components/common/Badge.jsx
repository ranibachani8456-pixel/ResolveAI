import { enumLabel } from "../../constants/tickets.js";

export default function Badge({ value, tone, children }) {
  const normalizedTone = tone || value?.toLowerCase().replaceAll("_", "-") || "neutral";
  return <span className={`badge badge--${normalizedTone}`}>{children || enumLabel(value)}</span>;
}
