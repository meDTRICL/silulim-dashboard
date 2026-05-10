const API = "https://repo-production-de6e.up.railway.app";

let chartCategory, chartRegion, chartTrend, chartSegment;

function formatUSD(num) {
  const n = parseFloat(num) || 0;
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(1) + "K";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2
  }).format(n);
}

const COLORS = [
  "#4f8ef7","#4ff7a0","#f7c94f","#f75f4f",
  "#c44ff7","#4ff7f0","#f7944f","#7bf74f"
];

const CHART_OPTS = {
  plugins: {
    legend: {
      labels: {
        color: "#6b7394",
        font: { family: "Outfit", size: 12 }
      }
    }
  },
  scales: {
    x: {
      ticks: { color: "#6b7394", font: { family: "Space Mono", size: 10 } },
      grid: { color: "rgba(42,47,66,0.5)" }
    },
    y: {
      ticks: {
        color: "#6b7394",
        font: { family: "Space Mono", size: 10 },
        callback: v => formatUSD(v)
      },
      grid: { color: "rgba(42,47,66,0.5)" }
    }
  }
};

const SMOOTH_ANIMATION = {
  duration: 1200,
  easing: "easeOutQuart"
};

/* ================= SERVER CHECK ================= */
async function checkServer() {
  try {
    await fetch(API + "/");
    document.getElementById("serverStatus").innerHTML =
      `<span class="status-dot"></span> Server aktif`;
  } catch {
    document.getElementById("serverStatus").innerHTML =
      `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f75f4f;margin-right:6px;"></span> Server offline`;
    document.getElementById("serverStatus").style.color = "#f75f4f";
  }
}

/* ================= OPTIONS ================= */
async function loadOptions() {
  try {
    const opts = await fetch(API + "/options").then(r => r.json());

    const add = (id, arr) => {
      const sel = document.getElementById(id);
      arr.forEach(v => sel.innerHTML += `<option value="${v}">${v}</option>`);
    };

    add("filterYear", opts.years);
    add("filterRegion", opts.regions);
    add("filterCategory", opts.categories);
    add("filterSegment", opts.segments);

  } catch (e) {
    console.error("loadOptions:", e);
  }
}

/* ================= FILTER ================= */
function getFilters() {
  return {
    year: document.getElementById("filterYear").value,
    region: document.getElementById("filterRegion").value,
    category: document.getElementById("filterCategory").value,
    segment: document.getElementById("filterSegment").value,
  };
}

function buildQuery(p) {
  return Object.entries(p)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
}

/* ================= REFRESH ================= */
async function refreshAll() {
  const f = getFilters();
  if (typeof aiUpdateContext === "function") aiUpdateContext(f);
  await Promise.all([
    loadKpi(f),
    loadRegion(f),
    loadTrend(f),
    loadSegment(f),
    loadTable(f)
  ]);
}

/* ================= KPI ================= */
function animateValue(id, end, prefix = "") {
  const el = document.getElementById(id);
  let start = 0;
  const duration = 800;
  const step = 10;
  const inc = end / (duration / step);

  const timer = setInterval(() => {
    start += inc;
    if (start >= end) {
      start = end;
      clearInterval(timer);
    }
    el.textContent = prefix + start.toLocaleString(undefined, {
      maximumFractionDigits: 2
    });
  }, step);
}

