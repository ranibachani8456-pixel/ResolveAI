export const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"];
export const TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export function enumLabel(value) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
