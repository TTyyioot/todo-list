/**
 * app.js — 主应用逻辑
 * 每日待办事项清单 — 事件处理、拖拽排序、键盘快捷键、初始化
 */

// ========== 初始化 ==========
function init() {
  initAppearance();

  // PWA 安装事件已在 app.js 加载时自动注册（不能等 DOMContentLoaded）

  // 初始化 Supabase 会话恢复
  initAuth();

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
  updatePageTitle();
  bindEvents();
  requestNotificationPermission();
  checkAllReminders();
  checkPinHelper(); // 检测本地置顶助手

  // 每分钟检查一次提醒
  setInterval(checkAllReminders, 60000);
}

// ========== 空间切换 ==========
function switchWorkspace(ws) {
  if (currentWorkspace === ws) return;
  currentWorkspace = ws;

  // 更新标题栏
  document.getElementById('tabWork').classList.toggle('active', ws === 'work');
  document.getElementById('tabLife').classList.toggle('active', ws === 'life');

  // 重置日期到当前空间的今天
  currentDate = getTodayStr();
  searchQuery = '';
  currentFilter = 'all';
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = '';

  // 恢复该空间的外观设置
  initAppearance();

  // 衍生未完成任务
  carryOverFromYesterday(currentDate);

  // 重新渲染
  if (currentView === 'calendar') {
    const now = new Date();
    calendarYear = now.getFullYear();
    calendarMonth = now.getMonth();
    renderCalendar(calendarYear, calendarMonth);
  }
  renderAll();
  updateFilterButtons();

  // 更新页面标题
  updatePageTitle();
}

function updatePageTitle() {
  const wsLabel = currentWorkspace === 'life' ? '生活' : '工作';
  const { label, isToday } = getDateDisplay(currentDate);
  document.title = isToday
    ? `📋 ${wsLabel} · 待办清单`
    : `📋 ${wsLabel} · ${label}`;
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
  // ── 空间切换 ──
  document.getElementById('tabWork').addEventListener('click', () => switchWorkspace('work'));
  document.getElementById('tabLife').addEventListener('click', () => switchWorkspace('life'));

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

  // ── 手动同步按钮 ──
  const btnSyncRetry = document.getElementById('btnSyncRetry');
  if (btnSyncRetry) {
    btnSyncRetry.addEventListener('click', async () => {
      btnSyncRetry.disabled = true;
      btnSyncRetry.textContent = '⏳ 同步中...';
      const result = await syncFromCloud();
      if (result === 'pulled') {
        currentDate = getTodayStr();
        renderAll();
        if (currentView === 'calendar') renderCalendar(calendarYear, calendarMonth);
      }
      btnSyncRetry.disabled = false;
      btnSyncRetry.textContent = '🔄 同步';
    });
  }

  // ── 安装应用按钮 ──
  const btnInstallApp = document.getElementById('btnInstallApp');
  if (btnInstallApp) {
    btnInstallApp.addEventListener('click', triggerInstall);
  }

  // ── Auth 事件 ──
  const btnShowAuth = document.getElementById('btnShowAuth');
  if (btnShowAuth) btnShowAuth.addEventListener('click', showAuthModal);
  const btnAuthClose = document.getElementById('btnAuthClose');
  if (btnAuthClose) btnAuthClose.addEventListener('click', hideAuthModal);
  const btnAuthSubmit = document.getElementById('authSubmitBtn');
  if (btnAuthSubmit) btnAuthSubmit.addEventListener('click', handleAuthSubmit);
  const btnSkipAuth = document.getElementById('btnSkipAuth');
  if (btnSkipAuth) btnSkipAuth.addEventListener('click', hideAuthModal);
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) btnLogout.addEventListener('click', authSignOut);
  const btnForgotPassword = document.getElementById('btnForgotPassword');
  if (btnForgotPassword) btnForgotPassword.addEventListener('click', handleForgotPassword);
  const authModal = document.getElementById('authModal');
  if (authModal) authModal.addEventListener('click', function (e) { if (e.target === this) hideAuthModal(); });
  const authPassword = document.getElementById('authPassword');
  if (authPassword) authPassword.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAuthSubmit(); });

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
// 策略：按钮始终显示（登录后），beforeinstallprompt 仅用于捕获安装事件
let deferredPrompt = null;

(function registerPWAInstallListener() {
  // 捕获 beforeinstallprompt 事件（用于实际触发安装对话框）
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log('[PWA] beforeinstallprompt 已捕获');
    // 同时显示顶部横幅
    setTimeout(showInstallBanner, 2000);
  });

  // 安装完成
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideInstallBanner();
    hideInstallButton();
    if (typeof syncDebug === 'function') syncDebug('✅ 应用已安装到桌面', 'ok');
  });
})();

// 登录后 3 秒显示安装按钮（不依赖 beforeinstallprompt）
function showInstallButtonIfNeeded() {
  // 已在独立窗口中运行 → 不需要安装按钮
  if (window.matchMedia('(display-mode: standalone)').matches) return;
  // 已显示过 → 不重复
  const btn = document.getElementById('btnInstallApp');
  if (!btn || btn.style.display === '') return;
  showInstallButton();
}

function showInstallButton() {
  const btn = document.getElementById('btnInstallApp');
  if (btn) {
    btn.style.display = '';
    btn.title = '安装为桌面独立应用（无边框窗口）';
  }
}

function hideInstallButton() {
  const btn = document.getElementById('btnInstallApp');
  if (btn) btn.style.display = 'none';
}

