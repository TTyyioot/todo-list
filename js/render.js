/**
 * render.js — DOM 渲染引擎
 * 每日待办事项清单
 */

// ========== 颜色预设 ==========
const COLOR_PRESETS = [
  '#333333', '#4f46e5', '#0891b2', '#059669', '#65a30d',
  '#d97706', '#dc2626', '#db2777', '#9333ea', '#4b5563',
  '#f43f5e', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6',
  '#64748b', '#ec4899', '#14b8a6', '#f97316', '#6d28d9'
];

// ========== 标签预设 ==========
const DEFAULT_TAGS = [
  { name: '工作', color: '#3b82f6', icon: '💼' },
  { name: '个人', color: '#ec4899', icon: '👤' },
  { name: '学习', color: '#10b981', icon: '📚' },
  { name: '紧急', color: '#ef4444', icon: '🔥' },
  { name: '健康', color: '#8b5cf6', icon: '💪' },
  { name: '其他', color: '#6b7280', icon: '📌' },
];

function getAllTags() {
  const settings = loadSettings();
  const customs = (settings.customTags || []).map(t => ({ ...t, isCustom: true }));
  return [...DEFAULT_TAGS, ...customs];
}

function getTagByName(name) {
  return getAllTags().find(t => t.name === name);
}

// ========== 主渲染入口 ==========
function renderAll() {
  updateDateDisplay();
  updateProgress();
  renderTaskList();
  updateEmptyState();
}

// ========== 日期显示 ==========
function updateDateDisplay() {
  const { label, weekday, isToday } = getDateDisplay(currentDate);
  document.getElementById('dateText').textContent = label;
  document.getElementById('weekday').textContent = weekday;

  const btnToday = document.getElementById('btnToday');
  btnToday.style.display = isToday ? 'none' : 'flex';

  const wsLabel = (typeof currentWorkspace !== 'undefined' && currentWorkspace === 'life') ? '生活' : '工作';
  document.title = isToday ? `📋 ${wsLabel} · 待办清单` : `📋 ${wsLabel} · ${label}`;
}

// ========== 进度条 ==========
function updateProgress() {
  const stats = getStats(currentDate);
  document.getElementById('progressText').textContent =
    `已完成 ${stats.completed}/${stats.total}`;
  document.getElementById('progressPercent').textContent = `${stats.percent}%`;
  document.getElementById('progressFill').style.width = `${stats.percent}%`;
}

// ========== 渲染任务列表 ==========
function renderTaskList() {
  const grouped = getGroupedTasks(currentDate);

  // 星标任务
  renderSection('starredList', grouped.starred);
  document.getElementById('starredSection').style.display = grouped.starred.length > 0 ? '' : 'none';
  document.getElementById('starredCount').textContent = grouped.starred.length;

  // 普通任务（含置顶）
  const normal = [...grouped.pinned, ...grouped.normal];
  renderSection('normalList', normal);
  document.getElementById('normalCount').textContent = normal.length;

  // 已完成
  renderSection('completedList', grouped.completed, true);
  document.getElementById('completedSection').style.display = grouped.completed.length > 0 ? '' : 'none';
  document.getElementById('completedCount').textContent = grouped.completed.length;

  const settings = loadSettings();
  if (!settings.showCompleted && grouped.completed.length > 0) {
    document.getElementById('completedSection').style.display = 'none';
  }
  applyCompletedCollapse(settings.completedCollapsed);
}

function renderSection(listId, tasks, isCompleted = false) {
  const list = document.getElementById(listId);
  list.innerHTML = '';

  tasks.forEach(task => {
    const li = createTaskElement(task, isCompleted);
    list.appendChild(li);
  });
}

