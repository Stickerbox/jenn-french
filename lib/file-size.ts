// Sized for a non-technical reader picking a file to upload, not a developer:
// whole kilobytes below 1 MB, one decimal place at and above it, and never a
// bare "0 KB" for a small-but-real file.
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    const kb = Math.max(1, Math.round(bytes / 1024));
    return `${kb} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}
