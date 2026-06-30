/**
 * app.js — 主应用逻辑
 * 每日待办事项清单 — 事件处理、拖拽排序、键盘快捷键、初始化
 */

// ========== 初始化 ==========
function init() {
  initAppearance();

  // PWA 安装事件监听
  initPWAInstall();

  // 数据版本升级检查 & 强制衍生
  const CURRENT_DATA_VERSION = 1;
  const data = loadData();
  if ((data.settings.dataVersion || 0) < CURRENT_DATA_VERSION) {
    data.settings.lastCarryOverDate = null;
    data.settings.dataVersion = CURRENT_DATA_VERSION;
    saveData(data);
  }

  // 所有过去日期中未完成的任务衍生到今日
  const today = getTodayStr();
  const carriedCount = carryOverFromYesterday(today);
  if (carriedCount > 0) {
    console.log(`已衍生 ${carriedCount} 个未完成任务到今日`);
  }

  // 初始化日历到当前月份
  const now = new Date();
  calendarYear = now.getFullYear();
  calendarMonth = now.getMonth();
  renderCalendar(calendarYear, calendarMonth);
  renderAll();
  updateFilterButtons();
  bindEvents();
  requestNotificationPermission();
  checkAllReminders();

  // 每分钟检查一次提醒
  setInterval(checkAllReminders, 60000);
}

// ========== 视图切换 ==========
function switchView(view) {
  currentView = view;
  document.getElementById('listView').style.display = view === 'list' ? '' : 'none';
  document.getElementById('calendarView').style.display = view === 'calendar' ? '' : 'none';
  document.getElementById('tabList').classList.toggle('active', view === 'list');
  document.getElementById('tabCalendar').classList.toggle('active', view === 'calendar');

  if (view === 'calendar') {
    calendarYear = parseDateStr(currentDate).getFullYear();
    calendarMonth = parseDateStr(currentDate).getMonth();
    renderCalendar(calendarYear, calendarMonth);
  }

  if (view === 'list') {
    renderAll();
  }
}

