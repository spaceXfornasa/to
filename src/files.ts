export type DiscordAttachment = {
  id: string;
  filename?: string;
  url: string;
  size?: number;
  content_type?: string;
};

export type LoadedFile =
  | { kind: "text"; name: string; ext: string; text: string; truncated: boolean }
  | { kind: "image"; name: string; ext: string; base64: string; mimeType: string; truncated: boolean };

const MAX_TEXT_FILE_BYTES = 200_000;
const MAX_IMAGE_FILE_BYTES = 10_000_000;

const TEXT_EXTENSIONS = new Set([
  "lua", "luau", "js", "mjs", "cjs", "ts", "tsx", "jsx", "html", "htm", "css", "scss", "json",
  "md", "txt", "py", "java", "kt", "c", "cpp", "h", "hpp", "cs", "go", "rs", "php", "rb", "sh",
  "bat", "ps1", "yml", "yaml", "xml", "sql", "toml", "ini", "cfg", "log", "csv", "vue", "svelte",
]);

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp"]);

/** Downloads a Discord attachment and returns it as text or base64 image. Throws Error with a user-friendly message. */
export async function loadAttachment(att: DiscordAttachment, maxChars: number): Promise<LoadedFile> {
  const name = att.filename ?? "file";
  const ext = (name.includes(".") ? name.split(".").pop()! : "").toLowerCase();
  const contentType = (att.content_type ?? "").toLowerCase();

  const isImage = IMAGE_EXTENSIONS.has(ext) || contentType.startsWith("image/");
  const isText = !isImage && (TEXT_EXTENSIONS.has(ext) || contentType.startsWith("text/"));

  if (!isText && !isImage) {
    throw new Error(
      `File \`${name}\` isn't supported. Send a text/code file (lua, js, ts, py, txt, md, etc.) or an image (png, jpg, webp, gif).`,
    );
  }

  const maxBytes = isImage ? MAX_IMAGE_FILE_BYTES : MAX_TEXT_FILE_BYTES;
  if ((att.size ?? 0) > maxBytes) {
    throw new Error(`File \`${name}\` is too large (max ${Math.round(maxBytes / (isImage ? 1_000_000 : 1_000))} ${isImage ? "MB" : "KB"}).`);
  }

  const response = await fetch(att.url);
  if (!response.ok) throw new Error(`Failed to download file \`${name}\` (HTTP ${response.status}).`);

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
    throw new Error(`File \`${name}\` is too large (max ${Math.round(maxBytes / (isImage ? 1_000_000 : 1_000))} ${isImage ? "MB" : "KB"}).`);
  }

  if (isImage) {
    const base64 = Buffer.from(buffer).toString("base64");
    let mimeType = contentType;
    if (!mimeType || !mimeType.startsWith("image/")) {
      switch (ext) {
        case "png": mimeType = "image/png"; break;
        case "jpg":
        case "jpeg": mimeType = "image/jpeg"; break;
        case "webp": mimeType = "image/webp"; break;
        case "gif": mimeType = "image/gif"; break;
        case "bmp": mimeType = "image/bmp"; break;
        default: mimeType = "image/png"; break;
      }
    }
    return { kind: "image", name, ext, base64, mimeType, truncated: false };
  }

  let text = new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, "");
  if (text.includes("\u0000")) throw new Error(`File \`${name}\` looks like a binary file, not text/code.`);

  const truncated = text.length > maxChars;
  if (truncated) text = text.slice(0, maxChars);
  return { kind: "text", name, ext, text, truncated };
}