// ========== 创建单个任务元素 ==========
function createTaskElement(task, isCompleted) {
  const li = document.createElement('li');
  li.className = 'task-item';
  if (task.completed) li.classList.add('completed');
  li.dataset.id = task.id;
  li.draggable = true;

  // ── 任务行（主内容）──
  const row = document.createElement('div');
  row.className = 'task-row';

  // 拖拽手柄
  const grip = document.createElement('span');
  grip.className = 'task-grip';
  grip.innerHTML = ICONS.grip;
  row.appendChild(grip);

  // 复选框
  const checkbox = document.createElement('span');
  checkbox.className = 'task-checkbox';
  checkbox.innerHTML = task.completed ? ICONS.checkboxChecked : ICONS.checkboxEmpty;
  checkbox.title = task.completed ? '取消完成' : '标记完成';
  row.appendChild(checkbox);

  // 任务文字
  const textEl = document.createElement('span');
  textEl.className = 'task-text';
  textEl.textContent = task.text;
  textEl.style.color = task.color;
  textEl.title = task.text;
  row.appendChild(textEl);

  // 标签
  if (task.tag) {
    const tag = getTagByName(task.tag);
    const tagEl = document.createElement('span');
    tagEl.className = 'task-tag';
    if (tag) {
      tagEl.style.backgroundColor = tag.color + '22';
      tagEl.style.color = tag.color;
      tagEl.textContent = (tag.icon || '📌') + ' ' + tag.name;
    } else {
      tagEl.style.backgroundColor = '#f3f4f6';
      tagEl.style.color = '#6b7280';
      tagEl.textContent = '📌 ' + task.tag;
    }
    row.appendChild(tagEl);
  }

  // 操作按钮组
  const actions = document.createElement('span');
  actions.className = 'task-actions';

  // 颜色按钮
  const colorBtn = createTaskBtn(ICONS.palette, '设置颜色');
  colorBtn.addEventListener('click', (e) => { e.stopPropagation(); openColorModal(task.id); });
  actions.appendChild(colorBtn);

  // 标签按钮
  const tagBtn = createTaskBtn(ICONS.tag, '设置标签');
  tagBtn.addEventListener('click', (e) => { e.stopPropagation(); openTagModal(task.id); });
  actions.appendChild(tagBtn);

  // 提醒按钮
  const bellBtn = createTaskBtn(ICONS.bell, '设置提醒');
  if (task.reminder) bellBtn.style.color = 'var(--accent)';
  bellBtn.addEventListener('click', (e) => { e.stopPropagation(); openReminderModal(task.id); });
  actions.appendChild(bellBtn);

  // 便签按钮
  const noteBtn = createTaskBtn(ICONS.note, task.note ? '编辑便签' : '添加便签');
  if (task.note) noteBtn.classList.add('note-active');
  noteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleNoteArea(li, task);
  });
  actions.appendChild(noteBtn);

  // 置顶按钮
  const pinBtn = createTaskBtn(ICONS.pin, task.pinned ? '取消置顶' : '置顶');
  if (task.pinned) pinBtn.classList.add('pinned');
  pinBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    updateTask(task.id, { pinned: !task.pinned });
    renderAll();
  });
  actions.appendChild(pinBtn);

  // 星标按钮
  const starBtn = createTaskBtn(ICONS.starEmpty, task.starred ? '取消星标' : '星标');
  if (task.starred) {
    starBtn.innerHTML = ICONS.starFilled;
    starBtn.classList.add('starred');
  }
  starBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    updateTask(task.id, { starred: !task.starred });
    renderAll();
  });
  actions.appendChild(starBtn);

  // 删除按钮
  const delBtn = createTaskBtn(ICONS.trash, '删除');
  delBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteTaskWithUndo(task.id);
  });
  actions.appendChild(delBtn);

  row.appendChild(actions);
  li.appendChild(row);

  // ── 便签区域（展开式）──
  const noteWrapper = document.createElement('div');
  noteWrapper.className = 'task-note-wrapper';
  noteWrapper.style.display = 'none';

  const noteTextarea = document.createElement('textarea');
  noteTextarea.className = 'task-note-textarea';
  noteTextarea.placeholder = '📝 添加备注...';
  noteTextarea.value = task.note || '';
  noteTextarea.rows = 2;

  // 自动调整高度
  const autoResize = () => {
    noteTextarea.style.height = 'auto';
    noteTextarea.style.height = noteTextarea.scrollHeight + 'px';
  };
  noteTextarea.addEventListener('input', autoResize);

  // 自动保存
  const saveNote = () => {
    const newNote = noteTextarea.value.trim();
    const currentTask = getTaskById(task.id);
    if (currentTask && currentTask.note !== newNote) {
      updateTask(task.id, { note: newNote });
      // 更新按钮状态
      const btn = li.querySelector('.note-active');
      if (newNote) {
        if (!btn) noteBtn.classList.add('note-active');
        noteBtn.title = '编辑便签';
      } else {
        if (btn) btn.classList.remove('note-active');
        noteBtn.title = '添加便签';
      }
      // 同步更新 task 对象引用
      task.note = newNote;
    }
  };
  noteTextarea.addEventListener('blur', saveNote);
  noteTextarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      noteTextarea.value = task.note || '';
      noteTextarea.blur();
      noteWrapper.style.display = 'none';
    }
  });

  noteWrapper.appendChild(noteTextarea);
  li.appendChild(noteWrapper);

  // 双击编辑任务文字
  li.addEventListener('dblclick', (e) => {
    if (e.target.closest('.task-actions') || e.target.closest('.task-checkbox') ||
        e.target.closest('.task-tag') || e.target.closest('.task-grip') ||
        e.target.closest('.task-note-wrapper')) return;
    startEditTask(li, task);
  });

  // 点击复选框
  checkbox.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTaskComplete(task, checkbox);
  });

  return li;
}

