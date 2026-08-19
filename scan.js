// 台股全市場 MA5/MA20 黃金交叉掃描 — GitHub Actions 用，單一次呼叫掃完全市場。
// 呼叫間隔照 FinMind 600次/小時的額度節流（抓 590 次/小時的安全邊際），
// 每處理 250 檔就存檔一次並 git commit+push，避免 job 中途被取消或超時而遺失進度。
// 這個數字不能設太小：每次push都會觸發一次Vercel部署，Vercel Hobby方案每天
// 上限100次部署。原本設25會讓單次掃描就push近90次，逼近上限；8/18那天超過
// 上限，導致當天所有後續部署（包含最終報告）都被Vercel直接拒絕build。
//
// 用法: FINMIND_TOKEN=xxx node scan.js
// 印出最後一行 "STATUS: xxx"：
//   STATUS: ALREADY_COMPLETE_TODAY  → 今天已經跑完且已產生報告網頁，什麼都不用做
//   STATUS: COMPLETE                → 全市場掃描完成，呼叫端接著跑 build_report.js
//   STATUS: ERROR                   → 遇到 API 錯誤，停止（不重試）

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { renderProgressHTML } = require('./render_progress');

const TOKEN = process.env.FINMIND_TOKEN;
if (!TOKEN) {
  console.error('請先設定環境變數 FINMIND_TOKEN');
  console.log('STATUS: ERROR');
  process.exit(1);
}

const STATE_FILE = path.join(__dirname, 'state.json');
const HTML_FILE = path.join(__dirname, 'index.html');
const INTERVAL_MS = Math.ceil((3600 * 1000) / 590); // 590次/小時的安全邊際
const SAVE_EVERY = 250;

// 掃描還沒完成時，先寫一版「進行中」的網頁，讓 Vercel 有東西可以部署
function writeProgressPage(state) {
  fs.writeFileSync(HTML_FILE, renderProgressHTML(state, INTERVAL_MS));
}

function todayTaipei() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  return null;
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
}

// 進度存檔後順便 commit+push，避免 job 中途被取消或超時而整批遺失。
// 失敗只印警告，不中斷掃描（掃描本身的資料還在記憶體/本機檔案裡，下次還能重新 push）。
function checkpointCommit(message) {
  try {
    execSync('git add state.json index.html', { cwd: __dirname, stdio: 'pipe' });
    execSync(`git commit -m "${message}"`, { cwd: __dirname, stdio: 'pipe' });
    execSync('git push', { cwd: __dirname, stdio: 'pipe' });
  } catch (e) {
    const stdout = e.stdout ? e.stdout.toString() : '';
    const stderr = e.stderr ? e.stderr.toString() : '';
    const msg = (stdout + stderr).trim() || e.message || '(無錯誤訊息)';
    if (/nothing to commit/.test(msg)) return; // 正常情況，沒變化就跳過
    console.error('[警告] checkpoint commit/push 失敗，繼續掃描但進度暫時沒存回 repo:', msg.slice(0, 300));
  }
}

function freshState(date) {
  return { date, universe: null, processedIds: [], results: [], priceExtremes: [], complete: false, reported: false };
}

// FinMind 偶爾會回傳非 JSON 的錯誤頁（例如上游 502 Bad Gateway），直接 res.json() 會丟出
// 沒被攔截的例外讓整個程式崩潰。這裡把它轉成跟 FinMind 自己回傳的錯誤格式一致的物件，
// 讓呼叫端既有的「status 不是200就停止」邏輯可以正常接手，不新增任何重試。
async function parseJsonResponse(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    return { status: res.status, msg: `非JSON回應: ${text.slice(0, 200)}` };
  }
}

async function fetchUniverse() {
  const url = 'https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInfo';
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const json = await parseJsonResponse(res);
  if (json.status !== 200) throw new Error(`universe fetch failed: ${json.status} ${json.msg}`);

  const seen = new Set();
  return json.data.filter((r) => {
    if (!/^\d{4}$/.test(r.stock_id)) return false;
    if (r.type !== 'twse' && r.type !== 'tpex') return false;
    if (seen.has(r.stock_id)) return false;
    seen.add(r.stock_id);
    return true;
  });
}

