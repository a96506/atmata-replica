import "server-only";

/**
 * Server-side attachment MIME allow-list.
 *
 * The browser `accept` hint (`application/pdf,image/*` in FileDrop, and
 * `.pdf,.png,.jpg,.jpeg` for AP invoice upload) is advisory only — a client
 * can submit `text/html` or `image/svg+xml`, both of which can execute
 * script when rendered. Validate the declared MIME server-side before we
 * record the attachment row, since the file bytes go up directly from the
 * browser and the server only sees the declared `mime` string.
 *
 * InsForge Storage's `upload()` does not expose per-object
 * `Content-Disposition` / `X-Content-Type-Options` headers (platform
 * limitation), so this server-side check is the primary control — the CDN
 * will still serve whatever bytes the browser uploaded, but we never link
 * an active document type into the app.
 */
const ALLOWED_ATTACHMENT_MIMES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const REJECTED_ACTIVE_MIMES = new Set([
  "text/html",
  "image/svg+xml",
  "application/xhtml+xml",
  "text/javascript",
  "application/javascript",
  "application/ecmascript",
]);

export class InvalidAttachmentMimeError extends Error {
  constructor(mime: string) {
    super(
      `Unsupported file type "${mime}". Allowed: PDF, PNG, JPEG, WebP.`,
    );
    this.name = "InvalidAttachmentMimeError";
  }
}

export function assertAllowedAttachmentMime(mime: string | null | undefined): void {
  const normalized = (mime ?? "").trim().toLowerCase();
  if (!normalized) {
    throw new InvalidAttachmentMimeError("(missing)");
  }
  if (REJECTED_ACTIVE_MIMES.has(normalized)) {
    throw new InvalidAttachmentMimeError(normalized);
  }
  if (!ALLOWED_ATTACHMENT_MIMES.has(normalized)) {
    throw new InvalidAttachmentMimeError(normalized);
  }
}
