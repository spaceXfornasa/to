/** Returns the language of a code fence left open at the end of `text`, or null if all fences are closed. */
function openFenceLang(text: string): string | null {
  let open: string | null = null;
  for (const line of text.split("\n")) {
    const t = line.trimStart();
    if (!t.startsWith("```")) continue;
    open = open === null ? t.slice(3).trim() : null;
  }
  return open;
}

/**
 * Splits text for Discord's message limit without breaking ``` code blocks:
 * a block cut in the middle is closed in one message and reopened (same language) in the next.
 * Code indentation is preserved.
 */
export function splitDiscordMessage(text: string, maxChars: number): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return ["(no response)"];
  if (normalized.length <= maxChars) return [normalized];

  const chunks: string[] = [];
  let remaining = normalized;
  let carry = "";

  while (carry.length + remaining.length > maxChars) {
    const budget = maxChars - carry.length - 4; // room for closing "\n```"
    let cut = remaining.lastIndexOf("\n", budget);
    if (cut < Math.floor(budget * 0.5)) cut = remaining.lastIndexOf(" ", budget);
    if (cut < Math.floor(budget * 0.5)) cut = budget;

    let body = carry + remaining.slice(0, cut).trimEnd();
    const lang = openFenceLang(body);
    if (lang !== null) {
      body += "\n```";
      carry = "```" + lang + "\n";
    } else {
      carry = "";
    }
    chunks.push(body);
    remaining = remaining.slice(cut).replace(/^\n/, "");
  }

  chunks.push(carry + remaining);
  return chunks;
}

/**
 * Discord does not render markdown tables, so they show up as raw pipes.
 * Converts them to bullet lists (tables inside ``` fences are left alone).
 * <=3 columns: "- **first** — second — third"; more: "- **first** — Header: value; Header: value".
 */
export function convertMarkdownTables(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const splitRow = (line: string) =>
    line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
  const isRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
  const isSeparator = (line: string) => isRow(line) && /^\|?(:?-+:?\|)+(:?-+:?)?\|?$/.test(line.replace(/\s/g, ""));

  const out: string[] = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      out.push(line);
      continue;
    }

    if (!inFence && isRow(line) && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      const headers = splitRow(line);
      let j = i + 2;
      while (j < lines.length && isRow(lines[j]) && !lines[j].trimStart().startsWith("```")) {
        const cells = splitRow(lines[j]);
        const first = (cells[0] ?? "").replace(/\*\*/g, "");
        const rest = cells.slice(1);
        let tail: string;
        if (headers.length <= 3) {
          tail = rest.filter(Boolean).join(" — ");
        } else {
          tail = rest
            .map((c, idx) => (c ? `${(headers[idx + 1] ?? "").replace(/\*\*/g, "")}: ${c}` : ""))
            .filter(Boolean)
            .join("; ");
        }
        out.push(`- **${first}**${tail ? ` — ${tail}` : ""}`);
        j += 1;
      }
      i = j - 1;
      continue;
    }

    out.push(line);
  }

  return out.join("\n");
}

export type CodeFile = { name: string; lang: string; content: string };

const LANG_EXT: Record<string, string> = {
  lua: "lua", luau: "lua", javascript: "js", js: "js", node: "js", typescript: "ts", ts: "ts",
  tsx: "tsx", jsx: "jsx", html: "html", css: "css", scss: "scss", json: "json", python: "py",
  py: "py", java: "java", kotlin: "kt", c: "c", cpp: "cpp", "c++": "cpp", csharp: "cs", cs: "cs",
  go: "go", rust: "rs", php: "php", ruby: "rb", bash: "sh", sh: "sh", shell: "sh", powershell: "ps1",
  ps1: "ps1", yaml: "yaml", yml: "yml", xml: "xml", sql: "sql", toml: "toml", markdown: "md", md: "md",
};

function safeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? raw;
  return base.replace(/[^\w.\-]/g, "_").slice(0, 80) || "code.txt";
}

/**
 * Moves long fenced code blocks out of the message text so they can be sent as file attachments.
 * A line directly above a block that contains only a filename (e.g. `Main.server.lua`) names the file.
 * Blocks shorter than `minLines` stay inline. Returns the remaining text plus the extracted files.
 */
export function extractCodeFiles(text: string, minLines = 6, maxFiles = 10): { text: string; files: CodeFile[] } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  const files: CodeFile[] = [];
  const used = new Set<string>();
  const labelRe = /^[\s*_>#-]*`?([\w\-./\\]+\.[A-Za-z0-9]{1,8})`?[\s*_:]*$/;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trimStart();
    if (!trimmed.startsWith("```")) {
      out.push(line);
      continue;
    }

    const lang = trimmed.slice(3).trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    let j = i + 1;
    const body: string[] = [];
    while (j < lines.length && !lines[j].trimStart().startsWith("```")) {
      body.push(lines[j]);
      j += 1;
    }
    const closed = j < lines.length;
    const original = lines.slice(i, closed ? j + 1 : j);

    if (body.length < minLines || files.length >= maxFiles) {
      out.push(...original);
      i = closed ? j : j - 1;
      continue;
    }

    // Look for a filename label directly above the block.
    let name: string | null = null;
    let k = out.length - 1;
    while (k >= 0 && out[k].trim() === "") k -= 1;
    if (k >= 0) {
      const m = out[k].match(labelRe);
      if (m) {
        name = safeFileName(m[1]);
        out.splice(k, 1);
      }
    }
    if (!name) name = `code-${files.length + 1}.${LANG_EXT[lang] ?? "txt"}`;

    // Avoid duplicate attachment names.
    if (used.has(name)) {
      const dot = name.lastIndexOf(".");
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : "";
      let n = 2;
      while (used.has(`${stem}-${n}${ext}`)) n += 1;
      name = `${stem}-${n}${ext}`;
    }
    used.add(name);

    files.push({ name, lang, content: body.join("\n") });
    out.push(`📎 \`${name}\``);
    i = closed ? j : j - 1;
  }

  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n").trim(), files };
}
