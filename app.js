const API = "https://repo-production-de6e.up.railway.app";
            //  https://repo-production-de6e.up.railway.app

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

// let aiHistory = [];
// let aiContext = {};

// function aiUpdateContext(filters) {
//   const kpi = {
//     totalRevenue:   parseFloat(document.getElementById("kpiRevenue")?.textContent?.replace(/[^0-9.]/g,"")) || 0,
//     totalTransaksi: parseFloat(document.getElementById("kpiTx")?.textContent?.replace(/[^0-9.]/g,"")) || 0,
//     rataRata:       parseFloat(document.getElementById("kpiAvg")?.textContent?.replace(/[^0-9.]/g,"")) || 0,
//     kategoriBest:   document.getElementById("kpiBest")?.textContent || ""
//   };
//   aiContext = { filters, kpi };
// }

// async function aiSend() {
//   const input = document.getElementById("aiInput");
//   const msg = input.value.trim();
//   if (!msg) return;

//   aiAppendMessage("user", msg);
//   input.value = "";
//   aiAppendMessage("assistant", "⏳ Sedang menganalisis...", true);

//   try {
//     const res = await fetch(`${API}/ai-chat`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         message: msg,
//         context: aiContext,
//         history: aiHistory
//       })
//     });

//     const data = await res.json();
//     aiRemoveTyping();

//     if (data.answer) {
//       aiAppendMessage("assistant", data.answer);
//       aiHistory.push({ role: "user",      content: msg });
//       aiHistory.push({ role: "assistant", content: data.answer });
//       if (aiHistory.length > 20) aiHistory = aiHistory.slice(-20);
//     } else {
//       aiAppendMessage("assistant", "⚠️ " + (data.error || "Gagal mendapat jawaban."));
//     }
//   } catch (e) {
//     aiRemoveTyping();
//     aiAppendMessage("assistant", "⚠️ Gagal menghubungi server: " + e.message);
//   }
// }

// function aiAppendMessage(role, text, isTyping = false) {
//   const box = document.getElementById("aiMessages");
//   if (!box) return;
//   const div = document.createElement("div");
//   div.className = "ai-msg ai-" + role + (isTyping ? " ai-typing" : "");
//   div.textContent = text;
//   box.appendChild(div);
//   box.scrollTop = box.scrollHeight;
// }

// function aiRemoveTyping() {
//   document.querySelector(".ai-typing")?.remove();
// }

// function aiClear() {
//   aiHistory = [];
//   const box = document.getElementById("aiMessages");
//   if (box) box.innerHTML = "";
// }

// // Enter untuk kirim
// document.addEventListener("DOMContentLoaded", () => {
//   document.getElementById("aiInput")?.addEventListener("keydown", e => {
//     if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); aiSend(); }
//   });
// });