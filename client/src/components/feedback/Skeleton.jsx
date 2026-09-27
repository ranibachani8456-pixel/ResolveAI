export default function Skeleton({ className = "", lines = 1 }) {
  return (
    <div className={`skeleton-group ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => <span className="skeleton" key={index} />)}
    </div>
  );
}
