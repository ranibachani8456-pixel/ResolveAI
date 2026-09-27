import { publicSupportApi } from "./publicSupportApi.js";
import { setToken } from "./tokenStorage.js";

test("public support API uses the slug route without sending a stored JWT", async () => {
  setToken("private-staff-token");
  const fetchMock = vi.spyOn(window, "fetch").mockResolvedValue(new Response(
    JSON.stringify({
      success: true,
      data: { ticket: { reference: "17", subject: "Help", status: "OPEN" } },
    }),
    { status: 201, headers: { "Content-Type": "application/json" } },
  ));

  await publicSupportApi.submit("acme-support", {
    name: "Customer",
    email: "customer@example.com",
    subject: "Help",
    message: "Please help with this request.",
  });

  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/public/support/acme-support/tickets");
  expect(options.method).toBe("POST");
  expect(options.headers.Authorization).toBeUndefined();
});
