import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";
import PageSkeleton from "../feedback/PageSkeleton.jsx";

export default function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "initializing") return <PageSkeleton fullPage />;
  if (status !== "authenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
