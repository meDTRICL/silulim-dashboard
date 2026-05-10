// server.js — versi lengkap dengan AI Chat terintegrasi
// ★ Tidak perlu file ai-chat.js terpisah — sudah digabung di sini

const express = require("express");
const cors    = require("cors");
const fs      = require("fs");
const csv     = require("csv-parser");
const path    = require("path");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());   // ★ PENTING: wajib untuk POST /ai-chat

const PORT    = process.env.PORT || 9567;
const CSV_FILE = path.join(__dirname, "data.csv");

/* ─── CSV Reader ────────────────────────────────────────── */
function readCSV(filterFn = null) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(CSV_FILE, { encoding: "utf8" })
      .pipe(csv({
        mapHeaders: ({ header }) => header.replace(/;$/, "").replace(/^\uFEFF/, "").trim(),
        mapValues:  ({ value })  => String(value).replace(/;$/, "").trim()
      }))
      .on("data", (row) => {
        if (row["Order Date"] && !row["year"]) {
          const parts = row["Order Date"].split("/");
          if (parts.length === 3) {
            row.year  = parts[2];
            row.month = String(parseInt(parts[1]));
          }
        }
        if (!filterFn || filterFn(row)) results.push(row);
      })
      .on("end",   () => resolve(results))
      .on("error", (err) => { console.error("Error baca CSV:", err); reject(err); });
  });
}

/* ─── Routes lama (tidak diubah) ────────────────────────── */
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Server running" });
});

