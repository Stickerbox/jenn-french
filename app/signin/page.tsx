import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "@/components/student/SignInForm";
import { currentLocale } from "@/lib/locale";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";

// Every student surface carries this, and this one earns it twice over: the
// page exists to be typed into by someone who has lost their link, and an
// indexed sign-in form is an invitation to everyone else.
export const metadata: Metadata = {
  title: "Se connecter — Français avec Jenn",
  robots: { index: false, follow: false },
};

// The door for a student who has no link: a bookmark that was never made, or a
// parent on a new phone. Sign-in used to be per-page — /g/marie carried the
// form and the form was scoped to the slug in the URL — so someone holding
// neither had nowhere at all to go, and the landing page's only offer was the
// everyone group.
//
// A SECOND DOOR RATHER THAN A CHANGE TO /login. One page for both would show
// every student a "Sign in with passkey" button that is not for them, and would
// put a student form on the teacher's page. Neither audience is served by the
// merge, so /login keeps the passkey ceremony and stays unadvertised.
//
// signInStudent is untouched: /g/marie keeps its own form and the invite flow
// is unchanged, so a student who still has their link never comes here.
//
// Not in Task H1's own file list, but necessary plumbing: this is the only
// caller of SignInForm (components/student/SignInForm.tsx), which is now a
// client component that takes `locale` as a prop rather than reading it
// itself — and takes `locale`, not the resolved `strings` object, because a
// `Strings` value cannot cross the server/client boundary. See lib/strings.ts.
export default async function SignInPage() {
  const locale: Locale = await currentLocale();
  const strings = getStrings(locale);
  const { student } = strings;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--card-paper)] px-4 py-12">
      <div className="w-full max-w-[420px]">
        <h1 className="mb-2 text-center font-[family-name:var(--card-font-serif)] text-3xl italic text-[var(--card-ink)]">
          {student.brand.wordmark}
        </h1>
        <p className="mb-8 text-center font-[family-name:var(--card-font-serif)] text-[15px] text-[var(--card-moss)]">
          {student.signInPage.subtitle}
        </p>

        <SignInForm locale={locale} />

        {/* There is no password reset and nothing here sends email — the cure
            is Jenn pressing Reset sign-in — so the only honest recovery
            instruction is to write to her. */}
        <p className="mt-6 text-center font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-moss)]">
          {student.signInPage.forgotPassword}
        </p>

        <p className="mt-8 text-center">
          <Link
            href="/"
            className="font-[family-name:var(--card-font-serif)] text-sm text-[var(--card-bleu)] underline"
          >
            {student.signInPage.backToHome}
          </Link>
        </p>
      </div>
    </main>
  );
}
