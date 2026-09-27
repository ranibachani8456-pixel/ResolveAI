import Skeleton from "./Skeleton.jsx";

export default function PageSkeleton({ fullPage = false, rows = 5 }) {
  return (
    <div className={fullPage ? "page-skeleton page-skeleton--full" : "page-skeleton"} aria-label="Loading">
      <Skeleton className="skeleton-heading" lines={2} />
      <div className="skeleton-stats">
        <Skeleton /><Skeleton /><Skeleton /><Skeleton />
      </div>
      <div className="skeleton-table">
        {Array.from({ length: rows }, (_, index) => <Skeleton key={index} lines={2} />)}
      </div>
    </div>
  );
}
