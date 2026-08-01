import type { LinkBrand } from "@/lib/link-brand";

// Product colours, literal rather than --card-* tokens: these identify someone
// else's product, so they must not shift when this project's palette does.
const TINT: Record<LinkBrand, string> = {
  "google-docs": "#1a73e8",
  "google-sheets": "#0f9d58",
  "google-slides": "#f4b400",
  "google-forms": "#7248b9",
  "google-drive": "#1a73e8",
  youtube: "#ff0000",
  pdf: "#d93025",
  generic: "#5f6368",
};

// A sheet with a folded corner, plus per-product marks on its face.
function Sheet({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <path d="M14 6h14l10 10v26a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" fill="currentColor" opacity="0.14" />
      <path d="M14 6h14l10 10v26a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M28 6v10h10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      {children}
    </>
  );
}

function Marks({ brand }: { brand: LinkBrand }) {
  switch (brand) {
    case "google-docs":
      return (
        <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 24h14M18 30h14M18 36h9" />
        </g>
      );
    case "google-sheets":
      return (
        <g stroke="currentColor" strokeWidth="2.5">
          <path d="M18 23h14v14H18z" fill="none" />
          <path d="M18 30h14M25 23v14" />
        </g>
      );
    case "google-slides":
      return <path d="M18 24h14v12H18z" fill="none" stroke="currentColor" strokeWidth="2.5" />;
    case "google-forms":
      return (
        <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 24l2.5 2.5L25 22M18 33l2.5 2.5L25 31M29 25h5M29 34h5" />
        </g>
      );
    case "pdf":
      return (
        <text x="25" y="36" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">
          PDF
        </text>
      );
    default:
      return null;
  }
}

export function BrandGlyph({ brand }: { brand: LinkBrand }) {
  const colour = TINT[brand];

  // Drive, YouTube and generic are not sheets, so they draw their own whole
  // shape rather than marks on one.
  if (brand === "google-drive") {
    return (
      <svg viewBox="0 0 50 50" width="56" height="56" style={{ color: colour }} aria-hidden="true">
        <path d="M19 7h12l13 22-6 11H12L6 29Z" fill="currentColor" opacity="0.14" />
        <path d="M19 7h12l13 22-6 11H12L6 29Z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
    );
  }

  if (brand === "youtube") {
    return (
      <svg viewBox="0 0 50 50" width="56" height="56" style={{ color: colour }} aria-hidden="true">
        <rect x="6" y="12" width="38" height="26" rx="6" fill="currentColor" opacity="0.14" />
        <rect x="6" y="12" width="38" height="26" rx="6" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <path d="M21 19l11 6-11 6Z" fill="currentColor" />
      </svg>
    );
  }

  if (brand === "generic") {
    return (
      <svg viewBox="0 0 50 50" width="56" height="56" style={{ color: colour }} aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <path d="M21 29a7 7 0 0 1 0-10l5-5a7 7 0 0 1 10 10l-2 2" />
          <path d="M29 21a7 7 0 0 1 0 10l-5 5a7 7 0 0 1-10-10l2-2" />
        </g>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 50 50" width="56" height="56" style={{ color: colour }} aria-hidden="true">
      <Sheet />
      <Marks brand={brand} />
    </svg>
  );
}
