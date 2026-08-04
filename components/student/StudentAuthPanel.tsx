"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { fieldClassName } from "@/components/ui/field";
import type { StudentGate } from "@/lib/student-gate";
import {
  claimStudent,
  signInStudent,
  signOutStudent,
} from "@/app/student-auth-actions";
import {
  checkPassword,
  normaliseEmail,
  MIN_PASSWORD_LENGTH,
} from "@/lib/student-credentials";
import {
  credentialProblemLabel,
  GENERIC_FAILURE,
} from "@/lib/student-auth-labels";

// Tied to the gate's own type, so a new gate state cannot quietly bypass this
// component. The two teacher-facing states are rendered by the page itself:
// they are static English text, and one of them contains the student's NAME,
// which must never appear on the public page.
export type AuthPanelMode = Extract<
  StudentGate,
  "signup" | "login" | "signed-in"
>;

const linkButton =
  "font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-bleu)] underline";

export function StudentAuthPanel({
  slug,
  mode,
}: {
  slug: string;
  mode: AuthPanelMode;
}) {
  const router = useRouter();
  // Sign-up arrives on an invite and came to do exactly one thing, so its form
  // is open. Sign-in collapses to one line, which is what keeps the public
  // untokened page as bare as it was before accounts existed.
  const [open, setOpen] = useState(mode === "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    await signOutStudent(slug);
    router.refresh();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    // Checked here as well as in the action, so a typo does not cost a round
    // trip. This is a convenience: the action re-checks, because a disabled
    // button is not a guard.
    if (normaliseEmail(email) === null) {
      setError(credentialProblemLabel("bad-email"));
      return;
    }
    const problem = checkPassword(password);
    if (problem !== null) {
      setError(credentialProblemLabel(problem));
      return;
    }

    setBusy(true);
    try {
      const result =
        mode === "signup"
          ? await claimStudent(slug, email, password)
          : await signInStudent(slug, email, password);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setPassword("");
      router.refresh();
    } catch {
      // The action's failures already arrive as French sentences; this is the
      // network or a crash, and the student still gets one French sentence
      // rather than a leaked internal string.
      setError(GENERIC_FAILURE);
    } finally {
      setBusy(false);
    }
  }

  if (mode === "signed-in") {
    return (
      <div className="mx-auto mb-6 flex w-full max-w-[560px] justify-end">
        <button type="button" onClick={handleSignOut} className={linkButton}>
          Se déconnecter
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="mx-auto mb-6 w-full max-w-[560px] text-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={linkButton}
        >
          Vous avez un compte ? Se connecter
        </button>
      </div>
    );
  }

  const submitLabel =
    mode === "signup"
      ? busy
        ? "Création…"
        : "Créer mon compte"
      : busy
        ? "Connexion…"
        : "Se connecter";

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto mb-8 w-full max-w-[560px] rounded-2xl border border-[var(--card-line)] bg-[var(--card-paper-back)] p-5"
    >
      <p className="mb-3 font-[family-name:var(--card-font-serif)] text-[15px] text-[var(--card-ink)]">
        {mode === "signup"
          ? "Créez votre compte pour accéder à vos documents et au clavardage."
          : "Connectez-vous pour accéder à vos documents et au clavardage."}
      </p>

      {/* Both fields in ONE form, submitted together. This is the whole of
          "make password managers pick it up": a manager keys off an identifier
          field and a password field in the same submission, and splitting them
          across two steps is the usual way that gets broken. */}
      <label
        htmlFor="student-email"
        className="block font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-ink)]"
      >
        Courriel
      </label>
      <input
        id="student-email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className={cn(fieldClassName, "mb-3")}
      />

      <label
        htmlFor="student-password"
        className="block font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-ink)]"
      >
        Mot de passe
      </label>
      <input
        id="student-password"
        name="password"
        type={reveal ? "text" : "password"}
        // new-password on sign-up asks the manager to offer a generated one and
        // save it; current-password on sign-in asks it to fill.
        autoComplete={mode === "signup" ? "new-password" : "current-password"}
        required
        minLength={MIN_PASSWORD_LENGTH}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className={cn(fieldClassName, "mb-2")}
      />

      <div className="mb-4 flex justify-between">
        <button
          type="button"
          onClick={() => setReveal(!reveal)}
          className={linkButton}
        >
          {reveal ? "Masquer" : "Afficher"} le mot de passe
        </button>
        {mode === "login" && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={linkButton}
          >
            Annuler
          </button>
        )}
      </div>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-full bg-[var(--card-bleu)] px-5 py-2 font-[family-name:var(--card-font-serif)] text-sm text-white disabled:opacity-50"
      >
        {submitLabel}
      </button>

      {error && (
        <p
          role="alert"
          className="mt-3 text-center text-sm text-[var(--card-rouge)]"
        >
          {error}
        </p>
      )}
    </form>
  );
}
