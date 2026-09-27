import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TeamPage from "./TeamPage.jsx";
import { organizationApi } from "../../api/organizationApi.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";

vi.mock("../../api/organizationApi.js", () => ({
  organizationApi: {
    get: vi.fn(),
    users: vi.fn(),
    createUser: vi.fn(),
    updateRole: vi.fn(),
  },
}));

vi.mock("../../hooks/useAuth.js", () => ({ useAuth: vi.fn() }));
vi.mock("../../hooks/useToast.js", () => ({ useToast: vi.fn() }));

function renderTeamPage() {
  return render(<MemoryRouter><TeamPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({
    user: { id: 1, name: "Owner", role: "OWNER" },
    organization: { id: 4, name: "ResolveAI", slug: "resolveai" },
  });
  useToast.mockReturnValue({ notify: vi.fn() });
  organizationApi.get.mockResolvedValue({
    data: { organization: { id: 4, name: "ResolveAI", slug: "resolveai" } },
  });
  organizationApi.users.mockResolvedValue({ data: { users: [] } });
});

test("team member fields keep focus and values while typing and changing role", async () => {
  const user = userEvent.setup();
  renderTeamPage();

  await user.click(await screen.findByRole("button", { name: "Add member" }));
  const nameInput = screen.getByLabelText("Name");
  const emailInput = screen.getByLabelText("Email");
  const passwordInput = screen.getByLabelText("Temporary password");
  const roleSelect = screen.getByLabelText("Role");

  await user.click(nameInput);
  await user.type(nameInput, "Anaya Sharma");
  expect(nameInput).toHaveValue("Anaya Sharma");
  expect(nameInput).toHaveFocus();

  await user.tab();
  expect(emailInput).toHaveFocus();
  await user.type(emailInput, "anaya@example.com");
  expect(emailInput).toHaveValue("anaya@example.com");
  expect(emailInput).toHaveFocus();

  await user.tab();
  expect(passwordInput).toHaveFocus();
  await user.type(passwordInput, "secure-pass-123");
  expect(passwordInput).toHaveValue("secure-pass-123");
  expect(passwordInput).toHaveFocus();

  expect(passwordInput).toHaveAttribute("type", "password");
  await user.click(screen.getByRole("button", { name: "Show password" }));
  expect(passwordInput).toHaveAttribute("type", "text");
  expect(passwordInput).toHaveValue("secure-pass-123");
  expect(passwordInput).toHaveFocus();

  await user.click(screen.getByRole("button", { name: "Hide password" }));
  expect(passwordInput).toHaveAttribute("type", "password");
  expect(passwordInput).toHaveValue("secure-pass-123");
  expect(organizationApi.createUser).not.toHaveBeenCalled();

  await user.selectOptions(roleSelect, "ADMIN");
  expect(roleSelect).toHaveValue("ADMIN");
  expect(nameInput).toHaveValue("Anaya Sharma");
  expect(emailInput).toHaveValue("anaya@example.com");
  expect(passwordInput).toHaveValue("secure-pass-123");
});

test("closing the modal restores focus to the Add member button", async () => {
  const user = userEvent.setup();
  renderTeamPage();

  const addMemberButton = await screen.findByRole("button", { name: "Add member" });
  await user.click(addMemberButton);
  expect(screen.getByRole("dialog", { name: "Add team member" })).toBeInTheDocument();

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Add team member" })).not.toBeInTheDocument();
  expect(addMemberButton).toHaveFocus();
});
