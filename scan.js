// 台股全市場 MA5/MA20 黃金交叉掃描 — 雲端 routine 用，每次呼叫做「一輪」（約585次API呼叫）
// 進度存在 state.json，由呼叫端（routine 的 agent）負責 git commit + push 讓進度跨次觸發延續。
//
// 用法: FINMIND_TOKEN=xxx node scan.js
// 印出最後一行 "STATUS: xxx" 供呼叫端判斷下一步:
//   STATUS: ALREADY_COMPLETE_TODAY  → 今天已經跑完且已產生報告網頁，什麼都不用做
//   STATUS: COMPLETE                → 這輪跑完後全市場掃描完成，呼叫端接著跑 build_report.js
//   STATUS: CONTINUE                → 還沒跑完，下次觸發會自動接著跑
//   STATUS: ERROR                   → 遇到 API 錯誤，停止，下次觸發會重試

const fs = require('fs');
const path = require('path');

const TOKEN = process.env.FINMIND_TOKEN;
if (!TOKEN) {
  console.error('請先設定環境變數 FINMIND_TOKEN');
  console.log('STATUS: ERROR');
  process.exit(1);
}

const STATE_FILE = path.join(__dirname, 'state.json');
const ROUND_LIMIT = 585; // 留一點邊際給 universe 查詢那 1 次呼叫，總數不超過 590
const INTERVAL_MS = Math.ceil((3600 * 1000) / 590);

function todayTaipei() {
  const d = new Date(Date.now() + 8 * 3600 * 1000); // 轉成台北時間
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

function freshState(date) {
  return { date, universe: null, processedIds: [], results: [], complete: false, reported: false, rounds: 0 };
}

async function fetchUniverse() {
  const url = 'https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInfo';
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const json = await res.json();
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
  return res.json();
}

function computeCrossover(rows) {
  if (rows.length < 21) return null;
  const closes = rows.map((r) => r.close);
  const n = closes.length;
  const ma = (endIdx, len) => closes.slice(endIdx - len, endIdx).reduce((a, b) => a + b, 0) / len;
  const ma5Today = ma(n, 5);
  const ma20Today = ma(n, 20);
  const ma5Yday = ma(n - 1, 5);
  const ma20Yday = ma(n - 1, 20);
  if (ma5Yday < ma20Yday && ma5Today >= ma20Today) {
    return {
      date: rows[n - 1].date,
      close: rows[n - 1].close,
      ma5: +ma5Today.toFixed(2),
      ma20: +ma20Today.toFixed(2),
    };
  }
  return null;
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
    console.log(`股票清單: ${state.universe.length} 檔`);
  }

  const processedSet = new Set(state.processedIds);
  const remaining = state.universe.filter((s) => !processedSet.has(s.stock_id));

  if (remaining.length === 0) {
    state.complete = true;
    saveState(state);
    console.log('全市場已掃描完畢');
    console.log('STATUS: COMPLETE');
    return;
  }

  const end = new Date();
  const start = new Date(end.getTime() - 40 * 24 * 3600 * 1000);
  const startDate = fmtDate(start);
  const endDate = fmtDate(end);

  let calls = 0;
  let errored = false;

  for (const s of remaining) {
    if (calls >= ROUND_LIMIT) break;
    const json = await fetchStock(s.stock_id, startDate, endDate);
    calls++;

    if (json.status !== 200) {
      console.error(`遇到錯誤 status=${json.status} msg=${json.msg}，停止本輪`);
      errored = true;
      break;
    }

    state.processedIds.push(s.stock_id);
    const cross = computeCrossover(json.data || []);
    if (cross && cross.close > 0) {
      state.results.push({ stock_id: s.stock_id, stock_name: s.stock_name, type: s.type, ...cross });
    }

    if (calls % 25 === 0) saveState(state);
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }

  state.rounds++;
  const doneCount = state.processedIds.length;
  const stillRemaining = state.universe.length - doneCount;

  if (stillRemaining === 0) {
    state.complete = true;
  }
  saveState(state);

  console.log(`本輪呼叫 ${calls} 次，累計處理 ${doneCount}/${state.universe.length} 檔，發現 ${state.results.length} 檔黃金交叉`);

  if (state.complete) {
    console.log('STATUS: COMPLETE');
  } else if (errored) {
    console.log('STATUS: ERROR');
  } else {
    console.log('STATUS: CONTINUE');
  }
}

main().catch((e) => {
  console.error('執行失敗:', e);
  console.log('STATUS: ERROR');
  process.exit(1);
});
