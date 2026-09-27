import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider } from "./AuthContext.jsx";
import { useAuth } from "../hooks/useAuth.js";
import { authApi } from "../api/authApi.js";
import { getToken, setToken } from "../api/tokenStorage.js";

vi.mock("../api/authApi.js", () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    me: vi.fn(),
  },
}));

function SessionProbe() {
  const { status, user } = useAuth();
  return <div>{status === "authenticated" ? user.name : status}</div>;
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
