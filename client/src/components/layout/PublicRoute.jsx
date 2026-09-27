import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";
import PageSkeleton from "../feedback/PageSkeleton.jsx";

export default function PublicRoute() {
  const { status } = useAuth();
  if (status === "initializing") return <PageSkeleton fullPage />;
  return status === "authenticated" ? <Navigate to="/app/dashboard" replace /> : <Outlet />;
}