function triggerInstall() {
  if (deferredPrompt) {
    // beforeinstallprompt 可用 → 触发原生安装对话框
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((result) => {
      console.log('[PWA] 安装结果:', result.outcome);
      if (result.outcome === 'accepted') {
        deferredPrompt = null;
        hideInstallButton();
      }
    });
  } else {
    // Fallback：beforeinstallprompt 不可用 → 显示手动安装引导
    alert(
      '📱 安装到桌面：\n\n' +
      'Chrome / Edge 桌面版：\n' +
      '地址栏右侧点 ⋮ → 更多工具 → 创建快捷方式\n' +
      '  ☑ 勾选「在窗口中打开」\n\n' +
      'Chrome 手机版：\n' +
      '地址栏右侧 ⋮ → 添加到主屏幕\n\n' +
      'Safari (iPhone)：\n' +
      '底部 ↑ 分享 → 添加到主屏幕\n\n' +
      '安装后可在桌面/主屏幕找到独立窗口 App。'
    );
  }
}

function showInstallBanner() {
  if (!document.body) return; // DOM 还没 ready
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
  setTimeout(() => banner.classList.add('show'), 100);

  document.getElementById('btnInstall').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    console.log('[PWA] 安装结果:', result.outcome);
    deferredPrompt = null;
    hideInstallBanner();
  });

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

// ========== Auth 初始化 ==========
async function initAuth() {
  // 显示加载状态
  syncDebug('⏳ SDK 加载中...', 'info');

  // 等待 Supabase SDK 就绪
  const sdkReady = await waitForSupabase();
  if (!sdkReady) {
    syncDebug('⚠️ 离线模式，无法同步', 'warn');
    // 离线模式：跳过登录，直接使用本地数据
    updateSyncStatus('offline');
    return;
  }

  initSupabase();
  syncDebug('SDK 就绪，检查登录状态...', 'info');

  const session = await restoreSession();
  if (session) {
    updateAuthUI(session);
    updateSyncStatus('synced');
    const syncResult = await syncFromCloud();
    if (syncResult === 'pulled') {
      renderAll();
      if (currentView === 'calendar') {
        renderCalendar(calendarYear, calendarMonth);
      }
    }

    // 延迟显示安装按钮（已登录用户）
    setTimeout(function() {
      if (typeof showInstallButtonIfNeeded === 'function') {
        showInstallButtonIfNeeded();
      }
    }, 3000);

    // 🔄 每 30 秒从云端拉一次（多设备同步）
    setInterval(async () => {
      const s = await restoreSession();
      if (s) {
        await pullFromCloudIfNeeded();
      }
    }, 30000);

    // 🔄 切换回页面时立即拉一次
    window.addEventListener('focus', async () => {
      const s = await restoreSession();
      if (s) {
        await pullFromCloudIfNeeded();
      }
    });
  } else {
    // 未登录 → 强制弹窗，不能跳过
    showAuthModal(true);
  }

  // 监听登出
  const client = initSupabase();
  if (client) {
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        updateAuthUI(null);
      }
    });
  }
}

// ========== 窗口置顶（同源 API，由本地启动器提供） ==========
let windowPinned = false;

async function toggleWindowPin() {
  const btn = document.getElementById('btnPin');
  try {
    const resp = await fetch('/toggle');
    if (resp.ok) {
      const data = await resp.json();
      windowPinned = data.pinned;
      updatePinButton();
      showPinToast(windowPinned ? '📌 窗口已置顶' : '🔓 已取消置顶');
    }
  } catch (e) {
    // 不在本地服务器运行（比如 GitHub Pages / 直接打开文件）
    windowPinned = false;
    updatePinButton();
    showPinToast('⚠️ 置顶功能需要本地启动器\n请使用「启动清单.bat」打开');
  }
}

function showPinToast(msg) {
  // 复用 undo toast 或创建临时提示
  const toast = document.getElementById('undoToast');
  const textEl = document.getElementById('undoText');
  if (toast && textEl) {
    textEl.textContent = msg;
    toast.style.display = 'flex';
    // 隐藏撤销按钮
    const undoBtn = document.getElementById('btnUndo');
    const closeBtn = document.getElementById('btnUndoClose');
    if (undoBtn) undoBtn.style.display = 'none';
    if (closeBtn) closeBtn.style.display = '';
    clearTimeout(toast._pinTimer);
    toast._pinTimer = setTimeout(() => {
      toast.style.display = 'none';
      if (undoBtn) undoBtn.style.display = '';
    }, 3000);
  }
}

function updatePinButton() {
  const btn = document.getElementById('btnPin');
  if (!btn) return;
  if (windowPinned) {
    btn.title = '已置顶 — 点击取消';
    btn.classList.add('pinned');
  } else {
    btn.title = '窗口置顶';
    btn.classList.remove('pinned');
  }
}

// 页面加载后检测置顶助手状态
async function checkPinHelper() {
  try {
    const resp = await fetch('/status');
    if (resp.ok) {
      const data = await resp.json();
      windowPinned = data.pinned;
      updatePinButton();
      // 本地服务器可用，显示置顶按钮
      const btn = document.getElementById('btnPin');
      if (btn) btn.style.display = '';
    }
  } catch (e) {
    // 不是本地服务器（比如手机访问 GitHub Pages），隐藏置顶按钮
    const btn = document.getElementById('btnPin');
    if (btn) btn.style.display = 'none';
  }
}

// 导出到全局作用域（调试用）
if (typeof window !== 'undefined') {
  window.todoApp = {
    currentDate,
    currentFilter,
    currentWorkspace,
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
    carryOverFromYesterday,
    switchWorkspace
  };
}