// ========== 切换便签展开/收起 ==========
function toggleNoteArea(li, task) {
  const wrapper = li.querySelector('.task-note-wrapper');
  const textarea = wrapper.querySelector('.task-note-textarea');
  const isVisible = wrapper.style.display !== 'none';

  if (isVisible) {
    wrapper.style.display = 'none';
  } else {
    wrapper.style.display = 'block';
    textarea.value = task.note || '';
    textarea.focus();
    // 调整高度
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }
}

function createTaskBtn(iconHtml, title) {
  const btn = document.createElement('button');
  btn.className = 'task-btn';
  btn.innerHTML = iconHtml;
  btn.title = title;
  return btn;
}

// ========== 切换完成状态 ==========
function toggleTaskComplete(task, checkboxEl) {
  const newState = !task.completed;
  updateTask(task.id, { completed: newState });

  // 动画
  if (newState && checkboxEl) {
    checkboxEl.classList.add('just-checked');
    setTimeout(() => checkboxEl.classList.remove('just-checked'), 350);
  }

  // 如果是"仅未完成"筛选且刚完成了任务，延迟重渲染
  if (currentFilter === 'active' && newState) {
    setTimeout(() => renderAll(), 400);
  } else if (currentFilter === 'completed' && !newState) {
    setTimeout(() => renderAll(), 400);
  } else {
    renderAll();
  }
}

// ========== 编辑任务 ==========
function startEditTask(li, task) {
  const textEl = li.querySelector('.task-text');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'task-edit-input';
  input.value = task.text;
  input.style.color = task.color;

  textEl.replaceWith(input);
  input.focus();
  input.select();

  const finish = () => {
    const newText = input.value.trim();
    if (newText && newText !== task.text) {
      updateTask(task.id, { text: newText });
      renderAll();
    } else if (!newText) {
      deleteTaskWithUndo(task.id);
    } else {
      renderAll();
    }
  };

  input.addEventListener('blur', finish);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = task.text; input.blur(); }
  });
}

// ========== 删除 & 撤销 ==========
let undoTimeout = null;
let lastDeletedTask = null;

function deleteTaskWithUndo(id) {
  const task = deleteTask(id);
  if (!task) return;

  lastDeletedTask = task;
  renderAll();
  showUndoToast(task);

  clearTimeout(undoTimeout);
  undoTimeout = setTimeout(() => {
    lastDeletedTask = null;
    hideUndoToast();
  }, 4000);
}

function showUndoToast(task) {
  const toast = document.getElementById('undoToast');
  document.getElementById('undoText').textContent = `已删除「${task.text.substring(0, 15)}${task.text.length > 15 ? '...' : ''}」`;
  toast.style.display = 'flex';
}

function hideUndoToast() {
  document.getElementById('undoToast').style.display = 'none';
}

