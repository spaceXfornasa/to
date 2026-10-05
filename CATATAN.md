# Perbaikan Saviera — catatan singkat

## Cara pasang
Ekstrak zip ini ke root project (timpa file yang sama), lalu:
    npm run check                       # type-check
    npx tsx --test qa/prompt.test.ts    # 10 tes (bahasa, sanitizer, knowledge, router)

## File
- src/language.ts   (BARU)  deteksi bahasa, language lock, sanitizer cadangan
- src/router.ts     system prompt bersusun per blok; language lock selalu paling akhir
- src/knowledge.ts  fakta dalam bahasa netral (English), matching per kata utuh, bobot kuat/lemah
- src/text.ts       fungsi bahasa lama dipindah ke language.ts
- src/index.ts      25 baris berubah (import, SYSTEM_PROMPT, placeholder lampiran, log, follow-up search, sanitize)
- qa/prompt.test.ts (BARU)

## Keputusan yang perlu kamu cek
1. SYSTEM_PROMPT di .env sekarang sifatnya TAMBAHAN (masuk blok "OWNER INSTRUCTIONS"), tidak lagi
   mengganti persona. Kalau di hosting kamu sudah ada SYSTEM_PROMPT lama, kosongkan/hapus dulu —
   kemungkinan besar itu yang selama ini menimpa aturan bahasa di kode.
2. DEFAULT_LANGUAGE di src/language.ts = "en" (sama seperti aturan lama). Dipakai hanya kalau bahasa
   user tidak terdeteksi dan tidak ada riwayat. Kalau komunitasmu mayoritas Indonesia, ganti ke "id".
3. Naikkan KB_VERSION setiap isi fakta di knowledge.ts berubah.

---

## Update: pesan bot jadi English + info model hanya untuk admin

File berubah: src/index.ts, src/files.ts, src/router.ts (+ hasil build index.js, files.js, router.js)

### Bahasa
Semua teks yang tampil ke user (reply, help, deskripsi slash command, error file, durasi "try again in ...")
sekarang English. Contoh: "Call me with `@bot question` or `!question`. Type `!help` for commands."
Log console dan pesan config error juga di-English-kan.

### Admin only (DISCORD_ADMIN_USER_IDS)
- `!models` `!model` `!status` `!ai-status` `!ai-model` dan versi slash-nya: hanya admin.
  User biasa dapat "This command is for admins only."
- Versi prefix membalas lewat DM admin (reply di channel itu publik), versi slash pakai ephemeral.
  Kalau DM admin tertutup, bot minta pakai slash command.
- `/ai-model` tidak lagi pakai daftar pilihan tetap; pakai autocomplete yang hanya terisi untuk admin.
  Deskripsi option juga tidak lagi menyebut "Ollama".
- `/help` dan `!help` hanya menampilkan command admin ke admin.
- Badge model di bawah jawaban ("Gemini Model" dst.) default MATI. Nyalakan lagi: SHOW_MODEL_BADGE=true
- Error AI ke user selalu generik. Detail error gateway hanya masuk log console.
- Persona AI (router.ts, blok TRUST): tidak boleh menyebut model/provider/versi yang dipakai.

### Perlu dicek
1. Command admin masih kelihatan di daftar slash Discord (hanya ditolak saat dipakai).
   Untuk menyembunyikannya: Server Settings > Integrations > bot > atur izin per command.
2. Kalau di hosting ada SYSTEM_PROMPT lama, ingat aturan di catatan sebelumnya (kosongkan dulu).

---

## Update: rapikan campuran .ts / .js

Penyebab: tsconfig.json tidak punya outDir, jadi `npm run build` (tsc) menulis hasil compile (.js)
langsung di samping .ts di folder src/. Bot dijalankan lewat `tsx src/index.ts`, jadi .js itu tidak terpakai
dan cuma jadi dobel + berpotensi basi.

Perubahan:
- 8 file .js hasil compile dihapus (index, files, knowledge, language, obfuscator, router, search, text).
- tsconfig.json: `"noEmit": true` -> tsc tidak akan menulis .js lagi.
- package.json: `build` jadi `tsc --noEmit` (sama dengan `check`).
- .gitignore: node_modules/ dan .env.
- TETAP ADA, jangan dihapus: src/prometheus.js dan src/luaString.js. Ini ditulis tangan (bukan hasil compile),
  dan dipakai obfuscator.ts lewat require("./prometheus.js").

Aturan ke depan: edit hanya file .ts. Jalankan dengan `npm start`.
