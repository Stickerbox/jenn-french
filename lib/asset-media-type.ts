// A fetched asset carries a Content-Type header; a file lifted off Jenn's disk
// carries nothing, and an image or a font still needs a media type for the data
// URI it becomes. The extension is the only signal there is.
const MEDIA_TYPES: Record<string, string> = {
  js: "text/javascript",
  mjs: "text/javascript",
  css: "text/css",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
};

// application/octet-stream for anything unrecognised, which contentTypeMatches
// then refuses for every kind except a font whose path says otherwise. So an
// extensionless <img src="logo"> is reported rather than guessed at. Sniffing
// the bytes would make this a format parser, which validatePagePdf and
// validatePageHtml have both already declined to be.
export function mediaTypeForPath(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  // `<= 0` covers both no extension at all and a dotfile, whose leading dot
  // names the file rather than an extension.
  if (dot <= 0) return "application/octet-stream";
  return (
    MEDIA_TYPES[name.slice(dot + 1).toLowerCase()] ?? "application/octet-stream"
  );
}
