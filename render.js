// 把 report 物件轉成 index.html 的內容，格式已經跟使用者確認過。
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

// r.volume_ratio 是倍數（例如1.35），畫面上換算成百分比顯示（+35.0%）
function volChangePct(r) {
  return r.volume_ratio != null ? +((r.volume_ratio - 1) * 100).toFixed(1) : null;
}

function fmtPct1(v) {
  if (v == null) return '—';
  return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
}

function baseListRows(baseList) {
  return baseList
    .map((r) => {
      const cls = r.is_surge ? ' class="surge"' : '';
      return `<tr${cls}><td class="market">${marketLabel(r.type)}</td>${stockLinkCells(r.type, r.stock_id, r.stock_name)}<td class="num">${fmtNum(r.close_yday, 2)}</td><td class="num">${fmtNum(r.close, 2)}</td><td class="${pctClass(r.change_pct)}">${fmtPct(r.change_pct)}</td><td class="num">${fmtNum(r.volume_lots, 0)}</td><td class="num">${fmtNum(r.volume_avg5_lots, 0)}</td><td class="${pctClass(volChangePct(r))}">${fmtPct1(volChangePct(r))}</td><td class="num">${fmtPct(r.strength)}</td></tr>`;
    })
    .join('\n');
}

function validationRows(results) {
  return results
    .map((r) => {
      const cls = r.is_surge ? ' class="surge"' : '';
      const badge = r.is_surge ? '<span class="badge">量增</span>' : '<span class="dash">—</span>';
      return `<tr${cls}><td class="market">${marketLabel(r.type)}</td>${stockLinkCells(r.type, r.stock_id, r.stock_name)}<td class="num">${fmtNum(r.signal_close, 2)}</td><td class="num">${fmtNum(r.today_close, 2)}</td><td class="${pctClass(r.forward_return_pct)}">${fmtPct(r.forward_return_pct)}</td><td>${badge}</td></tr>`;
    })
    .join('\n');
}

function priceExtremeValidationRows(results) {
  return results
    .map((r) => {
      const cls = r.is_surge ? ' class="surge"' : '';
      const badge = r.is_surge ? '<span class="badge">量增</span>' : '<span class="dash">—</span>';
      return `<tr${cls}><td class="market">${marketLabel(r.type)}</td>${stockLinkCells(r.type, r.stock_id, r.stock_name)}<td>${esc(r.signal_type)}</td><td class="num">${fmtNum(r.signal_close, 2)}</td><td class="num">${fmtNum(r.today_close, 2)}</td><td class="${pctClass(r.forward_return_pct)}">${fmtPct(r.forward_return_pct)}</td><td>${badge}</td></tr>`;
    })
    .join('\n');
}

function breakoutRows(list) {
  if (list.length === 0) return '<tr class="empty-row"><td colspan="11">今天沒有符合的標的</td></tr>';
  return list
    .map((r) => {
      return `<tr><td class="market">${marketLabel(r.type)}</td>${stockLinkCells(r.type, r.stock_id, r.stock_name)}<td class="num">${fmtNum(r.close_yday, 2)}</td><td class="num">${fmtNum(r.close, 2)}</td><td class="${pctClass(r.change_pct)}">${fmtPct(r.change_pct)}</td><td class="num">${fmtNum(r.volume_lots, 0)}</td><td class="num">${fmtNum(r.volume_avg5_lots, 0)}</td><td class="${pctClass(volChangePct(r))}">${fmtPct1(volChangePct(r))}</td><td class="num">${fmtNum(r.consolidation_high, 2)}</td><td class="${pctClass(r.breakout_pct)}">${fmtPct(r.breakout_pct)}</td></tr>`;
    })
    .join('\n');
}

function breakoutValidationRows(results) {
  return results
    .map((r) => {
      return `<tr><td class="market">${marketLabel(r.type)}</td>${stockLinkCells(r.type, r.stock_id, r.stock_name)}<td class="num">${fmtNum(r.signal_close, 2)}</td><td class="num">${fmtNum(r.today_close, 2)}</td><td class="${pctClass(r.forward_return_pct)}">${fmtPct(r.forward_return_pct)}</td></tr>`;
    })
    .join('\n');
}

const PERIODS = ['12個月', '6個月', '3個月', '1個月'];

