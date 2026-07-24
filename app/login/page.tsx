"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const router = useRouter();
  const [hasPasskey, setHasPasskey] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/status")
      .then((res) => res.json())
      .then((data) => setHasPasskey(data.hasPasskey));
  }, []);

  async function handleRegister() {
    setBusy(true);
    setError(null);
    try {
      const optionsRes = await fetch("/api/auth/register-begin", {
        method: "POST",
      });
      if (!optionsRes.ok) throw new Error((await optionsRes.json()).error);
      const options = await optionsRes.json();

      const attestation = await startRegistration({ optionsJSON: options });

      const verifyRes = await fetch("/api/auth/register-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attestation),
      });
      if (!verifyRes.ok) throw new Error((await verifyRes.json()).error);

      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin() {
    setBusy(true);
    setError(null);
    try {
      const optionsRes = await fetch("/api/auth/authenticate-begin", {
        method: "POST",
      });
      if (!optionsRes.ok) throw new Error((await optionsRes.json()).error);
      const options = await optionsRes.json();

      const assertion = await startAuthentication({ optionsJSON: options });

      const verifyRes = await fetch("/api/auth/authenticate-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(assertion),
      });
      if (!verifyRes.ok) throw new Error((await verifyRes.json()).error);

      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm rounded-[var(--radius-card)] bg-[var(--color-card-bg)] p-8 text-center shadow-[var(--shadow-card)]">
        <h1 className="mb-6 font-[var(--font-display)] text-3xl italic text-[var(--color-ink)]">
          Word of the Day
        </h1>
        {hasPasskey === null && (
          <p className="text-[var(--color-ink-muted)]">Loading...</p>
        )}
        {hasPasskey === false && (
          <Button onClick={handleRegister} disabled={busy}>
            Set up your passkey
          </Button>
        )}
        {hasPasskey === true && (
          <Button onClick={handleLogin} disabled={busy}>
            Sign in with passkey
          </Button>
        )}
        {error && (
          <p className="mt-4 text-sm text-[var(--color-accent)]">{error}</p>
        )}
      </div>
    </main>
  );
}