async function loadKpi(f) {
  try {
    const q = buildQuery({ year: f.year, region: f.region });

    const [summary, raw] = await Promise.all([
      fetch(`${API}/summary${q ? "?" + q : ""}`).then(r => r.json()),
      fetch(`${API}/sales-by-year?${buildQuery(f)}`).then(r => r.json()),
    ]);

    const totalRev = summary.reduce((s, d) => s + d.total, 0);
    const avg = raw.length ? totalRev / raw.length : 0;
    const best = summary[0];

    animateValue("kpiRevenue", totalRev, "$");
    animateValue("kpiTx", raw.length);
    animateValue("kpiAvg", avg, "$");

    document.getElementById("kpiRevenueSub").textContent =
      f.year ? `Tahun ${f.year}` : "Semua tahun";

    document.getElementById("kpiBest").textContent = best ? best.product : "—";
    document.getElementById("kpiBestSub").textContent =
      best ? formatUSD(best.total) : "";

    if (chartCategory) chartCategory.destroy();
    chartCategory = new Chart(document.getElementById("chartCategory"), {
      type: "bar",
      data: {
        labels: summary.map(d => d.product),
        datasets: [{
          label: "Revenue",
          data: summary.map(d => d.total),
          backgroundColor: COLORS,
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        ...CHART_OPTS,
        responsive: true,
        animation: SMOOTH_ANIMATION,
        plugins: {
          ...CHART_OPTS.plugins,
          legend: { display: false }
        }
      }
    });

  } catch (e) {
    console.error(e);
  }
}

/* ================= REGION ================= */
async function loadRegion(f) {
  try {
    const q = buildQuery({ year: f.year });

    const data = await fetch(`${API}/summary-region${q ? "?" + q : ""}`)
      .then(r => r.json());

    if (chartRegion) chartRegion.destroy();

    chartRegion = new Chart(document.getElementById("chartRegion"), {
      type: "doughnut",
      data: {
        labels: data.map(d => d.region),
        datasets: [{
          data: data.map(d => d.total),
          backgroundColor: COLORS,
          borderColor: "#161920",
          borderWidth: 3,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        animation: SMOOTH_ANIMATION,
        plugins: {
          legend: {
            position: "right",
            labels: {
              color: "#6b7394",
              font: { family: "Outfit", size: 12 },
              padding: 14
            }
          }
        }
      }
    });

  } catch (e) {
    console.error(e);
  }
}

/* ================= TREND ================= */
async function loadTrend(f) {
  try {
    const q = buildQuery({ year: f.year });

    const data = await fetch(`${API}/monthly-trend${q ? "?" + q : ""}`)
      .then(r => r.json());

    const mn = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

    const labels = data.map(d => {
      const [y, m] = d.month.split("-");
      return `${mn[parseInt(m) - 1]} '${y.slice(2)}`;
    });

    if (chartTrend) chartTrend.destroy();

    chartTrend = new Chart(document.getElementById("chartTrend"), {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Revenue Bulanan",
          data: data.map(d => d.total),
          borderColor: "#4f8ef7",
          backgroundColor: "rgba(79,142,247,0.08)",
          borderWidth: 2.5,
          pointRadius: 4,
          tension: 0.35,
          fill: true
        }]
      },
      options: {
        ...CHART_OPTS,
        responsive: true,
        animation: SMOOTH_ANIMATION
      }
    });

  } catch (e) {
    console.error(e);
  }
}

/* ================= SEGMENT ================= */
async function loadSegment(f) {
  try {
    const q = buildQuery({ year: f.year });

    const data = await fetch(`${API}/summary-segment${q ? "?" + q : ""}`)
      .then(r => r.json());

    if (chartSegment) chartSegment.destroy();

    chartSegment = new Chart(document.getElementById("chartSegment"), {
      type: "bar",
      data: {
        labels: data.map(d => d.segment),
        datasets: [{
          label: "Revenue",
          data: data.map(d => d.total),
          backgroundColor: ["#4f8ef7", "#4ff7a0", "#f7c94f"],
          borderRadius: 6
        }]
      },
      options: {
        ...CHART_OPTS,
        responsive: true,
        indexAxis: "y",
        animation: SMOOTH_ANIMATION,
        plugins: {
          ...CHART_OPTS.plugins,
          legend: { display: false }
        }
      }
    });

  } catch (e) {
    console.error(e);
  }
}

/* ================= TABLE ================= */
async function loadTable(f) {
  const tbody = document.getElementById("tableBody");

  tbody.innerHTML = `<tr><td colspan="7"><div class="skeleton"></div></td></tr>`;

  try {
    const data = await fetch(`${API}/sales-by-year?${buildQuery(f)}`)
      .then(r => r.json());

    const top10 = [...data]
      .sort((a, b) => parseFloat(b.Sales || 0) - parseFloat(a.Sales || 0))
      .slice(0, 10);

    const cc = {
      Furniture: "#4f8ef7",
      "Office Supplies": "#4ff7a0",
      Technology: "#f7c94f"
    };

    tbody.innerHTML = top10.map((d, i) => `
      <tr>
        <td><strong>${i + 1}</strong></td>
        <td>${d["Order Date"] || ""}</td>
        <td title="${d["Product Name"] || ""}">
          <strong>${(d["Product Name"] || "").substring(0, 35)}${(d["Product Name"] || "").length > 35 ? "…" : ""}</strong>
        </td>
        <td>
          <span class="badge"
            style="background:${cc[d["Category"]] || "#6b7394"}22;color:${cc[d["Category"]] || "#aaa"};">
            ${d["Category"] || ""}
          </span>
        </td>
        <td>${d["Region"] || ""}</td>
        <td>${d["Segment"] || ""}</td>
        <td><strong>${formatUSD(parseFloat(d["Sales"] || 0))}</strong></td>
      </tr>
    `).join("");

  } catch (e) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="color:#f75f4f;text-align:center;">
          ⚠️ Gagal memuat data
        </td>
      </tr>
    `;
  }
}

/* ================= INIT ================= */
setInterval(() => refreshAll(), 30000);

checkServer();
loadOptions().then(() => refreshAll());


// ========================= [ Fitur AI ] ========================
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