function extremeRows(list) {
  if (list.length === 0) return '<tr class="empty-row"><td colspan="9">今天沒有符合的標的</td></tr>';
  return list
    .map((r) => {
      const cls = r.is_surge ? ' class="surge"' : '';
      return `<tr${cls}><td class="market">${marketLabel(r.type)}</td>${stockLinkCells(r.type, r.stock_id, r.stock_name)}<td class="num">${fmtNum(r.close_yday, 2)}</td><td class="num">${fmtNum(r.close, 2)}</td><td class="${pctClass(r.change_pct)}">${fmtPct(r.change_pct)}</td><td class="num">${fmtNum(r.volume_lots, 0)}</td><td class="num">${fmtNum(r.volume_avg5_lots, 0)}</td><td class="${pctClass(volChangePct(r))}">${fmtPct1(volChangePct(r))}</td></tr>`;
    })
    .join('\n');
}

function extremeSubtable(title, list) {
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

function extremeGroup(heading, note, priceExtremes, key, dirLabel) {
  const byPeriod = {};
  PERIODS.forEach((p) => (byPeriod[p] = []));
  priceExtremes.forEach((r) => {
    const period = r[key];
    if (period) byPeriod[period].push(r);
  });
  const tables = PERIODS.map((p) => extremeSubtable(`${p}新${dirLabel}`, byPeriod[p])).join('\n');
  return `<div class="group">
    <div class="group-head">
      <h2>${esc(heading)}</h2>
      <p>${esc(note)}</p>
    </div>
    <div class="legend">
      <span><span class="badge" style="background:var(--surge-soft)">&nbsp;</span>&nbsp;量增 &gt; 前5日均量 1.3倍</span>
    </div>
${tables}
  </div>`;
}

function renderHTML(report) {
  const surgeCount = report.base_list.filter((r) => r.is_surge).length;
  const hasValidation = report.validation_of_previous_signals.count > 0;
  const validationDate = report.validation_of_previous_signals.based_on_date;
  const priceExtremes = report.price_extremes || [];

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

  const priceExtremeValidation = report.price_extreme_validation || { count: 0, based_on_date: null, results: [] };
  const hasPriceExtremeValidation = priceExtremeValidation.count > 0;

  const priceExtremeValidationSection = hasPriceExtremeValidation
    ? `
  <section>
    <div class="section-head">
      <h2>前一交易日創新高/創新低驗證</h2>
      <p>${esc(priceExtremeValidation.based_on_date)} 創新高/創新低全部標的，對照 ${esc(report.date)} 收盤的隔日報酬</p>
    </div>
    <div class="legend">
      <span><span class="badge">量增</span>該標的當時被標記為量增</span>
    </div>
    <div class="tablewrap">
      <table>
        <thead><tr><th>市場</th><th>代號</th><th>名稱</th><th>訊號類型</th><th>訊號日收盤</th><th>今收盤</th><th>隔日報酬</th><th>標記</th></tr></thead>
        <tbody>
${priceExtremeValidationRows(priceExtremeValidation.results)}
        </tbody>
      </table>
    </div>
  </section>`
    : `
  <section>
    <div class="section-head">
      <h2>前一交易日創新高/創新低驗證</h2>
      <p>無前一交易日存檔資料</p>
    </div>
    <p style="color:var(--muted);font-size:13px;">找不到前一個交易日的報告存檔（可能是第一次執行，或該日創新高/創新低清單為空），明天開始會自動累積。</p>
  </section>`;

  const breakoutValidation = report.breakout_validation || { count: 0, based_on_date: null, results: [] };
  const hasBreakoutValidation = breakoutValidation.count > 0;

  const breakoutValidationSection = hasBreakoutValidation
    ? `
  <section>
    <div class="section-head">
      <h2>前一交易日突破盤整驗證</h2>
      <p>${esc(breakoutValidation.based_on_date)} 突破盤整全部標的，對照 ${esc(report.date)} 收盤的隔日報酬</p>
    </div>
    <div class="tablewrap">
      <table>
        <thead><tr><th>市場</th><th>代號</th><th>名稱</th><th>訊號日收盤</th><th>今收盤</th><th>隔日報酬</th></tr></thead>
        <tbody>
${breakoutValidationRows(breakoutValidation.results)}
        </tbody>
      </table>
    </div>
  </section>`
    : `
  <section>
    <div class="section-head">
      <h2>前一交易日突破盤整驗證</h2>
      <p>無前一交易日存檔資料</p>
    </div>
    <p style="color:var(--muted);font-size:13px;">找不到前一個交易日的報告存檔（可能是第一次執行，或該日突破盤整清單為空），明天開始會自動累積。</p>
  </section>`;

  return `<title>台股每日掃描 — ${esc(report.date)}</title>
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
.masthead { border-bottom: 2px solid var(--ink); padding-bottom: 1.1rem; margin-bottom: 1.25rem; }
.masthead .kicker { font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin: 0 0 0.35rem; }
.masthead h1 { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 30px; letter-spacing: -0.01em; margin: 0 0 0.3rem; text-wrap: balance; }
.masthead .sub { color: var(--muted); font-size: 14px; margin: 0; }

.tabs { display: flex; gap: 4px; margin-bottom: 2rem; border-bottom: 1px solid var(--faint); }
.tab { font-size: 14px; font-weight: 500; color: var(--muted); background: none; border: none; padding: 10px 4px; margin-right: 1.5rem; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tab:hover { color: var(--ink); }
.tab:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.tab[aria-selected="true"] { color: var(--accent); border-bottom-color: var(--accent); }
.panel { display: none; }
.panel.active { display: block; }

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
table { width: 100%; border-collapse: collapse; font-size: 13.5px; min-width: 480px; }
thead th { text-align: right; font-family: 'IBM Plex Mono', monospace; font-weight: 500; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); padding: 10px 12px; background: var(--accent-soft); white-space: nowrap; }
thead th:first-child, thead th:nth-child(2), thead th:nth-child(3) { text-align: left; }
tbody td { padding: 9px 12px; text-align: right; border-top: 1px solid var(--faint); font-variant-numeric: tabular-nums; white-space: nowrap; }
tbody td:first-child, tbody td:nth-child(2), tbody td:nth-child(3) { text-align: left; font-variant-numeric: normal; }
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
.zero { color: var(--muted); font-family: 'IBM Plex Mono', monospace; }
.badge { display: inline-block; font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; padding: 2px 6px; border-radius: 4px; background: var(--surge-soft); color: var(--surge); border: 1px solid var(--surge-border); }
.dash { color: var(--muted); }
.note { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--faint); font-size: 12px; color: var(--muted); font-family: 'IBM Plex Mono', monospace; }

.group { margin-bottom: 2.75rem; }
.group-head { margin-bottom: 1rem; }
.group-head h2 { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 20px; margin: 0 0 0.2rem; }
.group-head p { margin: 0; font-size: 13px; color: var(--muted); }
.subtable { margin-bottom: 1.4rem; }
.subtable h3 { font-family: 'IBM Plex Mono', monospace; font-size: 12px; font-weight: 500; letter-spacing: 0.03em; color: var(--accent); background: var(--accent-soft); display: inline-block; padding: 3px 10px; border-radius: 5px; margin: 0 0 0.6rem; }
.empty-row td { color: var(--muted); font-size: 13px; padding: 14px; text-align: center; }

@media (max-width: 640px) {
  .wrap { padding: 1.5rem 1rem 3rem; }
  .masthead h1 { font-size: 24px; }
  .stats { grid-template-columns: repeat(2, 1fr); }
  .stat .n { font-size: 19px; }
  .section-head { flex-direction: column; align-items: flex-start; gap: 0.3rem; }
  .section-head p { text-align: left; max-width: none; }
  table { font-size: 12.5px; }
  thead th, tbody td { padding: 7px 9px; }
  .tabs { overflow-x: auto; }
}
</style>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<div class="wrap">
  <header class="masthead">
    <p class="kicker">TW Daily Scanner</p>
    <h1>台股每日掃描</h1>
    <p class="sub">資料日期 ${esc(report.date)}${hasValidation ? `／驗證對照前一交易日 ${esc(validationDate)}` : ''}${report.generated_at ? `／執行完成 ${esc(report.generated_at)}` : ''}</p>
  </header>

  <div class="tabs" role="tablist">
    <button class="tab" role="tab" id="tab-cross" aria-selected="true" aria-controls="panel-cross" onclick="switchTab('cross')">黃金交叉</button>
    <button class="tab" role="tab" id="tab-extreme" aria-selected="false" aria-controls="panel-extreme" onclick="switchTab('extreme')">創新高 / 創新低</button>
    <button class="tab" role="tab" id="tab-breakout" aria-selected="false" aria-controls="panel-breakout" onclick="switchTab('breakout')">突破盤整</button>
  </div>

  <div class="panel active" id="panel-cross" role="tabpanel" aria-labelledby="tab-cross">
    <div class="stats">
      <div class="stat"><div class="n">${fmtNum(report.total_scanned, 0)}</div><div class="l">全市場掃描檔數</div></div>
      <div class="stat"><div class="n">${fmtNum(report.total_golden_cross, 0)}</div><div class="l">黃金交叉檔數</div></div>
      <div class="stat"><div class="n">${fmtNum(report.base_list.length, 0)}</div><div class="l">base 清單</div></div>
      <div class="stat"><div class="n">${fmtNum(surgeCount, 0)}</div><div class="l">量增 highlight</div></div>
    </div>
    <section>
      <div class="section-head">
        <h2>今日訊號 — base 清單</h2>
        <p>成交量 &gt; 1000 張 且 5日均量 &ge; 100張，依當日漲跌幅排序</p>
      </div>
      <div class="legend">
        <span><span class="badge" style="background:var(--surge-soft)">&nbsp;</span>&nbsp;量增 &gt; 前5日均量 1.3倍</span>
      </div>
      <div class="tablewrap">
        <table>
          <thead><tr><th>市場</th><th>代號</th><th>名稱</th><th>前日收盤</th><th>今日收盤</th><th>漲跌幅</th><th>今日成交量</th><th>5日均量</th><th>成交量漲幅</th><th>幅度</th></tr></thead>
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
        <p>本日成交量 &gt; 1000張，依 MA5 超越 MA20 幅度排序，共 ${fmtNum(report.all_results.length, 0)} 檔</p>
      </div>
      <div class="legend">
        <span><span class="badge" style="background:var(--surge-soft)">&nbsp;</span>&nbsp;量增 &gt; 前5日均量 1.3倍</span>
      </div>
      <div class="tablewrap">
        <table>
          <thead><tr><th>市場</th><th>代號</th><th>名稱</th><th>前日收盤</th><th>今日收盤</th><th>漲跌幅</th><th>今日成交量</th><th>5日均量</th><th>成交量漲幅</th><th>幅度</th></tr></thead>
          <tbody>
${baseListRows(report.all_results)}
          </tbody>
        </table>
      </div>
    </section>
  </div>

  <div class="panel" id="panel-extreme" role="tabpanel" aria-labelledby="tab-extreme">
${extremeGroup('創新高', '今日收盤價創各區間新高，5日均量 ≥ 100張 且 本日成交量 > 1000張，只標最長符合區間', priceExtremes, 'highPeriod', '高')}
${extremeGroup('創新低', '今日收盤價創各區間新低，5日均量 ≥ 100張 且 本日成交量 > 1000張，只標最長符合區間', priceExtremes, 'lowPeriod', '低')}
    ${priceExtremeValidationSection}
  </div>

  <div class="panel" id="panel-breakout" role="tabpanel" aria-labelledby="tab-breakout">
    <section>
      <div class="section-head">
        <h2>今日訊號 — 突破盤整</h2>
        <p>前20個交易日收盤高低差 &le; 10%，今日收盤站上盤整高點 &ge; 3%，且量增 &gt; 前5日均量 1.3倍</p>
      </div>
      <div class="tablewrap">
        <table>
          <thead><tr><th>市場</th><th>代號</th><th>名稱</th><th>前日收盤</th><th>今日收盤</th><th>漲跌幅</th><th>今日成交量</th><th>5日均量</th><th>成交量漲幅</th><th>盤整期間最高</th><th>突破幅度</th></tr></thead>
          <tbody>
${breakoutRows(report.breakouts || [])}
          </tbody>
        </table>
      </div>
    </section>
    ${breakoutValidationSection}
  </div>

  <p class="note">tw-golden-cross-scanner · 自動產生 · 最後更新 ${esc(report.date)} · 資料來源 FinMind</p>
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

module.exports = { renderHTML };
