// 掃描進行中的網頁版本 — scan.js 每次 checkpoint 都會呼叫這個，讓網頁在掃描完成前
// 也能看到目前進度、預估剩餘時間、以及目前為止的黃金交叉與創新高/創新低結果。

const PERIODS = ['12個月', '6個月', '3個月', '1個月'];
const SURGE_LEGEND =
  '量增 &gt; 前5日均量 1.3倍者已 <span style="background:var(--surge-soft);box-shadow:inset 3px 0 0 var(--surge-border);padding:1px 6px;">highlight</span>';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function marketLabel(type) {
  return type === 'twse' ? '上市' : type === 'tpex' ? '上櫃' : type;
}

// Yahoo奇摩股市的代號後綴：上市是.TW，上櫃是.TWO
function yahooUrl(type, stockId) {
  const suffix = type === 'twse' ? 'TW' : 'TWO';
  return `https://tw.stock.yahoo.com/quote/${stockId}.${suffix}/technical-analysis`;
}

// CMoney（股市爆料同學會）不用分上市/上櫃，同一個網址格式。用來做滑鼠移過去的
// K線圖預覽——CMoney的K線區塊在DOM裡是獨立乾淨的區塊（跟工具列分開），用iframe
// 裁切+縮放只顯示那個區塊（見頁尾script的CROP設定），比Yahoo(直接擋iframe)、
// HiStock/TradingView widgetembed(工具列黏在圖表裡)都更乾淨穩定
function cmoneyUrl(stockId) {
  return `https://www.cmoney.tw/forum/stock/${stockId}?s=technical-analysis`;
}

// 代號: 點了另開視窗到Yahoo奇摩股市的技術線圖頁
// 名稱: 一樣可以點開Yahoo，另外滑鼠移過去會彈出CMoney的K線圖裁切預覽（見頁尾script）
function stockLinkCells(type, stockId, stockName) {
  const yahoo = yahooUrl(type, stockId);
  const chart = cmoneyUrl(stockId);
  return `<td class="num"><a class="stock-link" href="${yahoo}" target="_blank" rel="noopener noreferrer">${esc(stockId)}</a></td><td class="name"><a class="stock-link chart-hover" href="${yahoo}" target="_blank" rel="noopener noreferrer" data-chart-url="${esc(chart)}">${esc(stockName)}</a></td>`;
}

function fmtDuration(seconds) {
  if (seconds < 60) return `${Math.ceil(seconds)} 秒`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `約 ${m} 分鐘`;
  return `約 ${h} 小時 ${m} 分鐘`;
}

function fmtNum(v) {
  if (v == null) return '—';
  return v.toLocaleString('en-US');
}

function pctClass(v) {
  if (v == null) return 'dash';
  if (v > 0) return 'pos';
  if (v < 0) return 'neg';
  return 'zero';
}

function fmtPct(v) {
  if (v == null) return '—';
  return (v > 0 ? '+' : '') + v.toFixed(2) + '%';
}

function fmtPct1(v) {
  if (v == null) return '—';
  return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
}

// r.volume_ratio 是倍數（例如1.35），畫面上換算成百分比顯示（+35.0%）
function volChangePct(r) {
  return r.volume_ratio != null ? +((r.volume_ratio - 1) * 100).toFixed(1) : null;
}

function extremeRows(list) {
  if (list.length === 0) return '<tr class="empty-row"><td colspan="9">目前還沒掃到符合的標的</td></tr>';
  return list
    .map((r) => {
      const cls = r.is_surge ? ' class="surge"' : '';
      return `<tr${cls}><td class="market">${marketLabel(r.type)}</td>${stockLinkCells(r.type, r.stock_id, r.stock_name)}<td class="num">${r.close_yday}</td><td class="num">${r.close}</td><td class="${pctClass(r.change_pct)}">${fmtPct(r.change_pct)}</td><td class="num">${fmtNum(r.volume_lots)}</td><td class="num">${fmtNum(r.volume_avg5_lots)}</td><td class="${pctClass(volChangePct(r))}">${fmtPct1(volChangePct(r))}</td></tr>`;
    })
    .join('\n');
}

