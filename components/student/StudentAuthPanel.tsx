"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { fieldClassName } from "@/components/ui/field";
import type { AuthPanelMode } from "@/lib/student-gate";
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
import { credentialProblemLabel } from "@/lib/student-auth-labels";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";
import { cardFocusRing, formErrorText } from "@/components/card-styles";

// A known offender named directly in the Task J plan: this used to be bare
// underlined text with no padding at all, a hit box closer to 20px tall than
// 44. inline-flex + min-h-[44px] grows the box the tap has to land in without
// growing the word inside it — the same trick CardDateNav's Aujourd'hui link
// uses, and for the same reason: padding alone would push the underline away
// from the text it belongs under.
const linkButton = cn(
  "inline-flex min-h-[44px] items-center rounded-md px-1 font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-bleu)] underline transition-opacity duration-150 hover:opacity-80 motion-reduce:transition-none",
  cardFocusRing,
);

export function StudentAuthPanel({
  slug,
  mode,
  locale,
}: {
  slug: string;
  mode: AuthPanelMode;
  // This is a client component, so it cannot call headers() itself — the
  // server component above it (app/g/[slug]/page.tsx) reads the locale once
  // and hands it down; getStrings(locale) below rebuilds the dictionary here
  // rather than taking the resolved object as a prop — see lib/strings.ts on
  // why that object cannot cross the boundary.
  locale: Locale;
}) {
  const strings = getStrings(locale);
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

  const auth = strings.student.auth;

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
      setError(credentialProblemLabel("bad-email", strings));
      return;
    }
    const problem = checkPassword(password);
    if (problem !== null) {
      setError(credentialProblemLabel(problem, strings));
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
      // The action's failures already arrive as sentences in the visitor's own
      // language; this is the network or a crash, and the student still gets
      // one sentence from the dictionary rather than a leaked internal string.
      setError(auth.genericFailure);
    } finally {
      setBusy(false);
    }
  }

  if (mode === "signed-in") {
    // Rendered by the caller after the tab content, not up here beside
    // signup/login: a sign-out control is the last thing on the page, not
    // the first thing above everything the student came for. The hairline
    // rule and generous top margin are what separate it from that content
    // rather than a heading of its own. See app/g/[slug]/page.tsx.
    return (
      // mt-[var(--space-6)]/pt-[var(--space-4)] rather than mt-12/pt-6: same
      // 48px and 24px, but named — the same rhythm units app/g/[slug]/page.tsx
      // and CardDateNav use, so "generous top margin" reads as a deliberate
      // step in one scale rather than a number chosen to look about right.
      <div className="mx-auto mt-[var(--space-6)] w-full max-w-[560px] border-t border-[var(--card-line)] pt-[var(--space-4)] text-center">
        <button type="button" onClick={handleSignOut} className={linkButton}>
          {auth.signOut}
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
          {auth.haveAccount}
        </button>
      </div>
    );
  }

  const submitLabel =
    mode === "signup"
      ? busy
        ? auth.creating
        : auth.createAccount
      : busy
        ? auth.signingIn
        : auth.signIn;

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto mb-8 w-full max-w-[560px] rounded-2xl border border-[var(--card-line)] bg-[var(--card-paper-back)] p-5"
    >
      <p className="mb-3 font-[family-name:var(--card-font-serif)] text-[15px] text-[var(--card-ink)]">
        {mode === "signup" ? auth.signUpIntro : auth.signInIntro}
      </p>

      {/* Both fields in ONE form, submitted together. This is the whole of
          "make password managers pick it up": a manager keys off an identifier
          field and a password field in the same submission, and splitting them
          across two steps is the usual way that gets broken. */}
      <label
        htmlFor="student-email"
        className="block font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-ink)]"
      >
        {auth.emailLabel}
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
        {auth.passwordLabel}
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
          {reveal ? auth.hidePassword : auth.showPassword}
        </button>
        {mode === "login" && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={linkButton}
          >
            {strings.common.cancel}
          </button>
        )}
      </div>

      <button
        type="submit"
        disabled={busy}
        className={cn(
          "w-full min-h-[44px] rounded-full bg-[var(--card-bleu)] px-5 py-2 font-[family-name:var(--card-font-serif)] text-sm text-white transition-opacity duration-150 hover:opacity-90 motion-reduce:transition-none disabled:opacity-50",
          cardFocusRing,
        )}
      >
        {submitLabel}
      </button>

      {error && (
        <p role="alert" className={cn("mt-3", formErrorText)}>
          {error}
        </p>
      )}
    </form>
  );
}
