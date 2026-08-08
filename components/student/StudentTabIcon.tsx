import type { StudentTab } from "@/lib/student-tab";

// One icon per tab, hand-rolled at 24/2 like PencilIcon, PinIcon and TrashIcon
// rather than pulled from an icon set — the five have to read as one family and
// a mixed set is how that stops being true.
//
// They are the tab's whole label below `md`, so the silhouettes are chosen to
// differ at a glance rather than to be individually clever: a folder, an easel,
// a stack, a checklist, and a single written card. The near-collision worth
// naming is `card` against `deck` — the same object, one of them and many of
// them — which is why the deck is drawn as two offset outlines with no writing
// on it and the card carries two ruled lines.
const paths: Record<StudentTab, React.ReactNode> = {
  // A card with two lines of writing on it.
  card: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 10h6" />
      <path d="M7 14h10" />
    </>
  ),
  // A folder.
  files: (
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  ),
  // A board on an easel.
  board: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M9 20l3-4 3 4" />
    </>
  ),
  // Two cards, one behind the other.
  deck: (
    <>
      <rect x="8" y="7" width="13" height="14" rx="2" />
      <path d="M4 17V5a2 2 0 0 1 2-2h9" />
    </>
  ),
  // A checklist: two ticks and the rows beside them.
  todo: (
    <>
      <path d="M4 7l1.8 1.8L9 5.5" />
      <path d="M4 16.5l1.8 1.8L9 15" />
      <path d="M13 8h7" />
      <path d="M13 17h7" />
    </>
  ),
};

export function StudentTabIcon({ tab }: { tab: StudentTab }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      // The label beside it carries the name, visible above `md` and `sr-only`
      // below it, so the icon is decoration at every width and never the
      // accessible name.
      aria-hidden="true"
      className="shrink-0"
    >
      {paths[tab]}
    </svg>
  );
}