function undoDelete() {
  if (lastDeletedTask) {
    addTask(lastDeletedTask.text, lastDeletedTask.date);
    // 恢复原属性
    const tasks = getAllTasks();
    const restored = tasks[tasks.length - 1];
    if (restored) {
      updateTask(restored.id, {
        starred: lastDeletedTask.starred,
        pinned: lastDeletedTask.pinned,
        color: lastDeletedTask.color,
        tag: lastDeletedTask.tag,
        order: lastDeletedTask.order,
        reminder: lastDeletedTask.reminder,
        note: lastDeletedTask.note,
        carriedFrom: lastDeletedTask.carriedFrom
      });
    }
    lastDeletedTask = null;
  }
  clearTimeout(undoTimeout);
  hideUndoToast();
  renderAll();
}

// ========== 空状态 ==========
function updateEmptyState() {
  const grouped = getGroupedTasks(currentDate);
  const total = grouped.starred.length + grouped.normal.length +
                grouped.pinned.length + grouped.completed.length;
  document.getElementById('emptyState').style.display = total === 0 ? 'flex' : 'none';
}

// ========== 标签辅助 ==========
function getTagClass(tagName) {
  return 'tag-custom';
}

function getTagIcon(tagName) {
  const tag = getTagByName(tagName);
  return tag ? tag.icon : '';
}

// ========== 筛选按钮 ==========
function updateFilterButtons() {
  const buttons = document.querySelectorAll('.btn-filter');
  buttons.forEach(b => {
    b.classList.toggle('active', b.dataset.filter === currentFilter);
  });
}

// ========== 颜色选择器弹窗 ==========
function openColorModal(taskId) {
  currentColorTaskId = taskId;
  const task = getTaskById(taskId);
  const modal = document.getElementById('colorModal');
  const grid = document.getElementById('colorGrid');

  grid.innerHTML = '';
  COLOR_PRESETS.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = color;
    if (task && task.color === color) swatch.classList.add('selected');
    swatch.addEventListener('click', () => {
      grid.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
    });
    grid.appendChild(swatch);
  });

  document.getElementById('customColor').value = task ? task.color : '#333333';
  document.getElementById('customColorHex').textContent = task ? task.color : '#333333';

  document.getElementById('customColor').addEventListener('input', function () {
    document.getElementById('customColorHex').textContent = this.value;
    grid.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  });

  modal.style.display = 'flex';
}

function closeColorModal() {
  document.getElementById('colorModal').style.display = 'none';
  currentColorTaskId = null;
}

function applyColor() {
  if (!currentColorTaskId) return;
  const selected = document.querySelector('#colorGrid .color-swatch.selected');
  let color;
  if (selected) {
    color = selected.style.backgroundColor;
    // 转换 rgb 到 hex
    color = rgbToHex(color);
  } else {
    color = document.getElementById('customColor').value;
  }
  updateTask(currentColorTaskId, { color });
  closeColorModal();
  renderAll();
}

function rgbToHex(rgb) {
  if (rgb.startsWith('#')) return rgb;
  const match = rgb.match(/[\d.]+/g);
  if (!match || match.length < 3) return '#333333';
  return '#' + match.slice(0, 3).map(x => {
    const hex = parseInt(x).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

// ========== 标签选择器弹窗 ==========
function openTagModal(taskId) {
  currentTagTaskId = taskId;
  const task = getTaskById(taskId);
  const modal = document.getElementById('tagModal');
  const grid = document.getElementById('tagGrid');

  const allTags = getAllTags();
  grid.innerHTML = '';

  allTags.forEach(tag => {
    const option = document.createElement('span');
    option.className = 'tag-option';
    option.style.backgroundColor = tag.color + '18';
    option.style.color = tag.color;
    option.style.borderColor = tag.color + '40';
    option.dataset.tagName = tag.name;
    if (task && task.tag === tag.name) option.classList.add('selected');
    option.textContent = (tag.icon || '📌') + ' ' + tag.name;
    if (tag.isCustom) {
      const delBtn = document.createElement('span');
      delBtn.className = 'tag-delete-btn';
      delBtn.textContent = '×';
      delBtn.title = '删除此标签';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('确定删除自定义标签「' + tag.name + '」？')) {
          deleteCustomTag(tag.name);
          openTagModal(taskId); // refresh
          renderAll();
        }
      });
      option.appendChild(delBtn);
    }
    option.addEventListener('click', (e) => {
      if (e.target.classList.contains('tag-delete-btn')) return;
      grid.querySelectorAll('.tag-option').forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
    });
    grid.appendChild(option);
  });

  // "New tag" button
  const newTagBtn = document.createElement('div');
  newTagBtn.className = 'tag-option tag-new-btn';
  newTagBtn.textContent = '+ 新建标签';
  newTagBtn.addEventListener('click', () => {
    showNewTagForm(grid);
  });
  grid.appendChild(newTagBtn);

  modal.style.display = 'flex';
}

