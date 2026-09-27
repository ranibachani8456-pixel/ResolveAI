import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import KnowledgePage from "./KnowledgePage.jsx";
import { documentApi } from "../../api/documentApi.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";

vi.mock("../../api/documentApi.js", () => ({
  documentApi: {
    list: vi.fn(),
    preview: vi.fn(),
    upload: vi.fn(),
  },
}));
vi.mock("../../hooks/useAuth.js", () => ({ useAuth: vi.fn() }));
vi.mock("../../hooks/useToast.js", () => ({ useToast: vi.fn() }));

const textDocument = {
  id: 7,
  fileName: "support-policy.txt",
  mimeType: "text/plain",
  status: "READY",
  createdAt: "2026-09-27T10:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: { id: 1, role: "VIEWER" } });
  useToast.mockReturnValue({ notify: vi.fn() });
  documentApi.list.mockResolvedValue({ data: { documents: [textDocument] } });
});

test("loads and displays a private plain-text document preview", async () => {
  documentApi.preview.mockResolvedValue({
    text: vi.fn().mockResolvedValue("Refunds are available within 30 days."),
  });
  const user = userEvent.setup();
  render(<KnowledgePage />);

  await user.click(await screen.findByRole("button", { name: "Preview support-policy.txt" }));

  expect(documentApi.preview).toHaveBeenCalledWith(7, expect.any(AbortSignal));
  expect(await screen.findByText("Refunds are available within 30 days.")).toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "support-policy.txt" })).toBeInTheDocument();
});

test("creates and revokes a temporary URL for a PDF preview", async () => {
  const pdfDocument = { ...textDocument, id: 8, fileName: "manual.pdf", mimeType: "application/pdf" };
  documentApi.list.mockResolvedValue({ data: { documents: [pdfDocument] } });
  documentApi.preview.mockResolvedValue(new Blob(["%PDF-preview"], { type: "application/pdf" }));
  const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:private-preview");
  const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const user = userEvent.setup();
  render(<KnowledgePage />);

  await user.click(await screen.findByRole("button", { name: "Preview manual.pdf" }));

  const frame = await screen.findByTitle("Preview of manual.pdf");
  expect(frame).toHaveAttribute("src", "blob:private-preview");
  // Browser PDF viewers cannot render inside an empty sandbox and show a black frame.
  expect(frame).not.toHaveAttribute("sandbox");
  expect(createObjectURL).toHaveBeenCalledOnce();

  await user.click(screen.getByRole("button", { name: "Close preview" }));
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:private-preview");
});
