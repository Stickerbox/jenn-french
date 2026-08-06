"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Fab } from "@/components/ui/Fab";
import { AddMenu } from "@/components/ui/AddMenu";
import { AddSheet } from "@/components/ui/AddSheet";
import { NewGroupForm } from "@/components/admin/NewGroupForm";
import { AddLinkForm } from "@/components/admin/AddLinkForm";
import { NewPageForm } from "@/components/admin/NewPageForm";
import { defaultGroupId } from "@/lib/default-audience";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";
import type {
  LinkInput,
  NewPageInput,
  PageSaveResult,
} from "@/app/page-actions";

type Chip = { chip: string | null; setChip: (value: string | null) => void };

const ChipContext = createContext<Chip | null>(null);

// The Pages tab's student filter, read from wherever it is needed. It used to
// be PagesTabClient's own useState; it moved up here because the FAB is outside
// the tab bodies and needs the same value to default a new page's audience.
export function useAdminChip(): Chip {
  const value = useContext(ChipContext);
  if (!value) throw new Error("useAdminChip must be used inside AdminChrome");
  return value;
}

type Open = null | "menu" | "student" | "link" | "page";

// The admin's client shell: it owns the chip, publishes it, and renders the one
// add control for all three tabs.
//
// It wraps server-rendered children. That works — a client provider may wrap a
// server subtree, and a client component nested inside that subtree still reads
// the context — and it is what lets PagesTabClient stay where it is.
export function AdminChrome({
  groups,
  onCreateStudent,
  onCreateLink,
  onCreatePage,
  onCreatePdfPage,
  locale,
  children,
}: {
  groups: { id: string; name: string }[];
  onCreateStudent: (name: string) => Promise<void>;
  onCreateLink: (input: LinkInput) => Promise<unknown>;
  onCreatePage: (input: NewPageInput) => Promise<PageSaveResult>;
  // Bytes, so a FormData rather than an input object — see createPdfPage.
  onCreatePdfPage: (formData: FormData) => Promise<unknown>;
  // This is a client component reached directly from app/admin/page.tsx, so
  // it takes `locale` rather than the resolved `strings` object — a
  // `Strings` value holds functions and cannot cross that boundary. See
  // lib/strings.ts.
  locale: Locale;
  children: ReactNode;
}) {
  const strings = getStrings(locale);
  const router = useRouter();
  const [chip, setChip] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);

  const activeGroupId = defaultGroupId(chip, groups);

  // Land on the tab that shows what was just added, then refresh: these lists
  // are server-rendered, so the row appears because the server re-ran, not
  // because anything was inserted locally.
  function done(tab: "groups" | "pages") {
    setOpen(null);
    router.push(`/admin?tab=${tab}`);
    router.refresh();
  }

  return (
    <ChipContext.Provider value={{ chip, setChip }}>
      {children}

      {open === "menu" && (
        <AddMenu
          className="bottom-24 right-4"
          choices={[
            { key: "student", label: strings.admin.addMenu.addStudent },
            { key: "link", label: strings.admin.addMenu.addLink },
            { key: "page", label: strings.admin.addMenu.addPage },
          ]}
          onChoose={(key) => setOpen(key as Open)}
          onDismiss={() => setOpen(null)}
          dismissLabel={strings.common.close}
        />
      )}

      {open === "student" && (
        <AddSheet
          title={strings.admin.sheets.addStudentTitle}
          closeLabel={strings.common.close}
          onClose={() => setOpen(null)}
        >
          <NewGroupForm
            onSubmit={async (name) => {
              await onCreateStudent(name);
              done("groups");
            }}
            locale={locale}
          />
        </AddSheet>
      )}

      {open === "link" && (
        <AddSheet
          title={strings.admin.sheets.addLinkTitle}
          closeLabel={strings.common.close}
          onClose={() => setOpen(null)}
        >
          <AddLinkForm
            groups={groups}
            defaultGroupId={activeGroupId}
            onSubmit={async (input) => {
              await onCreateLink(input);
              done("pages");
            }}
            locale={locale}
          />
        </AddSheet>
      )}

      {open === "page" && (
        <AddSheet
          title={strings.admin.sheets.addPageTitle}
          closeLabel={strings.common.close}
          onClose={() => setOpen(null)}
        >
          <NewPageForm
            groups={groups}
            defaultGroupId={activeGroupId}
            onSubmit={onCreatePage}
            onSubmitPdf={onCreatePdfPage}
            onDone={() => done("pages")}
            locale={locale}
          />
        </AddSheet>
      )}

      <Fab
        label={strings.admin.fab.add}
        expanded={open === "menu"}
        onClick={() => setOpen(open === null ? "menu" : null)}
        // Left of the chat bubble, not underneath it. InboxFab is ALSO fixed at
        // bottom-6 right-4 with the same z-50, and <TeacherInbox /> renders
        // after this component in app/admin/page.tsx — so at right-4 this
        // button was painted over exactly, and the one control that adds a
        // student, a link or a page was unreachable on the screen that lists
        // all three.
        //
        // ShelfFab made this same move on the student page for the same reason:
        // side by side, neither ever covers the other and neither has to move.
        // Stacked is not an option — bottom-24 is where the open panel goes.
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
    </ChipContext.Provider>
  );
}
