/**
 * Client-side image upload validation.
 * Defense-in-depth on top of bucket policies — does NOT replace server checks.
 *
 * Rejects:
 *  - SVG (XSS via embedded <script>)
 *  - oversize files (default 10 MB)
 *  - files whose magic bytes do not match a supported raster image format
 *
 * Accepts: JPEG, PNG, WebP, GIF, AVIF, HEIC.
 */

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export type ImageValidationResult =
  | { ok: true; mime: string }
  | { ok: false; reason: string };

const MAGIC_SIGNATURES: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF...WEBP (we'll re-check WEBP marker below)
  { mime: "image/avif", bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
  { mime: "image/heic", bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
];

async function detectMimeFromBytes(file: File): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  for (const sig of MAGIC_SIGNATURES) {
    const offset = sig.offset ?? 0;
    if (head.length < offset + sig.bytes.length) continue;
    const matches = sig.bytes.every((b, i) => head[offset + i] === b);
    if (!matches) continue;

    if (sig.mime === "image/webp") {
      // RIFF header — verify WEBP marker at byte 8-11
      const marker = String.fromCharCode(head[8], head[9], head[10], head[11]);
      if (marker !== "WEBP") continue;
    }
    return sig.mime;
  }
  return null;
}

export async function validateImageUpload(
  file: File,
  options?: { maxBytes?: number }
): Promise<ImageValidationResult> {
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;

  // 1. Hard reject SVG by extension/MIME (XSS risk via inline <script>).
  const lowerName = file.name.toLowerCase();
  if (file.type === "image/svg+xml" || lowerName.endsWith(".svg")) {
    return { ok: false, reason: "不支援 SVG 檔案（安全考量）" };
  }

  // 2. Size check
  if (file.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    return { ok: false, reason: `檔案大小超過上限 ${mb} MB` };
  }
  if (file.size === 0) {
    return { ok: false, reason: "檔案為空" };
  }

  // 3. Magic bytes check (true content type, not the spoofable file.type)
  const detected = await detectMimeFromBytes(file);
  if (!detected) {
    return { ok: false, reason: "不支援的圖片格式（檔案內容無法辨識）" };
  }

  return { ok: true, mime: detected };
}