function subtable(title, list) {
  return `<div class="subtable">
  <h3>${esc(title)}</h3>
  <div class="tablewrap">
    <table>
      <thead><tr><th>市場</th><th>代號</th><th>名稱</th><th>前日收盤</th><th>今日收盤</th><th>漲跌幅</th><th>今日成交量</th><th>5日均量</th><th>成交量漲幅</th></tr></thead>
      <tbody>
${extremeRows(list)}
      </tbody>
    </table>
  </div>
</div>`;
}

function extremeGroup(heading, priceExtremes, key) {
  const byPeriod = {};
  PERIODS.forEach((p) => (byPeriod[p] = []));
  priceExtremes.forEach((r) => {
    const period = r[key];
    if (period) byPeriod[period].push(r);
  });
  const tables = PERIODS.map((p) => subtable(`${p}新${key === 'highPeriod' ? '高' : '低'}`, byPeriod[p])).join('\n');
  return `<div class="group"><h2>${esc(heading)}</h2><p class="legend">5日均量 &ge; 100張 且 本日成交量 &gt; 1000張，只標最長符合區間</p><p class="legend">${SURGE_LEGEND}</p>${tables}</div>`;
}

// intervalMs: 每次 API 呼叫的節流間隔（跟 scan.js 用同一個值），用來估算剩餘時間
function renderProgressHTML(state, intervalMs) {
  const total = state.universe.length;
  const done = state.processedIds.length;
  const remaining = total - done;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const etaSeconds = (remaining * intervalMs) / 1000;

  const sortedCross = [...state.results]
    .filter((r) => r.volume_lots > 1000)
    .sort((a, b) => {
      const sa = ((a.ma5 - a.ma20) / a.ma20) * 100;
      const sb = ((b.ma5 - b.ma20) / b.ma20) * 100;
      return sb - sa;
    });

  const crossRows = sortedCross
    .map((r) => {
      const cls = r.is_surge ? ' class="surge"' : '';
      const strength = (((r.ma5 - r.ma20) / r.ma20) * 100).toFixed(2);
      return `<tr${cls}><td class="market">${marketLabel(r.type)}</td>${stockLinkCells(r.type, r.stock_id, r.stock_name)}<td class="num">${r.close_yday}</td><td class="num">${r.close}</td><td class="${pctClass(r.change_pct)}">${fmtPct(r.change_pct)}</td><td class="num">${fmtNum(r.volume_lots)}</td><td class="num">${fmtNum(r.volume_avg5_lots)}</td><td class="${pctClass(volChangePct(r))}">${fmtPct1(volChangePct(r))}</td><td class="num">+${strength}%</td></tr>`;
    })
    .join('\n');

  const priceExtremes = state.priceExtremes || [];

  return `<title>台股每日掃描 — 進行中</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="180">
<style>
:root {
  --paper: #F6F7F9; --paper-raised: #FFFFFF; --ink: #171B23; --muted: #5B6472; --faint: #E4E7EC;
  --accent: #2E3F6B; --accent-soft: #E8ECF5; --up: #B23A3A; --down: #2E7D5C;
  --surge: #97701E; --surge-soft: #FBF1DC; --surge-border: #D9B463;
}
@media (prefers-color-scheme: dark) {
  :root { --paper: #14171D; --paper-raised: #1C2028; --ink: #E9EBEF; --muted: #9198A6; --faint: #2B303B; --accent: #8FA3D6; --accent-soft: #232B42; --up: #E08585; --down: #7FCBA6;
    --surge: #E0BD6E; --surge-soft: #3A2F14; --surge-border: #7A5F27;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font-family: 'IBM Plex Sans', -apple-system, sans-serif; line-height: 1.5; }
.wrap { max-width: 960px; margin: 0 auto; padding: 2.5rem 1.5rem 4rem; }
.masthead h1 { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 26px; margin: 0 0 0.4rem; }
.sub { color: var(--muted); font-size: 13px; margin: 0 0 1.5rem; font-family: 'IBM Plex Mono', monospace; }
.badge { display: inline-block; background: var(--accent-soft); color: var(--accent); font-size: 12px; padding: 3px 10px; border-radius: 20px; font-family: 'IBM Plex Mono', monospace; margin-bottom: 0.9rem; }
.progress-track { background: var(--faint); border-radius: 8px; height: 10px; overflow: hidden; margin-bottom: 0.6rem; }
.progress-fill { background: var(--accent); height: 100%; }
.progress-label { display: flex; justify-content: space-between; font-size: 13px; color: var(--muted); font-family: 'IBM Plex Mono', monospace; margin-bottom: 1.75rem; }
.tabs { display: flex; gap: 4px; margin-bottom: 1.75rem; border-bottom: 1px solid var(--faint); }
.tab { font-size: 14px; font-weight: 500; color: var(--muted); background: none; border: none; padding: 10px 4px; margin-right: 1.5rem; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tab:hover { color: var(--ink); }
.tab:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.tab[aria-selected="true"] { color: var(--accent); border-bottom-color: var(--accent); }
.panel { display: none; }
.panel.active { display: block; }
.stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; background: var(--faint); border: 1px solid var(--faint); border-radius: 10px; overflow: hidden; margin-bottom: 1.75rem; }
.stat { background: var(--paper-raised); padding: 0.85rem 1rem; }
.stat .n { font-family: 'IBM Plex Mono', monospace; font-size: 19px; font-weight: 600; }
.stat .l { font-size: 12px; color: var(--muted); margin-top: 2px; }
.group { margin-bottom: 2rem; }
h2 { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 18px; margin: 0 0 0.8rem; }
.subtable { margin-bottom: 1.2rem; }
.subtable h3 { font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; font-weight: 500; color: var(--accent); background: var(--accent-soft); display: inline-block; padding: 3px 9px; border-radius: 5px; margin: 0 0 0.5rem; }
.tablewrap { overflow-x: auto; border: 1px solid var(--faint); border-radius: 10px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 700px; }
thead th { text-align: right; font-family: 'IBM Plex Mono', monospace; font-weight: 500; font-size: 10.5px; color: var(--muted); padding: 8px 11px; background: var(--paper-raised); border-bottom: 1px solid var(--faint); white-space: nowrap; }
thead th:first-child, thead th:nth-child(2), thead th:nth-child(3) { text-align: left; }
tbody td { padding: 7px 11px; text-align: right; border-top: 1px solid var(--faint); font-variant-numeric: tabular-nums; background: var(--paper-raised); }
tbody td:first-child, tbody td:nth-child(2), tbody td:nth-child(3) { text-align: left; }
tbody tr.surge td { background: var(--surge-soft); }
tbody tr.surge td:first-child { box-shadow: inset 3px 0 0 var(--surge-border); }
.name { font-weight: 500; }
.stock-link { color: inherit; text-decoration: none; border-bottom: 1px dotted var(--muted); }
.stock-link:hover { color: var(--accent); border-bottom-color: var(--accent); }
.chart-preview { position: fixed; z-index: 1000; width: 660px; height: 348px; border: 1px solid var(--faint); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.3); background: #fff; overflow: hidden; }
.chart-preview iframe { border: none; display: block; }
.market { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--muted); }
.num { font-family: 'IBM Plex Mono', monospace; }
.pos { color: var(--up); font-family: 'IBM Plex Mono', monospace; }
.neg { color: var(--down); font-family: 'IBM Plex Mono', monospace; }
.zero, .dash { color: var(--muted); font-family: 'IBM Plex Mono', monospace; }
.empty-row td { color: var(--muted); font-size: 12.5px; padding: 12px; text-align: center; }
.legend { font-size: 12px; color: var(--muted); margin: -0.4rem 0 0.9rem; }
.note { margin-top: 2rem; font-size: 12px; color: var(--muted); font-family: 'IBM Plex Mono', monospace; }
@media (max-width: 640px) {
  .wrap { padding: 1.5rem 1rem 3rem; }
  .tabs { overflow-x: auto; }
}
</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<div class="wrap">
  <header class="masthead">
    <span class="badge">● 掃描進行中</span>
    <h1>台股每日掃描</h1>
    <p class="sub">資料日期 ${esc(state.date)} · 頁面每 3 分鐘自動重新整理</p>
  </header>

  <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
  <div class="progress-label"><span>${done} / ${total} 檔（${pct}%）</span><span>預估剩餘 ${fmtDuration(etaSeconds)}</span></div>

  <div class="tabs" role="tablist">
    <button class="tab" role="tab" id="tab-cross" aria-selected="true" aria-controls="panel-cross" onclick="switchTab('cross')">黃金交叉（目前${state.results.length}檔）</button>
    <button class="tab" role="tab" id="tab-extreme" aria-selected="false" aria-controls="panel-extreme" onclick="switchTab('extreme')">創新高 / 創新低</button>
  </div>

  <div class="panel active" id="panel-cross" role="tabpanel" aria-labelledby="tab-cross">
    <div class="stats">
      <div class="stat"><div class="n">${done}</div><div class="l">已掃描</div></div>
      <div class="stat"><div class="n">${state.results.length}</div><div class="l">目前發現黃金交叉</div></div>
    </div>
    <p class="legend">本日成交量 &gt; 1000張才會顯示</p>
    <p class="legend">${SURGE_LEGEND}</p>
    <div class="tablewrap">
      <table>
        <thead><tr><th>市場</th><th>代號</th><th>名稱</th><th>前日收盤</th><th>今日收盤</th><th>漲跌幅</th><th>今日成交量</th><th>5日均量</th><th>成交量漲幅</th><th>幅度</th></tr></thead>
        <tbody>
${crossRows || '<tr class="empty-row"><td colspan="10">目前還沒掃到黃金交叉標的</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>

  <div class="panel" id="panel-extreme" role="tabpanel" aria-labelledby="tab-extreme">
${extremeGroup('創新高（目前為止）', priceExtremes, 'highPeriod')}
${extremeGroup('創新低（目前為止）', priceExtremes, 'lowPeriod')}
  </div>

  <p class="note">這是掃描過程中的即時進度頁，完成後會自動換成含 base 清單篩選與隔日驗證的完整報告。</p>
</div>
<script>
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', 'false'));
  document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
  document.getElementById('tab-' + name).setAttribute('aria-selected', 'true');
  document.getElementById('panel-' + name).classList.add('active');
}

// 滑鼠移到股票名稱上，延遲一下再彈出HiStock的K線圖預覽（避免滑過一堆列時瘋狂載入iframe）；
// 移開就整個拿掉iframe（不只是隱藏），確保沒在看的圖表不會繼續佔資源。
(function () {
  var previewEl = null;
  var hoverTimer = null;

  function hidePreview() {
    if (previewEl) {
      previewEl.remove();
      previewEl = null;
    }
  }

  // CMoney技術分析頁在瀏覽器寬度1280px時，K線區塊(圖例+OHLC資訊+K線+成交量)
  // 固定落在 left:232 top:513 寬1008 高532 這個位置（實測得出）。做法是把iframe
  // 設成1280寬去載入CMoney的頁面（讓它的版面跟實測時一致），再用CSS transform
  // 縮放+位移，只把這個區塊裁切顯示在小預覽框裡，上面的搜尋列、下面的其他內容
  // 都被裁掉看不到。這是用固定座標對齊別人網站版面，CMoney以後改版有機會跑掉。
  var CROP = { sourceW: 1280, sourceH: 1080, left: 232, top: 513, w: 1008, h: 532 };
  var PREVIEW_W = 660, PREVIEW_H = 348;
  var SCALE = PREVIEW_W / CROP.w;

  function showPreview(target, url) {
    hidePreview();
    previewEl = document.createElement('div');
    previewEl.className = 'chart-preview';

    var iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.loading = 'lazy';
    iframe.style.width = CROP.sourceW + 'px';
    iframe.style.height = CROP.sourceH + 'px';
    iframe.style.position = 'absolute';
    iframe.style.left = -Math.round(CROP.left * SCALE) + 'px';
    iframe.style.top = -Math.round(CROP.top * SCALE) + 'px';
    iframe.style.transform = 'scale(' + SCALE + ')';
    iframe.style.transformOrigin = '0 0';

    previewEl.appendChild(iframe);
    document.body.appendChild(previewEl);

    var rect = target.getBoundingClientRect();
    var left = Math.min(rect.left, window.innerWidth - PREVIEW_W - 8);
    var top = rect.bottom + 6;
    if (top + PREVIEW_H > window.innerHeight) top = rect.top - PREVIEW_H - 6;
    previewEl.style.left = Math.max(8, left) + 'px';
    previewEl.style.top = Math.max(8, top) + 'px';
  }

  document.querySelectorAll('.chart-hover').forEach(function (el) {
    el.addEventListener('mouseenter', function () {
      clearTimeout(hoverTimer);
      var url = el.getAttribute('data-chart-url');
      hoverTimer = setTimeout(function () {
        showPreview(el, url);
      }, 250);
    });
    el.addEventListener('mouseleave', function () {
      clearTimeout(hoverTimer);
      hidePreview();
    });
  });
})();
</script>
`;
}

module.exports = { renderProgressHTML };