function showNewTagForm(grid) {
  // Replace the + button with a form
  const newBtn = grid.querySelector('.tag-new-btn');
  if (!newBtn) return;

  const form = document.createElement('div');
  form.className = 'new-tag-form';
  form.innerHTML = `
    <input type="text" class="new-tag-name" placeholder="标签名称" maxlength="10" autofocus>
    <input type="color" class="new-tag-color" value="#6366f1">
    <div class="new-tag-icons">
      ${['💼','👤','📚','🔥','💪','📌','🎯','💡','⭐','🔔','🏠','🎮','💰','✈️','🎵','📝'].map(icon =>
        `<span class="icon-option" data-icon="${icon}">${icon}</span>`
      ).join('')}
    </div>
    <div class="new-tag-actions">
      <button class="btn btn-secondary btn-small cancel-new-tag">取消</button>
      <button class="btn btn-primary btn-small confirm-new-tag">创建</button>
    </div>
  `;

  newBtn.replaceWith(form);

  // Icon selection
  form.querySelectorAll('.icon-option').forEach(el => {
    el.addEventListener('click', () => {
      form.querySelectorAll('.icon-option').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
    });
  });
  // Select first icon by default
  const firstIcon = form.querySelector('.icon-option');
  if (firstIcon) firstIcon.classList.add('selected');

  // Cancel
  form.querySelector('.cancel-new-tag').addEventListener('click', () => {
    form.replaceWith(newBtn);
  });

  // Confirm
  form.querySelector('.confirm-new-tag').addEventListener('click', () => {
    const name = form.querySelector('.new-tag-name').value.trim();
    const color = form.querySelector('.new-tag-color').value;
    const selectedIcon = form.querySelector('.icon-option.selected');
    const icon = selectedIcon ? selectedIcon.dataset.icon : '📌';

    if (!name) { alert('请输入标签名称'); return; }
    if (getAllTags().find(t => t.name === name)) { alert('标签名已存在'); return; }

    addCustomTag({ name, color, icon });
    // Refresh the tag modal
    const taskId = currentTagTaskId;
    closeTagModal();
    if (taskId) openTagModal(taskId);
  });

  // Focus name input
  setTimeout(() => form.querySelector('.new-tag-name').focus(), 100);
}

// ========== Custom Tag CRUD ==========
function addCustomTag(tag) {
  const settings = loadSettings();
  if (!settings.customTags) settings.customTags = [];
  settings.customTags.push(tag);
  saveSettings(settings);
}

function deleteCustomTag(tagName) {
  const settings = loadSettings();
  settings.customTags = (settings.customTags || []).filter(t => t.name !== tagName);
  // Remove this tag from all tasks using it
  const data = loadData();
  data.tasks.forEach(t => { if (t.tag === tagName) t.tag = null; });
  saveData(data);
  saveSettings(settings);
}

function closeTagModal() {
  document.getElementById('tagModal').style.display = 'none';
  currentTagTaskId = null;
}

function applyTag(tagName) {
  if (!currentTagTaskId) return;
  updateTask(currentTagTaskId, { tag: tagName });
  closeTagModal();
  renderAll();
}

// ========== 提醒弹窗 ==========
function openReminderModal(taskId) {
  currentReminderTaskId = taskId;
  const task = getTaskById(taskId);
  document.getElementById('reminderTime').value = task?.reminder || '';
  document.getElementById('reminderModal').style.display = 'flex';
}

