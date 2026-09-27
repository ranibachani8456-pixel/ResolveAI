import { apiRequest, ApiError } from "./client.js";
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
