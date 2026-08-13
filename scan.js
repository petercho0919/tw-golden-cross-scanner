// 台股全市場 MA5/MA20 黃金交叉掃描 — GitHub Actions 用，單一次呼叫掃完全市場。
// 呼叫間隔照 FinMind 600次/小時的額度節流（抓 590 次/小時的安全邊際），
// 每處理 25 檔就存檔一次並 git commit+push，避免 job 中途被取消或超時而遺失進度。
//
// 用法: FINMIND_TOKEN=xxx node scan.js
// 印出最後一行 "STATUS: xxx"：
//   STATUS: ALREADY_COMPLETE_TODAY  → 今天已經跑完且已產生報告網頁，什麼都不用做
//   STATUS: COMPLETE                → 全市場掃描完成，呼叫端接著跑 build_report.js
//   STATUS: ERROR                   → 遇到 API 錯誤，停止（不重試）

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TOKEN = process.env.FINMIND_TOKEN;
if (!TOKEN) {
  console.error('請先設定環境變數 FINMIND_TOKEN');
  console.log('STATUS: ERROR');
  process.exit(1);
}

const STATE_FILE = path.join(__dirname, 'state.json');
const INTERVAL_MS = Math.ceil((3600 * 1000) / 590); // 590次/小時的安全邊際
const SAVE_EVERY = 25;

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
    execSync('git add state.json', { cwd: __dirname, stdio: 'pipe' });
    execSync(`git commit -m "${message}"`, { cwd: __dirname, stdio: 'pipe' });
    execSync('git push', { cwd: __dirname, stdio: 'pipe' });
  } catch (e) {
    const msg = e.stdout ? e.stdout.toString() : e.message;
    if (/nothing to commit/.test(msg)) return; // 正常情況，沒變化就跳過
    console.error('[警告] checkpoint commit/push 失敗，繼續掃描但進度暫時沒存回 repo:', msg.slice(0, 300));
  }
}

function freshState(date) {
  return { date, universe: null, processedIds: [], results: [], complete: false, reported: false };
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
    checkpointCommit(`scan: universe fetched (${state.universe.length} 檔)`);
    console.log(`股票清單: ${state.universe.length} 檔`);
  }

  const processedSet = new Set(state.processedIds);
  const remaining = state.universe.filter((s) => !processedSet.has(s.stock_id));
  console.log(`還剩 ${remaining.length} / ${state.universe.length} 檔待處理`);

  const end = new Date();
  const start = new Date(end.getTime() - 40 * 24 * 3600 * 1000);
  const startDate = fmtDate(start);
  const endDate = fmtDate(end);

  let calls = 0;

  for (const s of remaining) {
    const json = await fetchStock(s.stock_id, startDate, endDate);
    calls++;

    if (json.status !== 200) {
      console.error(`遇到錯誤 status=${json.status} msg=${json.msg}，立刻停止，不重試`);
      saveState(state);
      checkpointCommit(`scan: stopped on error (${state.processedIds.length}/${state.universe.length})`);
      console.log('STATUS: ERROR');
      process.exit(1);
    }

    state.processedIds.push(s.stock_id);
    const cross = computeCrossover(json.data || []);
    if (cross && cross.close > 0) {
      state.results.push({ stock_id: s.stock_id, stock_name: s.stock_name, type: s.type, ...cross });
      console.log(`黃金交叉: ${s.type} ${s.stock_id} ${s.stock_name} close=${cross.close}`);
    }

    if (calls % SAVE_EVERY === 0) {
      saveState(state);
      checkpointCommit(`scan progress: ${state.processedIds.length}/${state.universe.length}`);
      console.log(`進度: ${state.processedIds.length}/${state.universe.length}`);
    }

    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }

  state.complete = true;
  saveState(state);
  checkpointCommit(`scan: complete (${state.results.length} 檔黃金交叉)`);

  console.log(`全市場掃描完成: 共處理 ${state.processedIds.length} 檔，發現 ${state.results.length} 檔黃金交叉`);
  console.log('STATUS: COMPLETE');
}

main().catch((e) => {
  console.error('執行失敗:', e);
  console.log('STATUS: ERROR');
  process.exit(1);
});
