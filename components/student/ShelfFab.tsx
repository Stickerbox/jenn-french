"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Fab } from "@/components/ui/Fab";
import { AddMenu } from "@/components/ui/AddMenu";
import { AddSheet } from "@/components/ui/AddSheet";
import { HtmlPasteBox } from "@/components/ui/HtmlPasteBox";
import { cn } from "@/lib/utils";
import { fieldClassName } from "@/components/ui/field";

type Open = null | "menu" | "link" | "page";

// The shelf's one add control, replacing the row of fields that used to sit
// above the files list. It renders on EVERY tab, not just Files: it matches the
// chat button, which is already page-level, and a control that appears and
// disappears as you move between tabs reads as a bug next to one that never
// does.
//
// It sits to the LEFT of the chat button rather than above it. Above is where
// the chat panel lives (ChatWindow's bottom-24 right-4), so a stacked button
// would sit behind an open conversation. Side by side, neither ever covers the
// other and neither has to move.
//
// It renders inside StreamProvider because that is the branch `unlocked`
// already selects — not because it needs the stream. It must never call
// useStream.
export function ShelfFab({
  onAddLink,
  onAddPage,
}: {
  onAddLink: (input: { url: string }) => Promise<void>;
  onAddPage: (input: { html: string }) => Promise<void>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function done() {
    setOpen(null);
    setUrl("");
    setError(null);
    // The shelf is server-rendered, so a refresh is what makes the new row
    // appear rather than a local insert that could disagree with it.
    router.push("?tab=files");
    router.refresh();
  }

  async function submitLink(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onAddLink({ url });
      done();
    } catch {
      // The action's own messages are English and written for Jenn; a student
      // gets one French sentence instead of a leaked internal string.
      setError("Ce lien n'a pas pu être ajouté.");
    } finally {
      setSaving(false);
    }
  }

  // The paste IS the submit: there is no Save button, because there is nothing
  // else on this form to fill in.
  async function submitPage(html: string) {
    setSaving(true);
    setError(null);
    try {
      await onAddPage({ html });
      done();
    } catch {
      setError("Cette page n'a pas pu être ajoutée.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {open === "menu" && (
        <AddMenu
          className="bottom-24 right-4"
          choices={[
            { key: "link", label: "Ajouter un lien" },
            { key: "page", label: "Ajouter une page" },
          ]}
          onChoose={(key) => setOpen(key === "link" ? "link" : "page")}
          onDismiss={() => setOpen(null)}
        />
      )}

      {open === "link" && (
        <AddSheet
          title="Ajouter un lien"
          closeLabel="Fermer"
          onClose={() => setOpen(null)}
        >
          <form onSubmit={submitLink} className="flex flex-col gap-3">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              aria-label="Adresse du lien"
              required
              autoFocus
              className={cn(fieldClassName, "mt-0")}
            />
            {/* One field: the name is taken from the address itself. */}
            <button
              type="submit"
              disabled={saving || url.trim() === ""}
              className="rounded-full bg-[var(--card-bleu)] px-5 py-2.5 font-[family-name:var(--card-font-serif)] text-sm text-white disabled:opacity-50"
            >
              {saving ? "Ajout…" : "Enregistrer"}
            </button>
            {error && (
              <p role="alert" className="text-center text-sm text-[var(--card-rouge)]">
                {error}
              </p>
            )}
          </form>
        </AddSheet>
      )}

      {open === "page" && (
        <AddSheet
          title="Ajouter une page"
          closeLabel="Fermer"
          onClose={() => setOpen(null)}
        >
          <HtmlPasteBox
            tone="card"
            labels={{
              prompt: "Collez le code HTML ici (⌘V)",
              accepted: (size) => `Page reçue — ${size}`,
              ariaLabel: "Code HTML de la page",
            }}
            onHtml={submitPage}
            errorFor={() => "Ce n'est pas une page HTML."}
          />
          {error && (
            <p role="alert" className="mt-2 text-center text-sm text-[var(--card-rouge)]">
              {error}
            </p>
          )}
        </AddSheet>
      )}

      <Fab
        label="Ajouter"
        expanded={open === "menu"}
        onClick={() => setOpen(open === null ? "menu" : null)}
        className="bottom-6 right-24"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Fab>
    </>
  );
}
