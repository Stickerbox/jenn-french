import { brotliCompress, brotliDecompress, constants } from "node:zlib";

// THE ASYNC API ONLY. One pm2 fork process serves every SSE stream, and a
// synchronous brotli over a megabyte would stall the `: ping` heartbeats that
// keep those streams alive behind nginx — the same rule lib/password-hash.ts
// records for bcrypt.
//
// Hand-rolled promises rather than util.promisify: promisify picks a callback
// overload and loses the options argument's type, and the options are the point.
const OPTIONS = {
  // 5 rather than the default 11. Measured against these documents, 11 costs
  // roughly a second of CPU per save for a few percent of size, and this runs
  // on the request path of the one process that also fans out the chat.
  params: { [constants.BROTLI_PARAM_QUALITY]: 5 },
};

export function packSnapshot(html: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    brotliCompress(Buffer.from(html, "utf8"), OPTIONS, (error, result) => {
      if (error) reject(error);
      else resolve(new Uint8Array(result));
    });
  });
}

export function unpackSnapshot(bytes: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    brotliDecompress(Buffer.from(bytes), (error, result) => {
      if (error) reject(error);
      else resolve(result.toString("utf8"));
    });
  });
}
