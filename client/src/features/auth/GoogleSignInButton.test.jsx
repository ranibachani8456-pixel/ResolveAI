import { render, screen, waitFor } from "@testing-library/react";

afterEach(() => {
  delete window.google;
  vi.unstubAllEnvs();
});

test("configured Google Identity Services control renders and returns only its credential", async () => {
  vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "public-client.apps.googleusercontent.com");
  const initialize = vi.fn();
  const renderButton = vi.fn((element) => {
    const marker = document.createElement("button");
    marker.textContent = "Google rendered control";
    element.appendChild(marker);
  });
  window.google = { accounts: { id: { initialize, renderButton } } };
  const onCredential = vi.fn();
  const onError = vi.fn();
  const { default: GoogleSignInButton } = await import("./GoogleSignInButton.jsx");

  render(<GoogleSignInButton onCredential={onCredential} onError={onError} />);
  await screen.findByRole("button", { name: "Google rendered control" });
  expect(renderButton).toHaveBeenCalledOnce();
  expect(initialize).toHaveBeenCalledWith(expect.objectContaining({
    client_id: "public-client.apps.googleusercontent.com",
    ux_mode: "popup",
  }));

  initialize.mock.calls[0][0].callback({ credential: "issued-google-credential" });
  await waitFor(() => expect(onCredential).toHaveBeenCalledWith("issued-google-credential"));
  expect(onError).not.toHaveBeenCalled();
});
