/**
 * storage.js — localStorage 封装
 * 每日待办事项清单
 */

const BACKUP_PREFIX = 'todolist_backup_';
let currentWorkspace = 'work';  // 'work' | 'life' | ...

function getStorageKey(workspace) {
  const ws = workspace || currentWorkspace;
  if (ws === 'work') return 'todolist_data';  // 向后兼容
  return 'todolist_data_' + ws;
}

// ========== 读取全部数据 ==========
function loadData(workspace) {
  try {
    const raw = localStorage.getItem(getStorageKey(workspace));
    if (raw) {
      const data = JSON.parse(raw);
      // 数据迁移 & 兼容旧格式
      return normalizeData(data);
    }
  } catch (e) {
    console.error('数据加载失败:', e);
  }
  return getDefaultData();
}

// ========== 保存全部数据 ==========
function saveData(data, workspace) {
  try {
    localStorage.setItem(getStorageKey(workspace), JSON.stringify(data));

    // 后台同步到云端（如果已登录）
    if (typeof syncToCloud === 'function') {
      try { syncToCloud(); } catch (e) { /* 静默失败 */ }
    }

    return true;
  } catch (e) {
    console.error('数据保存失败:', e);
    // localStorage 满了
    if (e.name === 'QuotaExceededError') {
      alert('存储空间已满！请导出数据后清理旧任务。');
    }
    return false;
  }
}

// ========== 默认数据 ==========
function getDefaultData() {
  return {
    tasks: [],
    settings: {
      theme: 'light',
      fontSize: 'medium',
      showCompleted: true,
      completedCollapsed: false,
      customTags: [],  // { name, color, icon }
      autoCarryOver: true,       // 前一天未完成自动衍生到第二天
      lastCarryOverDate: null,   // 上次衍生到的日期（避免重复）
      dataVersion: 1             // 数据版本号（升级时用于迁移）
    }
  };
}

// ========== 数据规范化 ==========
function normalizeData(data) {
  if (!data || typeof data !== 'object') return getDefaultData();
  if (!Array.isArray(data.tasks)) data.tasks = [];
  // 合并默认值，确保新字段有值
  data.settings = { ...getDefaultData().settings, ...(data.settings || {}) };

  // 确保每个任务有必需的字段
  const defaults = {
    id: generateId(),
    text: '',
    completed: false,
    completedAt: null,
    starred: false,
    pinned: false,
    color: '#333333',
    tag: null,
    date: getTodayStr(),
    order: 0,
    reminder: null,
    note: '',              // 便签备注
    createdAt: new Date().toISOString(),
    carriedFrom: null       // 衍生来源（原始任务 ID）
  };

  data.tasks = data.tasks.map(t => ({ ...defaults, ...t }));
  return data;
}

// ========== 读取设置 ==========
function loadSettings() {
  const data = loadData();
  return data.settings;
}

// ========== 保存设置 ==========
function saveSettings(settings) {
  const data = loadData();
  data.settings = { ...data.settings, ...settings };
  saveData(data);
}

// ========== 导出备份 (JSON 文件下载) ==========
function exportData(workspace) {
  const data = loadData(workspace);
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const now = new Date();
  const ws = workspace || currentWorkspace;
  const wsLabel = ws === 'work' ? '' : '_' + ws;
  const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
  a.download = `todolist${wsLabel}_backup_${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ========== 导入备份 ==========
function importData(jsonStr) {
  try {
    const data = JSON.parse(jsonStr);
    const normalized = normalizeData(data);
    saveData(normalized);
    return { success: true, count: normalized.tasks.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ========== 自动备份（每次修改前保存旧快照） ==========
function autoBackup(workspace) {
  try {
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const ws = workspace || currentWorkspace;
    const prefix = ws === 'work' ? BACKUP_PREFIX : BACKUP_PREFIX + ws + '_';
    const key = prefix + stamp;
    if (!localStorage.getItem(key)) {
      const raw = localStorage.getItem(getStorageKey(ws));
      if (raw) localStorage.setItem(key, raw);
    }
  } catch (e) {
    // 静默失败，不影响主流程
  }
}

// ========== 获取存储使用量 ==========
function getStorageUsage() {
  let total = 0;
  for (const key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      total += localStorage[key].length + key.length;
    }
  }
  return (total / 1024).toFixed(1); // KB
}
