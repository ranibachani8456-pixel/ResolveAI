import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import LoginPage from "./LoginPage.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";

vi.mock("../../hooks/useAuth.js", () => ({ useAuth: vi.fn() }));
vi.mock("../../hooks/useToast.js", () => ({ useToast: vi.fn() }));
vi.mock("./GoogleSignInButton.jsx", () => ({
  GOOGLE_SIGN_IN_ENABLED: true,
  default: ({ disabled, onCredential }) => (
    <button type="button" disabled={disabled} onClick={() => onCredential("google-credential")}>Continue with Google</button>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ login: vi.fn(), googleLogin: vi.fn() });
  useToast.mockReturnValue({ notify: vi.fn() });
});

test("login password visibility toggle preserves focus and value without submitting", async () => {
  const user = userEvent.setup();
  const login = vi.fn();
  useAuth.mockReturnValue({ login, googleLogin: vi.fn() });
  render(<MemoryRouter><LoginPage /></MemoryRouter>);

  const passwordInput = screen.getByLabelText("Password");
  await user.click(passwordInput);
  await user.type(passwordInput, "secure-login-password");

  expect(passwordInput).toHaveAttribute("type", "password");
  expect(passwordInput).toHaveValue("secure-login-password");
  expect(passwordInput).toHaveFocus();

  await user.click(screen.getByRole("button", { name: "Show password" }));
  expect(passwordInput).toHaveAttribute("type", "text");
  expect(passwordInput).toHaveValue("secure-login-password");
  expect(passwordInput).toHaveFocus();
  expect(login).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Hide password" }));
  expect(passwordInput).toHaveAttribute("type", "password");
  expect(passwordInput).toHaveValue("secure-login-password");
  expect(login).not.toHaveBeenCalled();
});

test("retains password login and renders the configured Google control", async () => {
  const login = vi.fn().mockResolvedValue({});
  useAuth.mockReturnValue({ login, googleLogin: vi.fn() });
  const user = userEvent.setup();
  render(<MemoryRouter><LoginPage /></MemoryRouter>);

  expect(screen.getByLabelText("Organization slug")).toBeInTheDocument();
  expect(screen.getByLabelText("Work email")).toBeInTheDocument();
  expect(screen.getByLabelText("Password")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();

  await user.type(screen.getByLabelText("Organization slug"), "resolveai");
  await user.type(screen.getByLabelText("Work email"), "riya@example.com");
  await user.type(screen.getByLabelText("Password"), "password-123");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(login).toHaveBeenCalledWith({
    organizationSlug: "resolveai", email: "riya@example.com", password: "password-123",
  }, expect.any(AbortSignal));
});

test("successful Google authentication uses AuthContext and navigates to the protected destination", async () => {
  const googleLogin = vi.fn().mockResolvedValue({});
  useAuth.mockReturnValue({ login: vi.fn(), googleLogin });
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[{ pathname: "/login", state: { from: "/app/tickets" } }]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/app/tickets" element={<div>Protected tickets</div>} />
      </Routes>
    </MemoryRouter>,
  );

  await user.click(screen.getByRole("button", { name: "Continue with Google" }));
  expect(googleLogin).toHaveBeenCalledWith("google-credential", expect.any(AbortSignal));
  expect(await screen.findByText("Protected tickets")).toBeInTheDocument();
});

test("Google failures and unlinked accounts display a safe inline error", async () => {
  const googleLogin = vi.fn().mockRejectedValue(new Error(
    "No ResolveAI account is linked to this Google account",
  ));
  useAuth.mockReturnValue({ login: vi.fn(), googleLogin });
  const user = userEvent.setup();
  render(<MemoryRouter><LoginPage /></MemoryRouter>);

  await user.click(screen.getByRole("button", { name: "Continue with Google" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No ResolveAI account is linked to this Google account",
  );
});

test("prevents duplicate Google requests while one is pending", async () => {
  let finish;
  const googleLogin = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
  useAuth.mockReturnValue({ login: vi.fn(), googleLogin });
  const user = userEvent.setup();
  render(<MemoryRouter><LoginPage /></MemoryRouter>);

  const googleButton = screen.getByRole("button", { name: "Continue with Google" });
  await user.click(googleButton);
  expect(googleButton).toBeDisabled();
  await user.click(googleButton);
  expect(googleLogin).toHaveBeenCalledOnce();
  finish({});
});
