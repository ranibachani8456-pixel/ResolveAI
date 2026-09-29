import { useEffect, useRef, useState } from "react";

const SCRIPT_ID = "google-identity-services";
const SCRIPT_URL = "https://accounts.google.com/gsi/client";
export const GOOGLE_SIGN_IN_ENABLED = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim());

let scriptPromise;

function loadGoogleIdentityServices() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    const script = existing || document.createElement("script");
    const loaded = () => window.google?.accounts?.id
      ? resolve()
      : reject(new Error("Google Identity Services did not initialize"));
    const failed = () => reject(new Error("Google Identity Services could not be loaded"));

    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", failed, { once: true });
    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }).catch((error) => {
    scriptPromise = undefined;
    throw error;
  });
  return scriptPromise;
}

export default function GoogleSignInButton({ disabled = false, onCredential, onError }) {
  const containerRef = useRef(null);
  const callbacks = useRef({ onCredential, onError });
  const [scriptLoading, setScriptLoading] = useState(true);
  callbacks.current = { onCredential, onError };

  useEffect(() => {
    if (!GOOGLE_SIGN_IN_ENABLED) return undefined;
    let cancelled = false;
    loadGoogleIdentityServices().then(() => {
      if (cancelled || !containerRef.current) return;
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID.trim(),
        callback: (response) => {
          if (cancelled) return;
          if (typeof response?.credential === "string" && response.credential) {
            callbacks.current.onCredential?.(response.credential);
          } else {
            callbacks.current.onError?.("Google sign-in did not return a valid credential.");
          }
        },
        ux_mode: "popup",
      });
      containerRef.current.replaceChildren();
      window.google.accounts.id.renderButton(containerRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: Math.min(360, Math.floor(containerRef.current.clientWidth || 360)),
      });
      setScriptLoading(false);
    }).catch(() => {
      if (!cancelled) {
        setScriptLoading(false);
        callbacks.current.onError?.("Google sign-in is temporarily unavailable.");
      }
    });
    return () => { cancelled = true; };
  }, []);

  if (!GOOGLE_SIGN_IN_ENABLED) return null;
  return (
    <div
      className={`google-signin${disabled ? " is-disabled" : ""}`}
      aria-busy={scriptLoading || disabled}
      aria-disabled={disabled}
    >
      <div ref={containerRef} className="google-signin__control" />
      {scriptLoading ? <span className="google-signin__loading">Loading Google sign-in…</span> : null}
      {!scriptLoading && disabled ? <span className="google-signin__loading">Signing in securely…</span> : null}
      {disabled ? <span className="google-signin__guard" aria-hidden="true" /> : null}
    </div>
  );
}