// ========== 事件绑定 ==========
function bindEvents() {
  // ── 视图切换 ──
  document.getElementById('tabList').addEventListener('click', () => switchView('list'));
  document.getElementById('tabCalendar').addEventListener('click', () => switchView('calendar'));

  // ── 日期导航 ──
  document.getElementById('btnPrevDay').addEventListener('click', () => {
    currentDate = addDays(currentDate, -1);
    renderAll();
  });
  document.getElementById('btnNextDay').addEventListener('click', () => {
    currentDate = addDays(currentDate, 1);
    renderAll();
  });
  document.getElementById('btnToday').addEventListener('click', () => {
    currentDate = getTodayStr();
    carryOverFromYesterday(currentDate);
    renderAll();
  });

  // ── 添加任务 ──
  const taskInput = document.getElementById('taskInput');
  document.getElementById('btnAdd').addEventListener('click', addTaskFromInput);
  taskInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      addTaskFromInput();
    }
  });
  // 支持批量粘贴（每行一个任务）
  taskInput.addEventListener('paste', (e) => {
    const text = (e.clipboardData || window.clipboardData).getData('text');
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length > 1) {
      e.preventDefault();
      lines.forEach(line => addTask(line.trim(), currentDate));
      renderAll();
    }
  });

  // ── 搜索 ──
  const searchInput = document.getElementById('searchInput');
  const debouncedRender = debounce(() => {
    searchQuery = searchInput.value;
    renderAll();
  }, 250);
  searchInput.addEventListener('input', debouncedRender);
  document.getElementById('btnClearSearch').addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    renderAll();
  });

  // ── 筛选按钮 ──
  document.querySelectorAll('.btn-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      updateFilterButtons();
      renderAll();
    });
  });

  // ── 撤销删除 ──
  document.getElementById('btnUndo').addEventListener('click', undoDelete);
  document.getElementById('btnUndoClose').addEventListener('click', hideUndoToast);

  // ── 颜色选择器 ──
  document.getElementById('btnColorClose').addEventListener('click', closeColorModal);
  document.getElementById('btnColorApply').addEventListener('click', applyColor);
  document.getElementById('btnColorReset').addEventListener('click', () => {
    if (currentColorTaskId) {
      updateTask(currentColorTaskId, { color: '#333333' });
      closeColorModal();
      renderAll();
    }
  });
  document.getElementById('customColor').addEventListener('input', function () {
    document.getElementById('customColorHex').textContent = this.value;
    document.querySelectorAll('#colorGrid .color-swatch').forEach(s => s.classList.remove('selected'));
  });
  // 点击遮罩关闭
  document.getElementById('colorModal').addEventListener('click', function (e) {
    if (e.target === this) closeColorModal();
  });

  // ── 标签选择器 ──
  document.getElementById('btnTagClose').addEventListener('click', closeTagModal);
  document.getElementById('btnTagApply').addEventListener('click', () => {
    const selected = document.querySelector('#tagGrid .tag-option.selected');
    const tagName = selected ? selected.textContent.replace(/^.\s*/, '').trim() : null;
    applyTag(tagName || null);
  });
  document.getElementById('btnTagNone').addEventListener('click', () => applyTag(null));
  document.getElementById('tagModal').addEventListener('click', function (e) {
    if (e.target === this) closeTagModal();
  });

  // ── 提醒 ──
  document.getElementById('btnReminderClose').addEventListener('click', closeReminderModal);
  document.getElementById('btnReminderApply').addEventListener('click', () => {
    const time = document.getElementById('reminderTime').value;
    applyReminder(time);
  });
  document.getElementById('btnReminderNone').addEventListener('click', () => applyReminder(null));
  document.getElementById('reminderModal').addEventListener('click', function (e) {
    if (e.target === this) closeReminderModal();
  });

  // ── 设置 ──
  document.getElementById('btnSettings').addEventListener('click', openSettingsModal);
  document.getElementById('btnSettingsClose').addEventListener('click', closeSettingsModal);
  document.getElementById('settingsModal').addEventListener('click', function (e) {
    if (e.target === this) closeSettingsModal();
  });
  document.getElementById('settingFontSize').addEventListener('change', applySettings);
  document.getElementById('settingShowCompleted').addEventListener('change', applySettings);
  document.getElementById('settingCollapseCompleted').addEventListener('change', applySettings);
  document.getElementById('btnClearAll').addEventListener('click', () => {
    if (confirm('确定要清空所有数据吗？此操作不可恢复！\n\n建议先导出备份。')) {
      clearAllData();
      closeSettingsModal();
      renderAll();
    }
  });

  // ── 已完成折叠 ──
  document.getElementById('completedHeader').addEventListener('click', () => {
    const settings = loadSettings();
    settings.completedCollapsed = !settings.completedCollapsed;
    saveSettings(settings);
    applyCompletedCollapse(settings.completedCollapsed);
  });

  // ── 底部工具栏 ──
  document.getElementById('btnExport').addEventListener('click', exportData);
  document.getElementById('btnImport').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });
  document.getElementById('importFileInput').addEventListener('change', handleImport);
  document.getElementById('btnTheme').addEventListener('click', toggleTheme);

  // ── 日历导航 ──
  document.getElementById('btnPrevMonth').addEventListener('click', () => {
    calendarMonth--;
    if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
    renderCalendar(calendarYear, calendarMonth);
  });
  document.getElementById('btnNextMonth').addEventListener('click', () => {
    calendarMonth++;
    if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
    renderCalendar(calendarYear, calendarMonth);
  });
  document.getElementById('btnCalendarToday').addEventListener('click', () => {
    const now = new Date();
    calendarYear = now.getFullYear();
    calendarMonth = now.getMonth();
    renderCalendar(calendarYear, calendarMonth);
  });

  // ── 全局快捷键 ──
  document.addEventListener('keydown', handleGlobalShortcut);

  // ── 拖拽排序 ──
  initDragAndDrop();
}

// ========== 添加任务 ==========
function addTaskFromInput() {
  const input = document.getElementById('taskInput');
  const text = input.value.trim();
  if (!text) return;

  // 支持多行输入（用 Shift+Enter 换行）
  const lines = text.split('\n').filter(l => l.trim());
  lines.forEach(line => addTask(line.trim(), currentDate));

  input.value = '';
  input.focus();
  renderAll();
}

// ========== 导入文件处理 ==========
function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (ev) {
    const result = importData(ev.target.result);
    if (result.success) {
      alert(`导入成功！共导入 ${result.count} 个任务。`);
      renderAll();
    } else {
      alert(`导入失败：${result.error}`);
    }
  };
  reader.readAsText(file);
  // 重置 input 以便重新选择同一文件
  e.target.value = '';
}

// ========== 全局快捷键 ==========
function handleGlobalShortcut(e) {
  // Ctrl+F / Cmd+F — 聚焦搜索框
  if ((e.ctrlKey || e.metaKey) && e.key === 'f' && !isInputFocused()) {
    e.preventDefault();
    document.getElementById('searchInput').focus();
    return;
  }
  // Ctrl+Z / Cmd+Z — 撤销删除
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !isInputFocused()) {
    e.preventDefault();
    undoDelete();
    return;
  }
  // Escape — 关闭弹窗 / 清除搜索
  if (e.key === 'Escape') {
    const modals = document.querySelectorAll('.modal-overlay');
    let anyOpen = false;
    modals.forEach(m => {
      if (m.style.display === 'flex') { m.style.display = 'none'; anyOpen = true; }
    });
    if (!anyOpen && document.activeElement === document.getElementById('searchInput')) {
      document.getElementById('searchInput').value = '';
      searchQuery = '';
      renderAll();
    }
  }
}