async function fetchStock(stockId, startDate, endDate) {
  const url =
    `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice` +
    `&data_id=${stockId}&start_date=${startDate}&end_date=${endDate}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  return parseJsonResponse(res);
}

const SURGE_RATIO = 1.3; // 今日量 > 前5日均量的幾倍才算量增，黃金交叉跟創新高/創新低共用同一個門檻

// 除了判斷 MA5/MA20 交叉，順便算好前日收盤/漲跌幅/成交量/5日均量/量增判斷，
// 全部都用同一批已經抓到的 rows，不用等 build_report.js 再重查一次。
function computeCrossover(rows) {
  if (rows.length < 21) return null;
  const closes = rows.map((r) => r.close);
  const n = closes.length;
  const ma = (endIdx, len) => closes.slice(endIdx - len, endIdx).reduce((a, b) => a + b, 0) / len;
  const ma5Today = ma(n, 5);
  const ma20Today = ma(n, 20);
  const ma5Yday = ma(n - 1, 5);
  const ma20Yday = ma(n - 1, 20);
  if (!(ma5Yday < ma20Yday && ma5Today >= ma20Today)) return null;

  const today = rows[n - 1];
  const yday = rows[n - 2];
  const prior5 = rows.slice(n - 6, n - 1);
  const volumeLots = Math.round(today.Trading_Volume / 1000);
  const volumeAvg5Lots = Math.round(prior5.reduce((s, r) => s + r.Trading_Volume, 0) / 5 / 1000);
  const volumeRatio = volumeAvg5Lots > 0 ? +(volumeLots / volumeAvg5Lots).toFixed(2) : null;
  const changePct = +(((today.close - yday.close) / yday.close) * 100).toFixed(2);
  const isSurge = volumeRatio !== null && volumeRatio > SURGE_RATIO;

  return {
    date: today.date,
    close: today.close,
    close_yday: yday.close,
    change_pct: changePct,
    volume_lots: volumeLots,
    volume_avg5_lots: volumeAvg5Lots,
    volume_ratio: volumeRatio,
    is_surge: isSurge,
    ma5: +ma5Today.toFixed(2),
    ma20: +ma20Today.toFixed(2),
  };
}

const EXTREME_WINDOWS = [
  { period: '12個月', days: 365 },
  { period: '6個月', days: 180 },
  { period: '3個月', days: 90 },
  { period: '1個月', days: 30 },
];
const MIN_AVG5_VOLUME_LOTS = 100;
const MIN_TODAY_VOLUME_LOTS = 1000; // 本日成交量門檻，跟 build_report.js 的 VOLUME_THRESHOLD_LOTS 用同一個數字

// 檢查今天收盤價是否創各區間新高/新低（只標最長符合的區間），
// 並算出前5個交易日均量（不含今天）。rows 需要涵蓋足夠長的歷史（scan.js 已抓約13個月）。
function computePriceExtreme(rows) {
  if (rows.length < 6) return null; // 至少要有5個交易日+今天才能算均量
  const n = rows.length;
  const today = rows[n - 1];
  const yday = rows[n - 2];
  const todayDate = new Date(today.date);

  let highPeriod = null;
  let lowPeriod = null;
  for (const w of EXTREME_WINDOWS) {
    const cutoff = new Date(todayDate.getTime() - w.days * 24 * 3600 * 1000);
    const windowRows = rows.filter((r) => new Date(r.date) >= cutoff);
    if (windowRows.length === 0) continue;
    const maxClose = Math.max(...windowRows.map((r) => r.close));
    const minClose = Math.min(...windowRows.map((r) => r.close));
    if (highPeriod === null && today.close >= maxClose) highPeriod = w.period;
    if (lowPeriod === null && today.close <= minClose) lowPeriod = w.period;
  }

  if (!highPeriod && !lowPeriod) return null;

  const prior5 = rows.slice(n - 6, n - 1);
  const volumeAvg5Lots = Math.round(prior5.reduce((s, r) => s + r.Trading_Volume, 0) / 5 / 1000);
  if (volumeAvg5Lots < MIN_AVG5_VOLUME_LOTS) return null; // 5日均量太小，剔除

  const volumeLots = Math.round(today.Trading_Volume / 1000);
  if (volumeLots <= MIN_TODAY_VOLUME_LOTS) return null; // 本日成交量太小，剔除

  const volumeRatio = volumeAvg5Lots > 0 ? +(volumeLots / volumeAvg5Lots).toFixed(2) : null;
  const isSurge = volumeRatio !== null && volumeRatio > SURGE_RATIO; // 今日量 > 前5日均量的1.3倍，跟黃金交叉那邊同一套規則
  const changePct = +(((today.close - yday.close) / yday.close) * 100).toFixed(2);

  return {
    date: today.date,
    close: today.close,
    close_yday: yday.close,
    change_pct: changePct,
    volume_lots: volumeLots,
    volume_avg5_lots: volumeAvg5Lots,
    volume_ratio: volumeRatio,
    highPeriod,
    lowPeriod,
    is_surge: isSurge,
  };
}

async function main() {
  const today = todayTaipei();
  let state = loadState();

  if (!state || state.date !== today) {
    state = freshState(today);
    saveState(state);
    console.log(`新的一天(${today})，重置掃描狀態`);
  }

  if (state.reported) {
    console.log('今天已經掃描完成且已產生報告網頁');
    console.log('STATUS: ALREADY_COMPLETE_TODAY');
    return;
  }

  if (!state.universe) {
    console.log('查詢股票清單...');
    let universe = await fetchUniverse();
    if (process.env.TEST_LIMIT) {
      const n = parseInt(process.env.TEST_LIMIT, 10);
      universe = universe.slice(0, n);
      console.log(`[測試模式] 清單縮減為前 ${n} 檔`);
    }
    state.universe = universe;
    saveState(state);
    writeProgressPage(state);
    checkpointCommit(`scan: universe fetched (${state.universe.length} 檔)`);
    console.log(`股票清單: ${state.universe.length} 檔`);
  }

  const processedSet = new Set(state.processedIds);
  const remaining = state.universe.filter((s) => !processedSet.has(s.stock_id));
  console.log(`還剩 ${remaining.length} / ${state.universe.length} 檔待處理`);

  const end = new Date();
  const start = new Date(end.getTime() - 400 * 24 * 3600 * 1000); // 約13個月，含緩衝天數
  const startDate = fmtDate(start);
  const endDate = fmtDate(end);

  let calls = 0;

  for (const s of remaining) {
    const json = await fetchStock(s.stock_id, startDate, endDate);
    calls++;

    if (json.status !== 200) {
      console.error(`遇到錯誤 status=${json.status} msg=${json.msg}，立刻停止，不重試`);
      saveState(state);
      writeProgressPage(state);
      checkpointCommit(`scan: stopped on error (${state.processedIds.length}/${state.universe.length})`);
      console.log('STATUS: ERROR');
      process.exit(1);
    }

    state.processedIds.push(s.stock_id);
    const rows = json.data || [];
    const cross = computeCrossover(rows);
    if (cross && cross.close > 0) {
      state.results.push({ stock_id: s.stock_id, stock_name: s.stock_name, type: s.type, ...cross });
      console.log(`黃金交叉: ${s.type} ${s.stock_id} ${s.stock_name} close=${cross.close}`);
    }

    const extreme = computePriceExtreme(rows);
    if (extreme && extreme.close > 0) {
      state.priceExtremes.push({ stock_id: s.stock_id, stock_name: s.stock_name, type: s.type, ...extreme });
      const tags = [extreme.highPeriod ? `${extreme.highPeriod}新高` : null, extreme.lowPeriod ? `${extreme.lowPeriod}新低` : null].filter(Boolean).join('/');
      console.log(`${tags}: ${s.type} ${s.stock_id} ${s.stock_name} close=${extreme.close} 5日均量=${extreme.volume_avg5_lots}張`);
    }

    if (calls % SAVE_EVERY === 0) {
      saveState(state);
      writeProgressPage(state);
      checkpointCommit(`scan progress: ${state.processedIds.length}/${state.universe.length}`);
      console.log(`進度: ${state.processedIds.length}/${state.universe.length}`);
    }

    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }

  state.complete = true;
  saveState(state);
  writeProgressPage(state);
  checkpointCommit(`scan: complete (${state.results.length} 檔黃金交叉)`);

  console.log(`全市場掃描完成: 共處理 ${state.processedIds.length} 檔，發現 ${state.results.length} 檔黃金交叉、${state.priceExtremes.length} 檔創新高/新低`);
  console.log('STATUS: COMPLETE');
}

main().catch((e) => {
  console.error('執行失敗:', e);
  console.log('STATUS: ERROR');
  process.exit(1);
});
