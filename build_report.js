// 在 scan.js 印出 STATUS: COMPLETE 之後執行，用 scan.js 已經算好的資料整理出 base 清單，
// 並驗證前一交易日的訊號在今天的表現，產生最終報告與網頁。
// 用法: FINMIND_TOKEN=xxx node build_report.js
// 完成後印出 "STATUS: REPORT_READY"，結果寫進 reports/YYYY-MM-DD.json（存檔）、
// report.json（最新版原始資料）、index.html（GitHub Pages 呈現用的網頁，最新版）。

const fs = require('fs');
const path = require('path');
const { renderHTML } = require('./render');

const TOKEN = process.env.FINMIND_TOKEN;
if (!TOKEN) {
  console.error('請先設定環境變數 FINMIND_TOKEN');
  process.exit(1);
}

const STATE_FILE = path.join(__dirname, 'state.json');
const REPORT_FILE = path.join(__dirname, 'report.json'); // 永遠指向「最新一天」的報告
const REPORTS_DIR = path.join(__dirname, 'reports'); // 依日期存檔，供之後驗證用
const HTML_FILE = path.join(__dirname, 'index.html'); // GitHub Pages 首頁，永遠是最新一天
const INTERVAL_MS = 200;
const VOLUME_THRESHOLD_LOTS = 1000;
const MIN_AVG5_VOLUME_LOTS = 100; // 跟 scan.js 的創新高/創新低篩選共用同一個門檻

// 找出今天以前，最近一份存檔的報告（也就是「前一個交易日」的報告）
function findPreviousReport(todayDateStr) {
  if (!fs.existsSync(REPORTS_DIR)) return null;
  const dates = fs
    .readdirSync(REPORTS_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace('.json', ''))
    .filter((d) => d < todayDateStr)
    .sort()
    .reverse();
  if (dates.length === 0) return null;
  return JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, dates[0] + '.json'), 'utf-8'));
}

async function fetchCloseOn(stockId, dateStr) {
  const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${stockId}&start_date=${dateStr}&end_date=${dateStr}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  return res.json();
}

// 驗證「前一個交易日 base_list 全部標的」在今天的表現，保留 is_surge 標記供對照
async function buildValidation(todayDateStr) {
  const prevReport = findPreviousReport(todayDateStr);
  if (!prevReport || !prevReport.base_list || prevReport.base_list.length === 0) {
    return { based_on_date: prevReport ? prevReport.date : null, count: 0, results: [] };
  }

  const results = [];
  for (const item of prevReport.base_list) {
    const json = await fetchCloseOn(item.stock_id, todayDateStr);
    if (json.status === 200 && json.data && json.data.length > 0) {
      const todayClose = json.data[0].close;
      const forwardReturn = +(((todayClose - item.close) / item.close) * 100).toFixed(2);
      results.push({
        stock_id: item.stock_id,
        stock_name: item.stock_name,
        type: item.type,
        is_surge: item.is_surge,
        signal_date: item.date,
        signal_close: item.close,
        today_close: todayClose,
        forward_return_pct: forwardReturn,
      });
    } else {
      results.push({
        stock_id: item.stock_id,
        stock_name: item.stock_name,
        type: item.type,
        is_surge: item.is_surge,
        signal_date: item.date,
        signal_close: item.close,
        today_close: null,
        forward_return_pct: null,
        note: '查無今日收盤資料（可能停牌或當天非交易日）',
      });
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }

  results.sort((a, b) => (b.forward_return_pct ?? -999) - (a.forward_return_pct ?? -999));
  return { based_on_date: prevReport.date, count: results.length, results };
}

async function main() {
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  if (!state.complete) {
    console.error('掃描還沒完成，不該呼叫這支腳本');
    process.exit(1);
  }

  // scan.js 掃描當下就已經算好前日收盤/漲跌幅/成交量/5日均量/量增判斷了（跟創新高/創新低共用同一批
  // 已抓到的歷史資料），這裡不用再重查一次 FinMind，只需要另外加上 MA5/MA20 幅度並排序。
  const enriched = state.results.map((r) => ({
    ...r,
    strength: +(((r.ma5 - r.ma20) / r.ma20) * 100).toFixed(2),
  }));
  enriched.sort((a, b) => b.strength - a.strength);

  // 用「資料本身實際的最後交易日」當作報告日期，而不是盲目相信 state.date（日曆上的今天）。
  // 這兩者理論上應該一致（routine 固定在收盤+資料更新之後才觸發），但如果臨時手動在收盤前
  // 執行、或觸發時間被延後，state.date 可能會早於資料實際涵蓋的最後交易日，導致報告日期標錯。
  // 找不到任何黃金交叉結果時（極少見）沒有資料可以推斷，才退回用 state.date。
  const effectiveDate = enriched[0]?.date || state.date;
  if (effectiveDate !== state.date) {
    console.log(`注意：資料實際最後交易日(${effectiveDate})跟 state.date(${state.date})不一致，報告改用 ${effectiveDate}`);
  }

  // base 清單：成交量>1000張 且 5日均量>=100張，依當日漲跌幅排序，用 is_surge 標記量增>5日均量1.3倍的標的
  const baseList = enriched
    .filter((r) => r.volume_lots > VOLUME_THRESHOLD_LOTS && r.volume_avg5_lots !== null && r.volume_avg5_lots >= MIN_AVG5_VOLUME_LOTS)
    .sort((a, b) => b.change_pct - a.change_pct);

  // 完整清單只顯示本日成交量>1000張的標的（total_golden_cross 仍是不篩選的真實黃金交叉檔數）
  const allResults = enriched.filter((r) => r.volume_lots > VOLUME_THRESHOLD_LOTS);

  console.log('驗證前一個交易日的訊號...');
  const validation = await buildValidation(effectiveDate);

  const report = {
    date: effectiveDate,
    total_scanned: state.universe.length,
    total_golden_cross: enriched.length,
    all_results: allResults, // 依 strength 排序，本日成交量>1000張的清單（含 is_surge 標記）
    base_list: baseList, // 成交量>1000張 且 5日均量>=100張，依當日漲跌幅排序，is_surge=true 代表量增>前5日均量1.3倍
    validation_of_previous_signals: validation, // 驗證前一交易日 base_list 全部標的在今天的表現，含 is_surge 標記可對照
    price_extremes: state.priceExtremes || [], // scan.js 已經算好的創新高/創新低清單（共用同一次資料抓取，這裡不用再補查）
  };

  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR);
  fs.writeFileSync(path.join(REPORTS_DIR, `${effectiveDate}.json`), JSON.stringify(report, null, 1));
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 1));
  fs.writeFileSync(HTML_FILE, renderHTML(report));

  // 改成靜態網頁呈現後，不再有「寄信是否成功」這種不確定性——寫檔案本身要嘛成功
  // 要嘛丟例外（被 main().catch 抓到），所以這裡可以直接標記今天完成，不用等呼叫端確認。
  state.reported = true;
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));

  const surgeCount = baseList.filter((r) => r.is_surge).length;
  console.log(`報告完成: 共 ${enriched.length} 檔黃金交叉，base清單 ${baseList.length} 檔(其中 ${surgeCount} 檔量增highlight)，創新高/創新低 ${report.price_extremes.length} 檔`);
  console.log(`前一交易日驗證: 基準日=${validation.based_on_date ?? '無'}，驗證 ${validation.count} 檔`);
  console.log('STATUS: REPORT_READY');
}

main().catch((e) => {
  console.error('執行失敗:', e);
  process.exit(1);
});