// ========== 拖拽排序 ==========
let dragSrcId = null;

function initDragAndDrop() {
  document.getElementById('taskListArea').addEventListener('dragstart', (e) => {
    const li = e.target.closest('.task-item');
    if (!li) return;
    dragSrcId = li.dataset.id;
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragSrcId);
  });

  document.getElementById('taskListArea').addEventListener('dragend', (e) => {
    const li = e.target.closest('.task-item');
    if (li) li.classList.remove('dragging');
    // 清除所有 drag-over
    document.querySelectorAll('.task-item.drag-over').forEach(el => el.classList.remove('drag-over'));
    dragSrcId = null;
  });

  document.getElementById('taskListArea').addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const li = e.target.closest('.task-item');
    if (!li || li.dataset.id === dragSrcId) return;
    // 清除旧的样式
    document.querySelectorAll('.task-item.drag-over').forEach(el => {
      if (el !== li) el.classList.remove('drag-over');
    });
    li.classList.add('drag-over');
  });

  document.getElementById('taskListArea').addEventListener('dragleave', (e) => {
    const li = e.target.closest('.task-item');
    if (li) li.classList.remove('drag-over');
  });

  document.getElementById('taskListArea').addEventListener('drop', (e) => {
    e.preventDefault();
    const targetLi = e.target.closest('.task-item');
    if (!targetLi || !dragSrcId || targetLi.dataset.id === dragSrcId) return;
    targetLi.classList.remove('drag-over');

    const srcTask = getTaskById(dragSrcId);
    const targetTask = getTaskById(targetLi.dataset.id);
    if (!srcTask || !targetTask) return;

    // 只在同日期同分区间拖拽
    const srcList = targetLi.closest('.task-list');
    if (!srcList) return;
    const items = Array.from(srcList.querySelectorAll('.task-item'));
    const targetIndex = items.indexOf(targetLi);

    // 如果拖到已完成区，标记完成
    if (srcList.id === 'completedList' && !srcTask.completed) {
      updateTask(dragSrcId, { completed: true, order: targetTask.order });
    } else if (srcList.id !== 'completedList' && srcTask.completed) {
      updateTask(dragSrcId, { completed: false, order: targetTask.order });
    } else {
      reorderTask(dragSrcId, targetIndex, currentDate);
    }

    renderAll();
    dragSrcId = null;
  });
}

// ========== 通知权限 ==========
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    // 延迟请求，避免页面加载时弹出
    setTimeout(() => {
      Notification.requestPermission();
    }, 3000);
  }
}

// ========== 提醒检查 ==========
let lastReminderCheck = '';
function checkAllReminders() {
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  // 同一分钟只检查一次
  if (currentTime === lastReminderCheck) return;
  lastReminderCheck = currentTime;
  checkReminders();
}

// ========== PWA 安装提示 ==========
let deferredPrompt = null;

function initPWAInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    // 阻止默认的安装提示
    e.preventDefault();
    // 保存事件供后续使用
    deferredPrompt = e;

    // 显示自定义安装横幅（2秒后，避免页面刚加载就弹出）
    setTimeout(showInstallBanner, 2000);
  });

  // 用户已安装后隐藏
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideInstallBanner();
    console.log('[PWA] 应用已安装');
  });
}

function showInstallBanner() {
  // 检查是否已有横幅
  if (document.getElementById('installBanner')) return;

  const banner = document.createElement('div');
  banner.id = 'installBanner';
  banner.className = 'install-banner';
  banner.innerHTML = `
    <span class="install-banner-text">📋 添加到桌面，随时查看待办</span>
    <button class="btn btn-primary btn-small" id="btnInstall">添加</button>
    <button class="btn-install-close" id="btnInstallClose">✕</button>
  `;

  document.body.appendChild(banner);

  // 动画入场
  setTimeout(() => banner.classList.add('show'), 100);

  // 安装按钮
  document.getElementById('btnInstall').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    console.log('[PWA] 安装结果:', result.outcome);
    deferredPrompt = null;
    hideInstallBanner();
  });

  // 关闭按钮
  document.getElementById('btnInstallClose').addEventListener('click', hideInstallBanner);
}

function hideInstallBanner() {
  const banner = document.getElementById('installBanner');
  if (banner) {
    banner.classList.remove('show');
    setTimeout(() => banner.remove(), 300);
  }
}

// ========== 启动 ==========
document.addEventListener('DOMContentLoaded', init);

// 导出到全局作用域（调试用）
if (typeof window !== 'undefined') {
  window.todoApp = {
    currentDate,
    currentFilter,
    searchQuery,
    getAllTasks,
    addTask,
    updateTask,
    deleteTask,
    renderAll,
    loadData,
    saveData,
    exportData,
    importData,
    clearAllData,
    carryOverFromYesterday
  };
}