function closeReminderModal() {
  document.getElementById('reminderModal').style.display = 'none';
  currentReminderTaskId = null;
}

function applyReminder(time) {
  if (!currentReminderTaskId) return;
  updateTask(currentReminderTaskId, { reminder: time || null, _reminderFired: false });
  closeReminderModal();
  renderAll();
}

// ========== 设置弹窗 ==========
function openSettingsModal() {
  const settings = loadSettings();
  document.getElementById('settingFontSize').value = settings.fontSize;
  document.getElementById('settingShowCompleted').checked = settings.showCompleted;
  document.getElementById('settingCollapseCompleted').checked = settings.completedCollapsed;
  document.getElementById('settingAutoCarryOver').checked = settings.autoCarryOver !== false;
  document.getElementById('settingsModal').style.display = 'flex';
}

function closeSettingsModal() {
  document.getElementById('settingsModal').style.display = 'none';
}

function applySettings() {
  const settings = {
    fontSize: document.getElementById('settingFontSize').value,
    showCompleted: document.getElementById('settingShowCompleted').checked,
    completedCollapsed: document.getElementById('settingCollapseCompleted').checked,
    autoCarryOver: document.getElementById('settingAutoCarryOver').checked
  };
  saveSettings(settings);
  applyAppSettings(settings);
  closeSettingsModal();
  renderAll();
}

function applyAppSettings(settings) {
  document.documentElement.setAttribute('data-font', settings.fontSize);
  document.documentElement.setAttribute('data-theme', settings.theme || 'light');
}

function applyCompletedCollapse(collapsed) {
  const completedList = document.getElementById('completedList');
  const arrow = document.getElementById('collapseArrow');
  if (collapsed) {
    completedList.style.display = 'none';
    arrow.classList.add('collapsed');
  } else {
    completedList.style.display = '';
    arrow.classList.remove('collapsed');
  }
}

// ========== 主题切换 ==========
function toggleTheme() {
  const settings = loadSettings();
  const newTheme = settings.theme === 'dark' ? 'light' : 'dark';
  settings.theme = newTheme;
  saveSettings(settings);
  document.documentElement.setAttribute('data-theme', newTheme);
  document.getElementById('btnTheme').innerHTML = newTheme === 'dark' ? '☀️ 日间' : '🌙 夜间';
}

// ========== 初始化外观 ==========
function initAppearance() {
  const settings = loadSettings();
  document.documentElement.setAttribute('data-theme', settings.theme);
  document.documentElement.setAttribute('data-font', settings.fontSize);
  document.getElementById('btnTheme').innerHTML = settings.theme === 'dark' ? '☀️ 日间' : '🌙 夜间';
  applyCompletedCollapse(settings.completedCollapsed);
}

// ========== 日历渲染 ==========

function renderCalendar(year, month) {
  // 更新标题
  document.getElementById('calendarMonthTitle').textContent = year + '年 ' + (month + 1) + '月';

  // 本月统计
  const monthData = getMonthData(year, month);
  const total = monthData.total;
  const done = monthData.done;
  const statsEl = document.getElementById('calendarMonthStats');
  if (total > 0) {
    statsEl.textContent = '本月共 ' + total + ' 个任务，已完成 ' + done + ' 个 (' + Math.round(done/total*100) + '%)';
  } else {
    statsEl.textContent = '本月暂无任务';
  }

  // 渲染日历格子
  const grid = document.getElementById('calendarGrid');
  // 清除旧格子（保留 weekday 头）
  grid.querySelectorAll('.calendar-day').forEach(el => el.remove());

  const today = getTodayStr();
  const firstDay = new Date(year, month, 1).getDay(); // 1号是周几 (0=Sun)
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  // 上月剩余日期
  for (let i = firstDay - 1; i >= 0; i--) {
    const day = prevMonthDays - i;
    const m = month === 0 ? 11 : month - 1;
    const y = month === 0 ? year - 1 : year;
    const dateStr = formatDateStr(new Date(y, m, day));
    const cell = createCalendarDay(day, dateStr, true, monthData);
    grid.appendChild(cell);
  }

  // 当月日期
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = formatDateStr(new Date(year, month, day));
    const isToday = dateStr === today;
    const cell = createCalendarDay(day, dateStr, false, monthData, isToday);
    grid.appendChild(cell);
  }

  // 下月填充（补齐到 6 行）
  const totalCells = firstDay + daysInMonth;
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let day = 1; day <= remaining; day++) {
    const m = month === 11 ? 0 : month + 1;
    const y = month === 11 ? year + 1 : year;
    const dateStr = formatDateStr(new Date(y, m, day));
    const cell = createCalendarDay(day, dateStr, true, monthData);
    grid.appendChild(cell);
  }

  // 底部统计（默认显示今天）
  updateCalendarFooter(today);
}

