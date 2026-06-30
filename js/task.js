/**
 * task.js — 任务数据模型 & CRUD 操作
 * 每日待办事项清单
 */

// ========== 全局状态 ==========
let currentDate = getTodayStr();
let currentFilter = 'all';
let searchQuery = '';
let currentView = 'list';           // 'list' | 'calendar'
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth(); // 0-11
let currentColorTaskId = null;    // 正在编辑颜色的任务 ID
let currentTagTaskId = null;     // 正在编辑标签的任务 ID
let currentReminderTaskId = null; // 正在设置提醒的任务 ID

// ========== 基础 CRUD ==========

function getAllTasks() {
  return loadData().tasks;
}

function getTasksByDate(dateStr) {
  return getAllTasks()
    .filter(t => t.date === dateStr)
    .sort((a, b) => {
      // 排序规则：置顶 > order > createdAt
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.order - b.order || new Date(a.createdAt) - new Date(b.createdAt);
    });
}

function getTaskById(id) {
  return getAllTasks().find(t => t.id === id) || null;
}

function addTask(text, dateStr) {
  autoBackup();
  const data = loadData();
  const tasksForDay = data.tasks.filter(t => t.date === dateStr);
  const maxOrder = tasksForDay.length > 0 ? Math.max(...tasksForDay.map(t => t.order)) : -1;

  const task = {
    id: generateId(),
    text: text.trim(),
    completed: false,
    completedAt: null,
    starred: false,
    pinned: false,
    color: '#333333',
    tag: null,
    date: dateStr,
    order: maxOrder + 1,
    reminder: null,
    note: '',
    createdAt: new Date().toISOString()
  };

  data.tasks.push(task);
  saveData(data);
  return task;
}

function updateTask(id, updates) {
  autoBackup();
  const data = loadData();
  const task = data.tasks.find(t => t.id === id);
  if (!task) return null;

  if ('completed' in updates) {
    task.completed = updates.completed;
    task.completedAt = updates.completed ? new Date().toISOString() : null;
  }

  const simpleKeys = ['text', 'starred', 'pinned', 'color', 'tag', 'date', 'order', 'reminder', 'note', 'carriedFrom'];
  simpleKeys.forEach(k => {
    if (k in updates && k !== 'completed') task[k] = updates[k];
  });

  saveData(data);
  return task;
}

function deleteTask(id) {
  autoBackup();
  const data = loadData();
  const index = data.tasks.findIndex(t => t.id === id);
  if (index === -1) return null;
  const deleted = data.tasks.splice(index, 1)[0];
  saveData(data);
  return deleted;
}

function deleteTasks(ids) {
  autoBackup();
  const data = loadData();
  const deleted = [];
  ids.forEach(id => {
    const index = data.tasks.findIndex(t => t.id === id);
    if (index !== -1) deleted.push(data.tasks.splice(index, 1)[0]);
  });
  saveData(data);
  return deleted;
}

// ========== 批量操作 ==========

function toggleAllComplete(dateStr, completed) {
  autoBackup();
  const data = loadData();
  const now = new Date().toISOString();
  data.tasks.forEach(t => {
    if (t.date === dateStr) {
      t.completed = completed;
      t.completedAt = completed ? now : null;
    }
  });
  saveData(data);
}

