// 把 report 物件轉成 index.html 的內容，格式已經跟使用者確認過（preview.html 是核准版本）。
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

function fmtNum(v, decimals) {
  if (v == null) return '—';
  return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function marketLabel(type) {
  return type === 'twse' ? '上市' : type === 'tpex' ? '上櫃' : type;
}

function baseListRows(baseList) {
  return baseList
    .map((r) => {
      const cls = r.is_surge ? ' class="surge"' : '';
      return `<tr${cls}><td class="market">${marketLabel(r.type)}</td><td class="num">${esc(r.stock_id)}</td><td class="name">${esc(r.stock_name)}</td><td class="num">${fmtNum(r.close, 2)}</td><td class="${pctClass(r.change_pct)}">${fmtPct(r.change_pct)}</td><td class="num">${fmtNum(r.volume_lots, 0)}</td><td class="num">${fmtPct(r.strength)}</td></tr>`;
    })
    .join('\n');
}

function validationRows(results) {
  return results
    .map((r) => {
      const cls = r.is_surge ? ' class="surge"' : '';
      const badge = r.is_surge ? '<span class="badge">量增</span>' : '<span class="dash">—</span>';
      return `<tr${cls}><td class="market">${marketLabel(r.type)}</td><td class="num">${esc(r.stock_id)}</td><td class="name">${esc(r.stock_name)}</td><td class="num">${fmtNum(r.signal_close, 2)}</td><td class="num">${fmtNum(r.today_close, 2)}</td><td class="${pctClass(r.forward_return_pct)}">${fmtPct(r.forward_return_pct)}</td><td>${badge}</td></tr>`;
    })
    .join('\n');
}

function renderHTML(report) {
  const surgeCount = report.base_list.filter((r) => r.is_surge).length;
  const hasValidation = report.validation_of_previous_signals.count > 0;
  const validationDate = report.validation_of_previous_signals.based_on_date;

  const validationSection = hasValidation
    ? `
  <section>
    <div class="section-head">
      <h2>前一交易日訊號驗證</h2>
      <p>${esc(validationDate)} base 清單全部標的，對照 ${esc(report.date)} 收盤的隔日報酬</p>
    </div>
    <div class="legend">
      <span><span class="badge">量增</span>該標的當時被標記為量增</span>
    </div>
    <div class="tablewrap">
      <table>
        <thead><tr><th>市場</th><th>代號</th><th>名稱</th><th>訊號日收盤</th><th>今收盤</th><th>隔日報酬</th><th>標記</th></tr></thead>
        <tbody>
${validationRows(report.validation_of_previous_signals.results)}
        </tbody>
      </table>
    </div>
  </section>`
    : `
  <section>
    <div class="section-head">
      <h2>前一交易日訊號驗證</h2>
      <p>無前一交易日存檔資料</p>
    </div>
    <p style="color:var(--muted);font-size:13px;">找不到前一個交易日的報告存檔（可能是第一次執行，或該日 base 清單為空），明天開始會自動累積。</p>
  </section>`;

  return `<title>台股黃金交叉每日掃描 — ${esc(report.date)}</title>
<style>
:root {
  --paper: #F6F7F9; --paper-raised: #FFFFFF; --ink: #171B23; --muted: #5B6472; --faint: #E4E7EC;
  --accent: #2E3F6B; --accent-soft: #E8ECF5;
  --up: #B23A3A; --up-soft: #F7E9E9; --down: #2E7D5C; --down-soft: #E8F2ED;
  --surge: #97701E; --surge-soft: #FBF1DC; --surge-border: #D9B463;
}
:root[data-theme="dark"] {
  --paper: #14171D; --paper-raised: #1C2028; --ink: #E9EBEF; --muted: #9198A6; --faint: #2B303B;
  --accent: #8FA3D6; --accent-soft: #232B42;
  --up: #E08585; --up-soft: #3A2222; --down: #7FCBA6; --down-soft: #1F3229;
  --surge: #E0BD6E; --surge-soft: #3A2F14; --surge-border: #7A5F27;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper: #14171D; --paper-raised: #1C2028; --ink: #E9EBEF; --muted: #9198A6; --faint: #2B303B;
    --accent: #8FA3D6; --accent-soft: #232B42;
    --up: #E08585; --up-soft: #3A2222; --down: #7FCBA6; --down-soft: #1F3229;
    --surge: #E0BD6E; --surge-soft: #3A2F14; --surge-border: #7A5F27;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font-family: 'IBM Plex Sans', -apple-system, sans-serif; line-height: 1.5; }
.wrap { max-width: 880px; margin: 0 auto; padding: 2.5rem 1.5rem 4rem; }
.masthead { border-bottom: 2px solid var(--ink); padding-bottom: 1.1rem; margin-bottom: 1.75rem; }
.masthead .kicker { font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin: 0 0 0.35rem; }
.masthead h1 { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 30px; letter-spacing: -0.01em; margin: 0 0 0.3rem; text-wrap: balance; }
.masthead .sub { color: var(--muted); font-size: 14px; margin: 0; }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--faint); border: 1px solid var(--faint); border-radius: 10px; overflow: hidden; margin-bottom: 2.25rem; }
.stat { background: var(--paper-raised); padding: 0.9rem 1rem; }
.stat .n { font-family: 'IBM Plex Mono', monospace; font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
.stat .l { font-size: 12px; color: var(--muted); margin-top: 2px; }
section { margin-bottom: 2.75rem; }
.section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin-bottom: 0.9rem; border-bottom: 1px solid var(--faint); padding-bottom: 0.6rem; }
.section-head h2 { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 19px; margin: 0; }
.section-head p { margin: 0; font-size: 13px; color: var(--muted); max-width: 32ch; text-align: right; }
.legend { display: flex; gap: 1.1rem; font-size: 12px; color: var(--muted); margin-bottom: 0.75rem; flex-wrap: wrap; }
.tablewrap { overflow-x: auto; border: 1px solid var(--faint); border-radius: 10px; }
table { width: 100%; border-collapse: collapse; font-size: 13.5px; min-width: 640px; }
thead th { text-align: right; font-family: 'IBM Plex Mono', monospace; font-weight: 500; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); padding: 10px 12px; background: var(--accent-soft); white-space: nowrap; }
thead th:first-child, thead th:nth-child(2), thead th:nth-child(3) { text-align: left; }
tbody td { padding: 9px 12px; text-align: right; border-top: 1px solid var(--faint); font-variant-numeric: tabular-nums; white-space: nowrap; }
tbody td:first-child, tbody td:nth-child(2), tbody td:nth-child(3) { text-align: left; font-variant-numeric: normal; }
tbody tr.surge td { background: var(--surge-soft); }
tbody tr.surge td:first-child { box-shadow: inset 3px 0 0 var(--surge-border); }
.name { font-weight: 500; }
.market { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--muted); }
.num { font-family: 'IBM Plex Mono', monospace; }
.pos { color: var(--up); font-family: 'IBM Plex Mono', monospace; }
.neg { color: var(--down); font-family: 'IBM Plex Mono', monospace; }
.zero { color: var(--muted); font-family: 'IBM Plex Mono', monospace; }
.badge { display: inline-block; font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; padding: 2px 6px; border-radius: 4px; background: var(--surge-soft); color: var(--surge); border: 1px solid var(--surge-border); }
.dash { color: var(--muted); }
.note { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--faint); font-size: 12px; color: var(--muted); font-family: 'IBM Plex Mono', monospace; }
@media (max-width: 640px) {
  .wrap { padding: 1.5rem 1rem 3rem; }
  .masthead h1 { font-size: 24px; }
  .stats { grid-template-columns: repeat(2, 1fr); }
  .stat .n { font-size: 19px; }
  .section-head { flex-direction: column; align-items: flex-start; gap: 0.3rem; }
  .section-head p { text-align: left; max-width: none; }
  table { font-size: 12.5px; }
  thead th, tbody td { padding: 7px 9px; }
}
</style>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<div class="wrap">
  <header class="masthead">
    <p class="kicker">TW Golden Cross Scanner</p>
    <h1>台股 MA5/MA20 黃金交叉日報</h1>
    <p class="sub">資料日期 ${esc(report.date)}${hasValidation ? `／驗證對照前一交易日 ${esc(validationDate)}` : ''}</p>
  </header>
  <div class="stats">
    <div class="stat"><div class="n">${fmtNum(report.total_scanned, 0)}</div><div class="l">全市場掃描檔數</div></div>
    <div class="stat"><div class="n">${fmtNum(report.total_golden_cross, 0)}</div><div class="l">黃金交叉檔數</div></div>
    <div class="stat"><div class="n">${fmtNum(report.base_list.length, 0)}</div><div class="l">base 清單（量&gt;1000張）</div></div>
    <div class="stat"><div class="n">${fmtNum(surgeCount, 0)}</div><div class="l">量增 highlight</div></div>
  </div>
  <section>
    <div class="section-head">
      <h2>今日訊號 — base 清單</h2>
      <p>成交量 &gt; 1000 張，依當日漲跌幅排序</p>
    </div>
    <div class="legend">
      <span><span class="badge" style="background:var(--surge-soft)">&nbsp;</span>&nbsp;量增 &gt; 前5日均量 1.3倍</span>
    </div>
    <div class="tablewrap">
      <table>
        <thead><tr><th>市場</th><th>代號</th><th>名稱</th><th>收盤</th><th>漲跌幅</th><th>成交量(張)</th><th>幅度</th></tr></thead>
        <tbody>
${baseListRows(report.base_list)}
        </tbody>
      </table>
    </div>
  </section>
  ${validationSection}
  <section>
    <div class="section-head">
      <h2>完整清單 — 全部黃金交叉標的</h2>
      <p>不限成交量，依 MA5 超越 MA20 幅度排序，共 ${fmtNum(report.all_results.length, 0)} 檔</p>
    </div>
    <div class="legend">
      <span><span class="badge" style="background:var(--surge-soft)">&nbsp;</span>&nbsp;量增 &gt; 前5日均量 1.3倍</span>
    </div>
    <div class="tablewrap">
      <table>
        <thead><tr><th>市場</th><th>代號</th><th>名稱</th><th>收盤</th><th>漲跌幅</th><th>成交量(張)</th><th>幅度</th></tr></thead>
        <tbody>
${baseListRows(report.all_results)}
        </tbody>
      </table>
    </div>
  </section>
  <p class="note">tw-golden-cross-scanner · 自動產生於雲端 routine · 最後更新 ${esc(report.date)} · 資料來源 FinMind</p>
</div>
`;
}

module.exports = { renderHTML };
