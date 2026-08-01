"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { fieldClassName } from "@/components/ui/field";

export function AddLinkRow({
  onAdd,
}: {
  onAdd: (input: { title: string; url: string }) => Promise<void>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onAdd({ title, url });
      setTitle("");
      setUrl("");
      router.refresh();
    } catch {
      // The action's own messages are English and written for Jenn; the student
      // gets one French sentence instead of a leaked internal string.
      setError("Ce lien n'a pas pu être ajouté.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto mb-8 flex w-full max-w-[560px] flex-col gap-2"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          aria-label="Adresse du lien"
          required
          className={cn(fieldClassName, "mt-0")}
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titre (facultatif)"
          aria-label="Titre du lien"
          className={cn(fieldClassName, "mt-0")}
        />
        <button
          type="submit"
          disabled={saving || url.trim() === ""}
          className="whitespace-nowrap rounded-full bg-[var(--card-bleu)] px-5 py-2 font-[family-name:var(--card-font-serif)] text-sm text-white disabled:opacity-50"
        >
          {saving ? "Ajout…" : "Ajouter un lien"}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-center text-sm text-[var(--card-rouge)]">
          {error}
        </p>
      )}
    </form>
  );
}
