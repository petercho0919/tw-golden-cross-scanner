// 掃描進行中的網頁版本 — scan.js 每次 checkpoint 都會呼叫這個，讓網頁在掃描完成前
// 也能看到目前進度、預估剩餘時間、以及目前已經找到的黃金交叉（尚未經過成交量/驗證補查）。

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function marketLabel(type) {
  return type === 'twse' ? '上市' : type === 'tpex' ? '上櫃' : type;
}

function fmtDuration(seconds) {
  if (seconds < 60) return `${Math.ceil(seconds)} 秒`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `約 ${m} 分鐘`;
  return `約 ${h} 小時 ${m} 分鐘`;
}

// intervalMs: 每次 API 呼叫的節流間隔（跟 scan.js 用同一個值），用來估算剩餘時間
function renderProgressHTML(state, intervalMs) {
  const total = state.universe.length;
  const done = state.processedIds.length;
  const remaining = total - done;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const etaSeconds = (remaining * intervalMs) / 1000;

  const sorted = [...state.results].sort((a, b) => {
    const sa = ((a.ma5 - a.ma20) / a.ma20) * 100;
    const sb = ((b.ma5 - b.ma20) / b.ma20) * 100;
    return sb - sa;
  });

  const rows = sorted
    .map((r) => {
      const strength = (((r.ma5 - r.ma20) / r.ma20) * 100).toFixed(2);
      return `<tr><td class="market">${marketLabel(r.type)}</td><td class="num">${esc(r.stock_id)}</td><td class="name">${esc(r.stock_name)}</td><td class="num">${r.close}</td><td class="num">+${strength}%</td></tr>`;
    })
    .join('\n');

  return `<title>台股黃金交叉每日掃描 — 進行中</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="180">
<style>
:root { --paper: #F6F7F9; --paper-raised: #FFFFFF; --ink: #171B23; --muted: #5B6472; --faint: #E4E7EC; --accent: #2E3F6B; --accent-soft: #E8ECF5; --up: #B23A3A; }
@media (prefers-color-scheme: dark) {
  :root { --paper: #14171D; --paper-raised: #1C2028; --ink: #E9EBEF; --muted: #9198A6; --faint: #2B303B; --accent: #8FA3D6; --accent-soft: #232B42; --up: #E08585; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font-family: 'IBM Plex Sans', -apple-system, sans-serif; line-height: 1.5; }
.wrap { max-width: 640px; margin: 0 auto; padding: 2.5rem 1.5rem 4rem; }
h1 { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 24px; margin: 0 0 0.4rem; }
.sub { color: var(--muted); font-size: 13px; margin: 0 0 1.75rem; font-family: 'IBM Plex Mono', monospace; }
.badge { display: inline-block; background: var(--accent-soft); color: var(--accent); font-size: 12px; padding: 3px 10px; border-radius: 20px; font-family: 'IBM Plex Mono', monospace; margin-bottom: 1rem; }
.progress-track { background: var(--faint); border-radius: 8px; height: 10px; overflow: hidden; margin-bottom: 0.6rem; }
.progress-fill { background: var(--accent); height: 100%; }
.progress-label { display: flex; justify-content: space-between; font-size: 13px; color: var(--muted); font-family: 'IBM Plex Mono', monospace; margin-bottom: 2rem; }
.stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; background: var(--faint); border: 1px solid var(--faint); border-radius: 10px; overflow: hidden; margin-bottom: 2rem; }
.stat { background: var(--paper-raised); padding: 0.9rem 1rem; }
.stat .n { font-family: 'IBM Plex Mono', monospace; font-size: 20px; font-weight: 600; }
.stat .l { font-size: 12px; color: var(--muted); margin-top: 2px; }
h2 { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 17px; border-bottom: 1px solid var(--faint); padding-bottom: 0.6rem; margin: 0 0 0.9rem; }
.tablewrap { overflow-x: auto; border: 1px solid var(--faint); border-radius: 10px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 420px; }
thead th { text-align: right; font-family: 'IBM Plex Mono', monospace; font-weight: 500; font-size: 11px; color: var(--muted); padding: 8px 10px; background: var(--accent-soft); }
thead th:first-child, thead th:nth-child(2), thead th:nth-child(3) { text-align: left; }
tbody td { padding: 7px 10px; text-align: right; border-top: 1px solid var(--faint); font-variant-numeric: tabular-nums; }
tbody td:first-child, tbody td:nth-child(2), tbody td:nth-child(3) { text-align: left; }
.name { font-weight: 500; }
.market { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--muted); }
.num { font-family: 'IBM Plex Mono', monospace; color: var(--up); }
.empty { color: var(--muted); font-size: 13px; padding: 1.5rem; text-align: center; }
.note { margin-top: 2rem; font-size: 12px; color: var(--muted); font-family: 'IBM Plex Mono', monospace; }
</style>
<div class="wrap">
  <span class="badge">● 掃描進行中</span>
  <h1>台股 MA5/MA20 黃金交叉日報</h1>
  <p class="sub">資料日期 ${esc(state.date)} · 頁面每 3 分鐘自動重新整理</p>

  <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
  <div class="progress-label"><span>${done} / ${total} 檔（${pct}%）</span><span>預估剩餘 ${fmtDuration(etaSeconds)}</span></div>

  <div class="stats">
    <div class="stat"><div class="n">${done}</div><div class="l">已掃描</div></div>
    <div class="stat"><div class="n">${state.results.length}</div><div class="l">目前發現黃金交叉</div></div>
  </div>

  <h2>目前為止的黃金交叉（依幅度排序，尚未補查成交量）</h2>
  <div class="tablewrap">
    <table>
      <thead><tr><th>市場</th><th>代號</th><th>名稱</th><th>收盤</th><th>幅度</th></tr></thead>
      <tbody>
${rows || '<tr><td colspan="5" class="empty">目前還沒掃到黃金交叉標的</td></tr>'}
      </tbody>
    </table>
  </div>

  <p class="note">這是掃描過程中的即時進度頁，完成後會自動換成含成交量篩選與隔日驗證的完整報告。</p>
</div>
`;
}

module.exports = { renderProgressHTML };
