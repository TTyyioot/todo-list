/**
 * utils.js — 通用工具函数
 * 每日待办事项清单
 */

// ========== 唯一 ID 生成 ==========
function generateId() {
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
}

// ========== 日期工具 ==========
function getTodayStr() {
  const d = new Date();
  return formatDateStr(d);
}

function formatDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateStr(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getDateDisplay(dateStr) {
  const d = parseDateStr(dateStr);
  const today = new Date();
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = (target - todayDate) / (1000 * 60 * 60 * 24);

  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const wd = weekdays[d.getDay()];

  let label = `${y}年${m}月${day}日`;
  if (diff === 0) label = `今天 · ${label}`;
  else if (diff === -1) label = `昨天 · ${label}`;
  else if (diff === 1) label = `明天 · ${label}`;

  return { label, weekday: wd, isToday: diff === 0, diff };
}

function addDays(dateStr, n) {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + n);
  return formatDateStr(d);
}

// ========== 防抖 & 节流 ==========
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ========== HTML 转义 ==========
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ========== 事件委托辅助 ==========
function getClosest(el, selector) {
  return el.closest(selector);
}

// ========== 键盘事件辅助 ==========
function isInputFocused() {
  const tag = document.activeElement?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
