import { useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";
import { canManageTeam, roleLabel } from "../../constants/roles.js";
import Avatar from "../common/Avatar.jsx";
import Icon from "../common/Icon.jsx";

const baseNavigation = [
  { to: "/app/dashboard", label: "Dashboard", icon: "dashboard" },
  { to: "/app/tickets", label: "Tickets", icon: "tickets" },
  { to: "/app/customers", label: "Customers", icon: "customers" },
  { to: "/app/knowledge", label: "Knowledge", icon: "knowledge" },
  { to: "/app/ai", label: "AI Assistant", icon: "ai" },
];

export default function AppShell() {
  const { user, organization, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigation = useMemo(() => (
    canManageTeam(user.role)
      ? [...baseNavigation, { to: "/app/team", label: "Team", icon: "team" }]
      : baseNavigation
  ), [user.role]);

  const currentPage = navigation.find(({ to }) => location.pathname.startsWith(to))?.label || "ResolveAI";
  return (
    <div className="app-shell">
      <button
        className={`sidebar-scrim ${mobileOpen ? "is-visible" : ""}`}
        onClick={() => setMobileOpen(false)}
        aria-label="Close navigation"
      />
      <aside className={`sidebar ${mobileOpen ? "is-open" : ""}`} aria-label="Primary navigation">
        <div className="sidebar__brand">
          <span className="brand-mark">R</span>
          <div><strong>ResolveAI</strong><span>Support operations</span></div>
          <button className="icon-button sidebar__close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <Icon name="close" />
          </button>
        </div>
        <nav className="sidebar__nav">
          <span className="sidebar__section-label">Workspace</span>
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => `nav-item ${isActive ? "is-active" : ""}`}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__account">
          <Avatar name={user.name} />
          <div className="sidebar__account-copy">
            <strong>{user.name}</strong>
            <span>{roleLabel(user.role)}</span>
          </div>
          <button className="icon-button" onClick={logout} aria-label="Log out" title="Log out">
            <Icon name="logout" />
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button className="icon-button topbar__menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Icon name="menu" />
          </button>
          <div className="topbar__page"><span>{currentPage}</span></div>
          <div className="topbar__organization">
            <span className="status-dot" />
            <div><small>Organization</small><strong>{organization?.name || user.organization?.name || "Workspace"}</strong></div>
          </div>
        </header>
        <main className="content" id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
