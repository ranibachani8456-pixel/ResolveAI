import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import App from "../../App.jsx";
import { publicSupportApi } from "../../api/publicSupportApi.js";

vi.mock("../../api/publicSupportApi.js", () => ({
  publicSupportApi: { submit: vi.fn() },
}));

function renderSupportPage() {
  return render(<MemoryRouter initialEntries={["/support/resolveai"]}><App /></MemoryRouter>);
}

async function fillSupportForm(user) {
  await user.type(screen.getByLabelText("Name"), "Rahul Sharma");
  await user.type(screen.getByLabelText("Email"), "rahul@example.com");
  await user.type(screen.getByLabelText("Subject"), "Refund not received");
  await user.type(
    screen.getByLabelText("How can we help?"),
    "I returned my order 10 days ago but still haven't received my refund.",
  );
}

beforeEach(() => vi.clearAllMocks());

test("public support route renders without auth or internal dashboard navigation", async () => {
  renderSupportPage();

  expect(await screen.findByRole("heading", { name: "How can we help?" })).toBeInTheDocument();
  expect(screen.getByText("resolveai")).toBeInTheDocument();
  expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  expect(screen.queryByText("Tickets")).not.toBeInTheDocument();
  expect(screen.queryByText("AI Assistant")).not.toBeInTheDocument();
});

test("all support fields accept continuous multi-character input", async () => {
  const user = userEvent.setup();
  renderSupportPage();
  await screen.findByRole("heading", { name: "How can we help?" });

  await fillSupportForm(user);
  expect(screen.getByLabelText("Name")).toHaveValue("Rahul Sharma");
  expect(screen.getByLabelText("Email")).toHaveValue("rahul@example.com");
  expect(screen.getByLabelText("Subject")).toHaveValue("Refund not received");
  expect(screen.getByLabelText("How can we help?")).toHaveValue(
    "I returned my order 10 days ago but still haven't received my refund.",
  );
});

test("invalid support form shows useful inline validation", async () => {
  const user = userEvent.setup();
  renderSupportPage();
  await user.click(await screen.findByRole("button", { name: "Submit request" }));

  expect(screen.getByText("Enter your name.")).toBeInTheDocument();
  expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
  expect(screen.getByText("Enter a subject.")).toBeInTheDocument();
  expect(screen.getByText("Tell us how we can help.")).toBeInTheDocument();
  expect(publicSupportApi.submit).not.toHaveBeenCalled();
});

test("submission is single-flight and success displays the safe ticket reference", async () => {
  let resolveSubmission;
  publicSupportApi.submit.mockImplementation(() => new Promise((resolve) => {
    resolveSubmission = resolve;
  }));
  const user = userEvent.setup();
  renderSupportPage();
  await screen.findByRole("heading", { name: "How can we help?" });
  await fillSupportForm(user);

  const submitButton = screen.getByRole("button", { name: "Submit request" });
  await user.click(submitButton);
  await user.click(submitButton);
  expect(publicSupportApi.submit).toHaveBeenCalledTimes(1);
  expect(submitButton).toBeDisabled();

  resolveSubmission({
    data: {
      ticket: { reference: "501", subject: "Refund not received", status: "OPEN", priority: "MEDIUM" },
    },
  });
  expect(await screen.findByText("We’ve received your support request.")).toBeInTheDocument();
  expect(screen.getByText("#501")).toBeInTheDocument();
  expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
});

test("safe backend errors are shown and entered form values remain available", async () => {
  publicSupportApi.submit.mockRejectedValue(new Error("Unable to submit support request"));
  const user = userEvent.setup();
  renderSupportPage();
  await screen.findByRole("heading", { name: "How can we help?" });
  await fillSupportForm(user);
  await user.click(screen.getByRole("button", { name: "Submit request" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to submit support request");
  expect(screen.getByLabelText("Email")).toHaveValue("rahul@example.com");
  await waitFor(() => expect(screen.getByRole("button", { name: "Submit request" })).toBeEnabled());
});
