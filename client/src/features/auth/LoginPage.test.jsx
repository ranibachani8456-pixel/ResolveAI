import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LoginPage from "./LoginPage.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";

vi.mock("../../hooks/useAuth.js", () => ({ useAuth: vi.fn() }));
vi.mock("../../hooks/useToast.js", () => ({ useToast: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ login: vi.fn() });
  useToast.mockReturnValue({ notify: vi.fn() });
});

test("login password visibility toggle preserves focus and value without submitting", async () => {
  const user = userEvent.setup();
  const login = vi.fn();
  useAuth.mockReturnValue({ login });
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
