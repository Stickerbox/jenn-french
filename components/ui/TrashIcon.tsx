// A lid, a can, and the two ribs. Same stroke idiom as PencilIcon and
// PinIcon beside it, so the three read as one set in a tile's action row.
//
// Shared for the reason PencilIcon states: the page list's link delete and the
// editor's "delete this page" are the same act, and two copies of the path
// data are how two deletes quietly stop looking alike. It lived inside
// PageList until 2026-08-07 and moved here the moment a second caller wanted
// it, rather than being copied.
export function TrashIcon() {
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
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="m19 6-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
