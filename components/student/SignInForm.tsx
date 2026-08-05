"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { fieldClassName } from "@/components/ui/field";
import { signInByEmail } from "@/app/student-auth-actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/student-credentials";
import { GENERIC_FAILURE } from "@/lib/student-auth-labels";

const linkButton =
  "font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-bleu)] underline";

// The /signin form. A sibling of StudentAuthPanel rather than a mode of it: that
// component is scoped to a slug it is rendered beside and switches between
// sign-up, sign-in and sign-out for THAT student. This one knows no slug at all
// — the address is what finds the student — so sharing the component would mean
// making `slug` optional in a thing whose every branch uses it.
export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    // NOTHING IS VALIDATED HERE, unlike the panel beside it, and the omission
    // is deliberate. There the check saves a round trip on a form the student
    // is filling in for the first time; here a "that email looks wrong" reply
    // would answer faster than a real attempt and hand back a timing signal on
    // the one endpoint reachable without knowing any slug. Every path costs a
    // hash on the server.
    try {
      const result = await signInByEmail(email, password);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(`/g/${result.slug}`);
    } catch {
      setError(GENERIC_FAILURE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-[var(--card-line)] bg-[var(--card-paper-back)] p-5"
    >
      <label
        htmlFor="signin-email"
        className="block font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-ink)]"
      >
        Courriel
      </label>
      <input
        id="signin-email"
        name="email"
        type="email"
        autoComplete="email"
        required
        autoFocus
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className={cn(fieldClassName, "mb-3")}
      />

      <label
        htmlFor="signin-password"
        className="block font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-ink)]"
      >
        Mot de passe
      </label>
      <input
        id="signin-password"
        name="password"
        type={reveal ? "text" : "password"}
        // current-password, never new-password: this form can only ever sign in
        // to an account that already exists, so the manager should fill rather
        // than offer to generate.
        autoComplete="current-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className={cn(fieldClassName, "mb-2")}
      />

      <div className="mb-4">
        <button
          type="button"
          onClick={() => setReveal(!reveal)}
          className={linkButton}
        >
          {reveal ? "Masquer" : "Afficher"} le mot de passe
        </button>
      </div>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-full bg-[var(--card-bleu)] px-5 py-2 font-[family-name:var(--card-font-serif)] text-sm text-white disabled:opacity-50"
      >
        {busy ? "Connexion…" : "Se connecter"}
      </button>

      {error && (
        <p
          role="alert"
          className="mt-3 text-center font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-rouge)]"
        >
          {error}
        </p>
      )}
    </form>
  );
}
