import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ToastProvider } from "../../context/ToastContext.jsx";
import AIAssistantPage from "./AIAssistantPage.jsx";
import { aiApi } from "../../api/aiApi.js";

vi.mock("../../api/aiApi.js", () => ({
  aiApi: {
    listConversations: vi.fn(),
    getConversation: vi.fn(),
    createConversation: vi.fn(),
    sendMessage: vi.fn(),
  },
}));

beforeEach(() => vi.clearAllMocks());

test("AI composer prevents duplicate submission while a question is active", async () => {
  aiApi.listConversations.mockResolvedValue({ data: { conversations: [{ id: 4, title: "Policy", updatedAt: new Date().toISOString() }] } });
  aiApi.getConversation.mockResolvedValue({ data: { conversation: { id: 4, title: "Policy", messages: [], updatedAt: new Date().toISOString() } } });
  let resolveSend;
  aiApi.sendMessage.mockImplementation(() => new Promise((resolve) => { resolveSend = resolve; }));
  const user = userEvent.setup();

  render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/app/ai/4"]}>
        <Routes><Route path="/app/ai/:conversationId" element={<AIAssistantPage />} /></Routes>
      </MemoryRouter>
    </ToastProvider>,
  );

  const textbox = await screen.findByLabelText("Ask a follow-up question");
  await user.type(textbox, "What is the refund deadline?");
  const sendButton = screen.getByRole("button", { name: "Send question" });
  await user.click(sendButton);
  await user.click(sendButton);
  expect(aiApi.sendMessage).toHaveBeenCalledTimes(1);
  expect(sendButton).toBeDisabled();

  resolveSend({ data: {
    answer: "37 days",
    sources: [{ documentId: 54, fileName: "policy.txt", chunkIndex: 0 }],
    userMessage: { id: 1, role: "USER", content: "What is the refund deadline?", createdAt: new Date().toISOString() },
    assistantMessage: { id: 2, role: "ASSISTANT", content: "37 days", createdAt: new Date().toISOString() },
  } });
  await waitFor(() => expect(screen.getByText("37 days")).toBeInTheDocument());
  expect(screen.getByText("policy.txt")).toBeInTheDocument();
});

test("AI composer preserves the question and reports a failed request", async () => {
  const timestamp = new Date().toISOString();
  aiApi.listConversations.mockResolvedValue({ data: { conversations: [{ id: 7, title: "Escalations", updatedAt: timestamp }] } });
  aiApi.getConversation.mockResolvedValue({ data: { conversation: { id: 7, title: "Escalations", messages: [], updatedAt: timestamp } } });
  aiApi.sendMessage.mockRejectedValue(new Error("Knowledge retrieval is temporarily unavailable"));
  const user = userEvent.setup();

  render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/app/ai/7"]}>
        <Routes><Route path="/app/ai/:conversationId" element={<AIAssistantPage />} /></Routes>
      </MemoryRouter>
    </ToastProvider>,
  );

  const textbox = await screen.findByLabelText("Ask a follow-up question");
  await user.type(textbox, "Can this request be escalated?");
  await user.click(screen.getByRole("button", { name: "Send question" }));

  expect(await screen.findByText("Knowledge retrieval is temporarily unavailable")).toBeInTheDocument();
  expect(textbox).toHaveValue("Can this request be escalated?");
  expect(screen.getByRole("button", { name: "Send question" })).toBeEnabled();
});
