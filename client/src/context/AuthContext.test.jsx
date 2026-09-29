import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider } from "./AuthContext.jsx";
import { useAuth } from "../hooks/useAuth.js";
import { authApi } from "../api/authApi.js";
import { getToken, setToken } from "../api/tokenStorage.js";

vi.mock("../api/authApi.js", () => ({
  authApi: {
    login: vi.fn(),
    google: vi.fn(),
    register: vi.fn(),
    me: vi.fn(),
  },
}));

function SessionProbe() {
  const { status, user, googleLogin, logout } = useAuth();
  return <div>
    <span>{status === "authenticated" ? user.name : status}</span>
    <button onClick={() => googleLogin("google-credential")}>Google login</button>
    <button onClick={logout}>Log out</button>
  </div>;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

test("restores a stored session through the existing /auth/me contract", async () => {
  setToken("stored-token");
  authApi.me.mockResolvedValue({
    data: {
      user: {
        id: 8,
        name: "Rani",
        role: "OWNER",
        organization: { id: 3, name: "ResolveAI", slug: "resolveai" },
      },
    },
  });

  render(<AuthProvider><SessionProbe /></AuthProvider>);

  expect(screen.getByText("initializing")).toBeInTheDocument();
  expect(await screen.findByText("Rani")).toBeInTheDocument();
  expect(authApi.me).toHaveBeenCalledOnce();
});

test("clears an invalid stored session", async () => {
  setToken("expired-token");
  authApi.me.mockRejectedValue(new Error("Authentication required"));

  render(<AuthProvider><SessionProbe /></AuthProvider>);

  expect(await screen.findByText("anonymous")).toBeInTheDocument();
  await waitFor(() => expect(getToken()).toBeNull());
});

test("Google authentication establishes and logs out the same ResolveAI session", async () => {
  authApi.google.mockResolvedValue({
    data: {
      token: "resolveai-token",
      user: { id: 8, name: "Riya", role: "SUPPORT_AGENT" },
      organization: { id: 3, name: "ResolveAI", slug: "resolveai" },
    },
  });
  const user = userEvent.setup();
  render(<AuthProvider><SessionProbe /></AuthProvider>);
  expect(await screen.findByText("anonymous")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Google login" }));
  expect(await screen.findByText("Riya")).toBeInTheDocument();
  expect(authApi.google).toHaveBeenCalledWith("google-credential", undefined);
  expect(getToken()).toBe("resolveai-token");

  await user.click(screen.getByRole("button", { name: "Log out" }));
  expect(screen.getByText("anonymous")).toBeInTheDocument();
  expect(getToken()).toBeNull();
});
