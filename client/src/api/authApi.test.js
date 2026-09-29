import { authApi } from "./authApi.js";
import { setToken } from "./tokenStorage.js";

test("Google login sends only the issued credential without the existing ResolveAI JWT", async () => {
  setToken("old-resolveai-token");
  const fetchMock = vi.spyOn(window, "fetch").mockResolvedValue(new Response(
    JSON.stringify({ success: true, data: { token: "new-resolveai-token" } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  ));

  await authApi.google("issued-google-credential");

  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/auth/google");
  expect(options.headers.Authorization).toBeUndefined();
  expect(JSON.parse(options.body)).toEqual({ credential: "issued-google-credential" });
});
