// Content-Length is a claim, not a fact: a chunked request omits it entirely
// and a hostile one can lie. Counting bytes as they arrive is what actually
// bounds how much a caller can make the process buffer, and it stops reading
// the moment the cap is passed rather than after the whole body has landed.
//
// Takes a body rather than a Request so a Response gets the same treatment: an
// asset fetched from a CDN is exactly as much of a claim as an upload is.
export async function readBoundedBytes(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();

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

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  return bytes;
}

export async function readBoundedBody(
  request: Request,
  maxBytes: number,
): Promise<string | null> {
  const bytes = await readBoundedBytes(request.body, maxBytes);
  return bytes === null ? null : new TextDecoder().decode(bytes);
}
