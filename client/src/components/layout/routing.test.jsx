import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext.jsx";
import ProtectedRoute from "./ProtectedRoute.jsx";
import AppShell from "./AppShell.jsx";

function authValue(overrides = {}) {
  return {
    status: "authenticated",
    user: { id: 1, name: "Rani", role: "VIEWER", organization: { name: "Acme" } },
    organization: { id: 1, name: "Acme", slug: "acme" },
    logout: vi.fn(), login: vi.fn(), googleLogin: vi.fn(), register: vi.fn(),
    ...overrides,
  };
}

test("protected routes redirect anonymous users to login", () => {
  render(
    <AuthContext.Provider value={authValue({ status: "anonymous", user: null })}>
      <MemoryRouter initialEntries={["/app/dashboard"]}>
        <Routes>
          <Route path="/app" element={<ProtectedRoute />}><Route path="dashboard" element={<div>Private dashboard</div>} /></Route>
          <Route path="/login" element={<div>Login destination</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  expect(screen.getByText("Login destination")).toBeInTheDocument();
  expect(screen.queryByText("Private dashboard")).not.toBeInTheDocument();
});

test("viewer navigation omits team management while preserving core read routes", () => {
  render(
    <AuthContext.Provider value={authValue()}>
      <MemoryRouter initialEntries={["/app/dashboard"]}>
        <Routes><Route path="/app" element={<AppShell />}><Route path="dashboard" element={<div>Dashboard body</div>} /></Route></Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  expect(screen.getByText("Tickets")).toBeInTheDocument();
  expect(screen.getByText("AI Assistant")).toBeInTheDocument();
  expect(screen.queryByText("Team")).not.toBeInTheDocument();
});

test("admin navigation includes team management", () => {
  render(
    <AuthContext.Provider value={authValue({ user: { id: 2, name: "Admin", role: "ADMIN" } })}>
      <MemoryRouter initialEntries={["/app/dashboard"]}>
        <Routes><Route path="/app" element={<AppShell />}><Route path="dashboard" element={<div>Dashboard body</div>} /></Route></Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  expect(screen.getByText("Team")).toBeInTheDocument();
});