// ========== 未完成任务衍生：所有过去未完成 → 今天 ==========
function carryOverFromYesterday(targetDate) {
  const data = loadData();
  const settings = data.settings;

  // 检查是否已开启
  if (!settings.autoCarryOver) {
    console.log('[衍生] 自动衍生功能未开启，跳过');
    return 0;
  }

  // 收集所有过去日期中未完成的任务
  const pastUnfinished = data.tasks.filter(t =>
    t.date < targetDate && !t.completed
  );

  if (pastUnfinished.length === 0) {
    settings.lastCarryOverDate = targetDate;
    saveData(data);
    console.log('[衍生] 没有未完成的过去任务，跳过');
    return 0;
  }

  console.log(`[衍生] 发现 ${pastUnfinished.length} 个过去未完成任务，开始去重...`);

  // 按原始来源去重：每个原始任务只衍生一份到今日
  // sourceId = carriedFrom（副本指向原始 ID）或自身 id（原始任务）
  const seenSourceIds = new Set();
  const toCarryOver = [];
  pastUnfinished.forEach(t => {
    const sourceId = t.carriedFrom || t.id;
    if (!seenSourceIds.has(sourceId)) {
      seenSourceIds.add(sourceId);
      toCarryOver.push({ task: t, sourceId: sourceId });
    }
  });

  console.log(`[衍生] 去重后 ${toCarryOver.length} 个来源: ${[...seenSourceIds].join(', ')}`);

  // 今天已有的**未完成**衍生副本的来源 ID（避免重复衍生）
  // 关键：只跳过今天已有未完成副本的来源；如果今天的副本已完成，允许重新衍生
  const todayCarriedFromIds = new Set(
    data.tasks
      .filter(t => t.date === targetDate && t.carriedFrom && !t.completed)
      .map(t => t.carriedFrom)
  );

  console.log(`[衍生] 今天已有未完成衍生副本的来源: ${[...todayCarriedFromIds].join(', ') || '(无)'}`);

  const todayTasks = data.tasks.filter(t => t.date === targetDate);
  const maxOrder = todayTasks.length > 0 ? Math.max(...todayTasks.map(t => t.order)) : -1;

  let count = 0;
  toCarryOver.forEach(({ task, sourceId }, i) => {
    if (!todayCarriedFromIds.has(sourceId)) {
      const newTask = {
        id: generateId(),
        text: task.text,
        completed: false,
        completedAt: null,
        starred: task.starred,
        pinned: task.pinned,
        color: task.color,
        tag: task.tag,
        date: targetDate,
        order: maxOrder + count + 1,
        reminder: null,            // 不继承提醒时间
        note: task.note || '',    // 继承便签
        createdAt: new Date().toISOString(),
        carriedFrom: sourceId      // 始终指向原始任务 ID
      };
      data.tasks.push(newTask);
      count++;
    } else {
      console.log(`[衍生] 跳过来源 ${sourceId}：今天已有未完成副本`);
    }
  });

  settings.lastCarryOverDate = targetDate;
  saveData(data);
  console.log(`[衍生] 完成！共衍生 ${count} 个任务到 ${targetDate}`);
  return count;
}

function clearCompleted(dateStr) {
  autoBackup();
  const data = loadData();
  data.tasks = data.tasks.filter(t => !(t.date === dateStr && t.completed));
  saveData(data);
}

function clearAllData() {
  localStorage.clear();
}

// ========== 排序 & 重排 ==========

function reorderTask(id, newOrder, dateStr) {
  const data = loadData();
  const dayTasks = data.tasks.filter(t => t.date === dateStr && t.id !== id).sort((a, b) => a.order - b.order);
  const task = data.tasks.find(t => t.id === id);
  if (!task) return;

  // 插入到新位置
  dayTasks.splice(newOrder, 0, task);
  // 重新分配 order
  dayTasks.forEach((t, i) => { t.order = i; });

  saveData(data);
}

// ========== 筛选 & 搜索 ==========

function getFilteredTasks(dateStr, filter, query) {
  let tasks = getTasksByDate(dateStr);

  // 按筛选条件
  if (filter === 'completed') {
    tasks = tasks.filter(t => t.completed);
  } else if (filter === 'active') {
    tasks = tasks.filter(t => !t.completed);
  } else if (filter === 'starred') {
    tasks = tasks.filter(t => t.starred);
  }

  // 按搜索关键词
  if (query && query.trim()) {
    const q = query.trim().toLowerCase();
    tasks = tasks.filter(t => t.text.toLowerCase().includes(q));
  }

  return tasks;
}

function getGroupedTasks(dateStr) {
  const tasks = getFilteredTasks(dateStr, currentFilter, searchQuery);
  return {
    starred: tasks.filter(t => t.starred && !t.completed),
    normal: tasks.filter(t => !t.starred && !t.completed && !t.pinned),
    pinned: tasks.filter(t => t.pinned && !t.starred && !t.completed),
    completed: tasks.filter(t => t.completed)
  };
}

// ========== 统计数据 ==========

function getStats(dateStr) {
  const all = getTasksByDate(dateStr);
  const total = all.length;
  const completed = all.filter(t => t.completed).length;
  const starred = all.filter(t => t.starred && !t.completed).length;
  return { total, completed, active: total - completed, starred, percent: total > 0 ? Math.round((completed / total) * 100) : 0 };
}

// ========== 提醒功能 ==========

function checkReminders() {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const today = getTodayStr();

  const tasks = getAllTasks().filter(t =>
    t.date === today &&
    !t.completed &&
    t.reminder === currentTime &&
    !t._reminderFired
  );

  tasks.forEach(t => {
    new Notification('📋 待办提醒', {
      body: t.text,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📋</text></svg>',
      tag: t.id,
      requireInteraction: true
    });
    // 标记已触发，避免重复提醒
    const data = loadData();
    const task = data.tasks.find(x => x.id === t.id);
    if (task) task._reminderFired = true;
    saveData(data);
  });
}