app.get("/data", async (req, res) => {
  try { res.json(await readCSV()); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/sales-by-year", async (req, res) => {
  try {
    const { year, region, category, segment } = req.query;
    res.json(await readCSV(row => {
      if (year     && row.year          !== year)     return false;
      if (region   && row["Region"]     !== region)   return false;
      if (category && row["Category"]   !== category) return false;
      if (segment  && row["Segment"]    !== segment)  return false;
      return true;
    }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/summary", async (req, res) => {
  try {
    const { year, region } = req.query;
    const data = await readCSV(row => {
      if (year   && row.year        !== year)   return false;
      if (region && row["Region"]   !== region) return false;
      return true;
    });
    const map = {};
    data.forEach(row => {
      const k = row["Category"] || "Unknown";
      map[k] = (map[k] || 0) + parseFloat(row["Sales"] || 0);
    });
    res.json(Object.entries(map).map(([product, total]) => ({ product, total }))
      .sort((a, b) => b.total - a.total));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/summary-subcategory", async (req, res) => {
  try {
    const { year } = req.query;
    const data = await readCSV(row => !year || row.year === year);
    const map = {};
    data.forEach(row => {
      const k = row["Sub-Category"] || "Unknown";
      map[k] = (map[k] || 0) + parseFloat(row["Sales"] || 0);
    });
    res.json(Object.entries(map).map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total).slice(0, 10));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/summary-region", async (req, res) => {
  try {
    const { year } = req.query;
    const data = await readCSV(row => !year || row.year === year);
    const map = {};
    data.forEach(row => {
      const k = row["Region"] || "Unknown";
      map[k] = (map[k] || 0) + parseFloat(row["Sales"] || 0);
    });
    res.json(Object.entries(map).map(([region, total]) => ({ region, total }))
      .sort((a, b) => b.total - a.total));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/monthly-trend", async (req, res) => {
  try {
    const { year } = req.query;
    const data = await readCSV(row => !year || row.year === year);
    const map = {};
    data.forEach(row => {
      if (!row.year || !row.month) return;
      const k = `${row.year}-${String(row.month).padStart(2, "0")}`;
      map[k] = (map[k] || 0) + parseFloat(row["Sales"] || 0);
    });
    res.json(Object.entries(map).map(([month, total]) => ({ month, total }))
      .sort((a, b) => a.month.localeCompare(b.month)));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/summary-segment", async (req, res) => {
  try {
    const { year } = req.query;
    const data = await readCSV(row => !year || row.year === year);
    const map = {};
    data.forEach(row => {
      const k = row["Segment"] || "Unknown";
      map[k] = (map[k] || 0) + parseFloat(row["Sales"] || 0);
    });
    res.json(Object.entries(map).map(([segment, total]) => ({ segment, total }))
      .sort((a, b) => b.total - a.total));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/options", async (req, res) => {
  try {
    const data = await readCSV();
    res.json({
      years:      [...new Set(data.map(r => r.year))].filter(Boolean).sort(),
      regions:    [...new Set(data.map(r => r["Region"]))].filter(Boolean).sort(),
      categories: [...new Set(data.map(r => r["Category"]))].filter(Boolean).sort(),
      segments:   [...new Set(data.map(r => r["Segment"]))].filter(Boolean).sort(),
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


/* ═══════════════════════════════════════════════════════════
   ★ AI CHAT ENDPOINT — POST /ai-chat
   Menggunakan @anthropic-ai/sdk (sudah di-install)
   ANTHROPIC_API_KEY wajib di-set di Railway Variables
═══════════════════════════════════════════════════════════ */

// Inisialisasi SDK Anthropic
let anthropic = null;
try {
  const Anthropic = require("@anthropic-ai/sdk");
  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  console.log("✅ Anthropic SDK berhasil diload");
} catch (err) {
  console.warn("⚠️  @anthropic-ai/sdk tidak ditemukan, akan pakai fetch native:", err.message);
}

// Helper format angka
function fmtUSD(n) {
  n = parseFloat(n) || 0;
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000)     return "$" + (n / 1_000).toFixed(1) + "K";
  return "$" + n.toFixed(2);
}

// Susun system prompt dari data dashboard
function buildSystemPrompt(ctx) {
  const { filters = {}, kpi = {}, summary = [], region = [], segment = [], trend = [] } = ctx;

  const filterDesc = [
    filters.year     && `Tahun: ${filters.year}`,
    filters.region   && `Region: ${filters.region}`,
    filters.category && `Kategori: ${filters.category}`,
    filters.segment  && `Segment: ${filters.segment}`,
  ].filter(Boolean).join(", ") || "Semua data (tanpa filter)";

  const lines = (arr, k1, k2) =>
    arr.map(d => `  - ${d[k1]}: ${fmtUSD(d[k2])}`).join("\n") || "  (tidak ada data)";

  return `Kamu adalah AI Sales Analyst untuk Sales Dashboard Superstore.
Jawab pertanyaan konsumen tentang data penjualan yang sedang ditampilkan.

== DATA DASHBOARD AKTIF ==
Filter: ${filterDesc}

KPI:
  - Total Revenue     : ${fmtUSD(kpi.totalRevenue || 0)}
  - Total Transaksi   : ${(kpi.totalTransaksi || 0).toLocaleString()} order
  - Rata-rata/Order   : ${fmtUSD(kpi.rataRata || 0)}
  - Kategori terlaris : ${kpi.kategoriBest || "—"}

Revenue per Kategori:
${lines(summary, "product", "total")}

Revenue per Region:
${lines(region, "region", "total")}

Revenue per Segment:
${lines(segment, "segment", "total")}

Tren 6 Bulan Terakhir:
${trend.slice(-6).map(d => `  - ${d.month}: ${fmtUSD(d.total)}`).join("\n") || "  (tidak ada data)"}

== ATURAN ==
- Bahasa Indonesia, singkat dan langsung.
- Gunakan angka dari data di atas, jangan mengarang.
- Maksimal 4-5 kalimat kecuali diminta lebih.
- Kamu adalah "AI Analyst TVI Dashboard", bukan Claude.`;
}

app.post("/ai-chat", async (req, res) => {
  try {
    const { message, context, history = [] } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Field 'message' wajib diisi." });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "ANTHROPIC_API_KEY belum di-set. Tambahkan di Railway Variables."
      });
    }

    const systemPrompt = buildSystemPrompt(context || {});
    const messages = [
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: "user", content: message.trim() }
    ];

    let answer;

    if (anthropic) {
      // ── Via SDK ──────────────────────────────────────────
      const msg = await anthropic.messages.create({
        model:      "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system:     systemPrompt,
        messages,
      });
      answer = msg.content[0].text;

    } else {
      // ── Via native fetch (fallback Node ≥18) ─────────────
      const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type":      "application/json",
          "x-api-key":         apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model:      "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system:     systemPrompt,
          messages,
        }),
      });

      if (!apiRes.ok) {
        const err = await apiRes.json().catch(() => ({}));
        throw new Error(err.error?.message || `Anthropic API HTTP ${apiRes.status}`);
      }
      const data = await apiRes.json();
      answer = data.content[0].text;
    }

    res.json({ answer });

  } catch (err) {
    console.error("[AI Chat] Error:", err.message);
    res.status(500).json({ error: err.message || "Terjadi kesalahan di server." });
  }
});


/* ─── Start server ──────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`✅ Server jalan di port : ${PORT}`);
  console.log(`📡 AI Chat endpoint  : POST /ai-chat`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("⚠️  ANTHROPIC_API_KEY belum di-set — fitur AI tidak akan berfungsi");
  }
});