function getMonthData(year, month) {
  const allTasks = getAllTasks();
  const dayMap = {};
  let total = 0, done = 0;

  for (let day = 1; day <= 31; day++) {
    const dateStr = formatDateStr(new Date(year, month, day));
    const tasks = allTasks.filter(t => t.date === dateStr);
    if (tasks.length > 0) {
      const completed = tasks.filter(t => t.completed).length;
      total += tasks.length;
      done += completed;
      dayMap[dateStr] = {
        total: tasks.length,
        completed,
        status: completed === tasks.length ? 'done' : (completed > 0 ? 'partial' : 'none')
      };
    }
  }

  return { total, done, dayMap };
}

function createCalendarDay(dayNum, dateStr, isOtherMonth, monthData, isToday) {
  const cell = document.createElement('div');
  cell.className = 'calendar-day';
  cell.dataset.date = dateStr;
  if (isOtherMonth) cell.classList.add('other-month');
  if (isToday) cell.classList.add('today');

  const numEl = document.createElement('span');
  numEl.className = 'calendar-day-num';
  numEl.textContent = dayNum;
  cell.appendChild(numEl);

  // 任务标记点
  const info = monthData.dayMap[dateStr];
  const dotsEl = document.createElement('div');
  dotsEl.className = 'calendar-day-dots';

  if (info && info.total > 0) {
    const dot = document.createElement('span');
    dot.className = 'calendar-dot ' + info.status;
    dotsEl.appendChild(dot);

    // 显示任务数
    if (info.total > 1) {
      const countEl = document.createElement('span');
      countEl.className = 'calendar-task-count';
      countEl.textContent = info.total;
      cell.appendChild(countEl);
    }
  }
  cell.appendChild(dotsEl);

  // 点击跳转到清单视图
  cell.addEventListener('click', () => {
    if (isOtherMonth) {
      // 跳转到对应月份
      const d = parseDateStr(dateStr);
      calendarYear = d.getFullYear();
      calendarMonth = d.getMonth();
      renderCalendar(calendarYear, calendarMonth);
      return;
    }
    // 选中高亮
    document.querySelectorAll('.calendar-day.selected').forEach(el => el.classList.remove('selected'));
    cell.classList.add('selected');
    updateCalendarFooter(dateStr);
  });

  // 双击：跳转清单
  cell.addEventListener('dblclick', () => {
    if (isOtherMonth) return;
    goToListView(dateStr);
  });

  return cell;
}

function updateCalendarFooter(dateStr) {
  const { label } = getDateDisplay(dateStr);
  const tasks = getTasksByDate(dateStr);
  const total = tasks.length;
  const done = tasks.filter(t => t.completed).length;
  const el = document.getElementById('calendarFooterStats');

  if (total === 0) {
    el.textContent = label + ' · 暂无任务（双击日期添加任务）';
  } else if (done === total) {
    el.textContent = '🟢 ' + label + ' · ' + total + ' 个任务，全部完成 ✅';
  } else {
    el.textContent = '🟠 ' + label + ' · ' + total + ' 个任务，已完成 ' + done + ' 个';
  }
}

function goToListView(dateStr) {
  currentDate = dateStr;
  switchView('list');
  renderAll();
  // 滚动到顶部
  document.getElementById('app').scrollIntoView({ behavior: 'smooth' });
}
