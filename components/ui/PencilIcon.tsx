// A pencil laid across a baseline: the nib, the barrel, the line it writes on.
//
// Shared rather than copied: the admin's page list and a student's shelf both
// draw an edit control, and the two are deliberately the same control under the
// same rule — html and pdf rows get it, a link row does not. Duplicating the
// path data is how those two quietly stop matching.
export function PencilIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
