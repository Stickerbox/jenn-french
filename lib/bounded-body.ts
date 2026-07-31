// Content-Length is a claim, not a fact: a chunked request omits it entirely
// and a hostile one can lie. Counting bytes as they arrive is what actually
// bounds how much a caller can make the process buffer, and it stops reading
// the moment the cap is passed rather than after the whole body has landed.
export async function readBoundedBody(
  request: Request,
  maxBytes: number,
): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }

  return new TextDecoder().decode(body);
}
