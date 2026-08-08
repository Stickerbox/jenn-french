// The dot, and the word behind it.
//
// aria-hidden on the circle with an sr-only label beside it — ConversationList's
// unread dot is the precedent and FilterDisclosure's "Filters active" is the
// second use. A colour alone is not a signal to a reader who cannot see it.
//
// --card-rouge rather than --color-accent: the accent is the lilac that carries
// white button text, and this circle carries none. Rouge is the palette's
// attention colour and reads against both the paper pill and the bleu active
// one.
export function UnseenDot({ label }: { label: string }) {
  return (
    <>
      <span
        aria-hidden
        className="block h-2 w-2 rounded-full bg-[var(--card-rouge)]"
      />
      <span className="sr-only">{label}</span>
    </>
  );
}
