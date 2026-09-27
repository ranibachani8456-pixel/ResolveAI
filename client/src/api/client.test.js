import { apiBlobRequest, apiRequest, ApiError } from "./client.js";
import { setToken } from "./tokenStorage.js";

test("apiRequest attaches the JWT and serializes JSON", async () => {
  setToken("test-token");
  const fetchMock = vi.spyOn(window, "fetch").mockResolvedValue(new Response(
    JSON.stringify({ success: true, data: { ok: true } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  ));

  await apiRequest("/tickets", { method: "POST", body: { subject: "Help" } });

  expect(fetchMock).toHaveBeenCalledOnce();
  const [, options] = fetchMock.mock.calls[0];
  expect(options.headers.Authorization).toBe("Bearer test-token");
  expect(options.headers["Content-Type"]).toBe("application/json");
  expect(options.body).toBe(JSON.stringify({ subject: "Help" }));
});

test("apiRequest normalizes permission errors without exposing response internals", async () => {
  vi.spyOn(window, "fetch").mockResolvedValue(new Response(
    JSON.stringify({ success: false, message: "You do not have permission" }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  ));

  await expect(apiRequest("/documents", { method: "POST" })).rejects.toMatchObject({
    name: "ApiError",
    status: 403,
    kind: "permission",
    message: "You do not have permission",
  });
  await expect(Promise.reject(new ApiError("safe"))).rejects.toThrow("safe");
});

test("apiBlobRequest authenticates private document previews and returns the blob", async () => {
  setToken("preview-token");
  const expectedBlob = new Blob(["Private preview"], { type: "text/plain" });
  const fetchMock = vi.spyOn(window, "fetch").mockResolvedValue(new Response(expectedBlob, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  }));

  const result = await apiBlobRequest("/documents/7/content");

  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/documents/7/content");
  expect(options.headers.Authorization).toBe("Bearer preview-token");
  expect(options.headers.Accept).toBe("application/pdf, text/plain");
  expect(result).toBeInstanceOf(Blob);
  expect(result.type).toBe("text/plain");
  expect(result.size).toBeGreaterThan(0);
});

test("apiBlobRequest normalizes JSON errors from a binary endpoint", async () => {
  vi.spyOn(window, "fetch").mockResolvedValue(new Response(
    JSON.stringify({ success: false, message: "Document content is unavailable" }),
    { status: 404, headers: { "Content-Type": "application/json" } },
  ));

  await expect(apiBlobRequest("/documents/7/content")).rejects.toMatchObject({
    name: "ApiError",
    status: 404,
    kind: "not-found",
    message: "Document content is unavailable",
  });
});
