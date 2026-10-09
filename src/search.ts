export type SearchResult = {
  title: string;
  url: string;
  content: string;
};

export type SearchResponse = {
  results: SearchResult[];
  answer?: string | null;
};

export class TavilySearchManager {
  private gatewayUrl: string;
  private gatewayToken: string;
  private cache = new Map<string, { timestamp: number; data: SearchResponse }>();
  private cacheTtlMs = 15 * 60 * 1000; // 15 menit cache

  constructor(gatewayUrl: string, gatewayToken: string) {
    this.gatewayUrl = gatewayUrl.trim().replace(/\/+$/, "");
    this.gatewayToken = gatewayToken.trim();
  }

  isAvailable(): boolean {
    return Boolean(this.gatewayUrl && this.gatewayToken);
  }

  hasKeys(): boolean {
    return this.isAvailable();
  }

  /**
   * Cleans conversational filler words and formats queries for maximum search engine precision.
   */
  buildOptimizedQuery(query: string): string {
    let text = query.trim();
    const now = new Date();
    const currentYear = now.getFullYear();

    // 1. Remove conversational noise and filler words
    const conversationalNoise = /\b(saviera|savira|bot|coba|tolong|bisa|cariin|carikan|cari|search|googling|dong|kak|kakak|apa ya|apaan|sih|tau ga|tau gak|kira-?kira|plis|please|info web|cek web)\b/gi;
    text = text.replace(conversationalNoise, " ").replace(/[?!,"'\\]+/g, " ").replace(/\s+/g, " ").trim();

    // 2. If text was reduced to empty, fallback to original query
    if (!text) text = query.trim();

    // 3. Temporal anchor: map "hari ini", "terbaru", "terkini" to current month and year
    const hasYear = /\b(202\d)\b/.test(text);
    if (!hasYear && /\b(hari ini|terbaru|terkini|berita|news|sekarang|minggu ini|bulan ini)\b/i.test(text)) {
      const monthNames = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember",
      ];
      const monthYear = `${monthNames[now.getMonth()]} ${currentYear}`;
      return `${text} ${monthYear}`;
    }

    return text;
  }

  async search(query: string, maxResults = 5): Promise<SearchResponse> {
    const trimmed = query.trim();
    if (!trimmed || !this.isAvailable()) return { results: [], answer: null };

    const optimized = this.buildOptimizedQuery(trimmed);
    const cacheKey = `${optimized.toLowerCase()}::${maxResults}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      return cached.data;
    }

    try {
      const response = await fetch(`${this.gatewayUrl}/v1/search`, {
        method: "POST",
        signal: AbortSignal.timeout(25000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.gatewayToken}`,
          "User-Agent": "StealthAI Bot Search Client/1.0",
        },
        body: JSON.stringify({
          query: optimized,
          max_results: maxResults,
          search_depth: "advanced",
          include_answer: true,
        }),
      });

      if (!response.ok) {
        console.warn(`[Search] Gateway search error HTTP ${response.status}`);
        return { results: [], answer: null };
      }

      const data = (await response.json()) as {
        ok?: boolean;
        answer?: string;
        results?: Array<{ title?: string; url?: string; content?: string }>;
      };

      const results: SearchResult[] = Array.isArray(data.results)
        ? data.results
            .map((r) => ({
              title: r.title?.trim() || "Untitled",
              url: r.url?.trim() || "",
              content: r.content?.trim() || "",
            }))
            .filter((r) => r.content.length > 0)
        : [];

      const searchResponse: SearchResponse = {
        results,
        answer: data.answer?.trim() || null,
      };

      this.cache.set(cacheKey, { timestamp: Date.now(), data: searchResponse });
      return searchResponse;
    } catch (err) {
      console.warn(`[Search] Gateway search request gagal:`, err instanceof Error ? err.message : err);
    }

    return { results: [], answer: null };
  }

  formatForPrompt(results: SearchResult[], query: string, directAnswer?: string | null): string {
    if (results.length === 0 && !directAnswer) return "";

    const parts: string[] = [
      `WEB SEARCH DATA (Query: "${query}"):`,
    ];

    if (directAnswer) {
      parts.push(`SEARCH SUMMARY:\n${directAnswer}`);
    }

    if (results.length > 0) {
      const items = results.map(
        (r, i) => `Source ${i + 1}: "${r.title}"\nURL: ${r.url}\nInformation: ${r.content.slice(0, 1000)}`
      );
      parts.push(`WEB SOURCES:\n${items.join("\n\n")}`);
    }

    parts.push(
      "INSTRUCTION: Synthesize the web search data into a clean, well-structured Discord response in the user's language (under 1,400 characters). Format items as clean bullet points ('- **Name**: Description'). Embed relevant links naturally as markdown [Title](url). DO NOT include numeric citations or reference brackets like [1], [2], [3] anywhere in the response."
    );

    return parts.join("\n\n");
  }

  shouldPreSearch(prompt: string): boolean {
    const text = prompt.toLowerCase();

    // Abaikan jika pure code block
    if (text.includes("```")) {
      return false;
    }

    // Pertanyaan khusus Stealth-X diutamakan ke knowledge internal
    const stealthKeywords = [
      "stealth-x",
      "stealthx",
      "hwid",
      "qris",
      "license key",
      "redeem code",
      "dashboard stealth",
      "harga paket",
      "vip role",
    ];
    if (stealthKeywords.some((k) => text.includes(k))) {
      return false;
    }

    // Permintaan eksplisit searching
    if (/\b(cari(kan)?|search|googling|browsing|cek web|info web)\b/i.test(text)) {
      return true;
    }

    // Indikator temporal, berita, isu terkini, kasus, dan pertanyaan fakta dunia nyata
    const currentYear = new Date().getFullYear();
    const timePatterns = [
      /\b(terbaru|terkini|hari ini|kemarin|sekarang|minggu ini|bulan ini|tahun ini)\b/i,
      /\b(berita|news|update(an)?|patch notes?|patch baru|rilis baru|kapan rilis|release date)\b/i,
      /\b(cuaca|jadwal|skor|pertandingan|hasil match|gempa|kurs|harga (emas|bitcoin|btc|saham|robux|dolar|crypto))\b/i,
      /\b(siapa\s+(itu|yang|sosok|presiden|menteri|pemenang|juara|tersangka|pelaku|korban)|juara (mpl|msc|world|piala))\b/i,
      /\b(kabar|kasus|kejadian|peristiwa|kronologi|viral|korban|pelaku|tersangka|ditangkap|napi|narapidana|polisi|kpk|lapas|sidang)\b/i,
      /\b(kenapa|mengapa|apa penyebab|alasan|ada apa)\b/i,
      new RegExp(`\\b(2024|2025|${currentYear})\\b`),
    ];

    return timePatterns.some((pattern) => pattern.test(text));
  }

  extractSearchTrigger(aiReply: string): string | null {
    const trimmed = aiReply.trim();
    // Mendeteksi format SEARCH: <query> atau [SEARCH: <query>]
    const match = trimmed.match(/^(?:\[\s*)?SEARCH:\s*([^\]\n\r]+)(?:\])?/i);
    if (match && match[1]) {
      const q = match[1].trim();
      if (q.length >= 2 && q.length < 150) {
        return q;
      }
    }
    return null;
  }
}
