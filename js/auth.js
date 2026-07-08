/**
 * auth.js — 用户认证 & 数据同步
 * 每日待办事项清单 — 账号系统
 */

let syncDebounceTimer = null;
const SYNC_DEBOUNCE_MS = 2000; // 2 秒后台上传
let authMandatory = false; // 是否强制登录（未登录时不能关闭弹窗）

// ========== 注册 ==========
async function authSignUp(email, password) {
  const client = initSupabase();
  if (!client) return { error: 'Supabase 未初始化' };

  const { data, error } = await client.auth.signUp({ email, password });
  console.log('[Auth] signUp result:', { user: !!data.user, session: !!data.session, error: error?.message });

  if (error) {
    // 翻译常见错误
    const msg = error.message.includes('already registered')
      ? '该邮箱已注册，请直接登录'
      : error.message.includes('password')
        ? '密码长度至少 6 位'
        : error.message;
    return { error: msg };
  }

  if (data.user && data.session) {
    // 邮箱确认已关闭，直接登录
    return { user: data.user };
  }

  if (data.user && !data.session) {
    // 需要邮箱确认——但是用户已经创建，提示去查收邮件
    return { needConfirm: true, email: email };
  }

  return { error: '注册失败，请稍后重试' };
}

// ========== 登录 ==========
async function authSignIn(email, password) {
  const client = initSupabase();
  if (!client) return { error: 'Supabase 未初始化' };

  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    const msg = error.message.includes('Invalid login')
      ? '邮箱或密码错误'
      : error.message;
    return { error: msg };
  }

  return { user: data.user };
}

// ========== 登出 ==========
async function authSignOut() {
  if (!confirm('确定要退出登录吗？\n退出后需重新登录才能使用。')) return;
  const client = initSupabase();
  if (!client) return;
  await client.auth.signOut();
  updateAuthUI(null);
  console.log('[Auth] 已登出');
}

// ========== 忘记密码 ==========
async function authResetPassword(email) {
  const client = initSupabase();
  if (!client) return { error: 'Supabase 未初始化' };

  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname + '?reset'
  });

  if (error) {
    return { error: '发送失败：' + error.message };
  }

  return { success: '重置邮件已发送，请查收邮箱' };
}

// ========== 会话恢复 ==========
async function restoreSession() {
  const client = initSupabase();
  if (!client) return null;

  const { data: { session } } = await client.auth.getSession();
  return session;
}

// ========== 同步状态指示 ==========
function updateSyncStatus(state) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  const icons = { synced: '☁️', syncing: '🔄', offline: '⚠️', error: '❌' };
  const titles = { synced: '已同步', syncing: '同步中…', offline: '离线', error: '同步失败' };
  el.textContent = icons[state] || '';
  el.title = titles[state] || '';
  el.className = 'sync-status sync-' + state;
}

// ========== 同步调试面板 ==========
let _syncDebugLog = [];
function syncDebug(msg, level) {
  // level: 'ok' | 'warn' | 'error' | 'info'
  level = level || 'info';
  _syncDebugLog.push({ msg, level, time: new Date().toLocaleTimeString() });
  if (_syncDebugLog.length > 20) _syncDebugLog.shift();

  const bar = document.getElementById('syncDebugBar');
  const icon = document.getElementById('syncDebugIcon');
  const text = document.getElementById('syncDebugText');
  if (!bar || !text) return;

  const icons = { ok: '✅', warn: '⚠️', error: '❌', info: '🔍' };
  if (icon) icon.textContent = icons[level] || '🔍';
  text.textContent = msg;
  bar.className = 'sync-debug-bar ' + (level === 'info' ? '' : level);

  // 点击查看完整日志
  bar.title = _syncDebugLog.map(l => `[${l.time}] ${l.msg}`).join('\n');

  console.log('[SyncDebug] ' + msg);
}

// ========== 同步：云端 → 本地（拉取） ==========
// 返回值：'pulled' | 'pushed' | 'no_data' | 'error'
let _pullDebounceTimer = null;
async function pullFromCloudIfNeeded() {
  clearTimeout(_pullDebounceTimer);
  _pullDebounceTimer = setTimeout(async () => {
    const result = await syncFromCloud();
    if (result === 'pulled') {
      currentDate = getTodayStr();
      renderAll();
      if (currentView === 'calendar') {
        renderCalendar(calendarYear, calendarMonth);
      }
    }
  }, 500);
}
async function syncFromCloud() {
  syncDebug('开始同步...', 'info');
  const result = await cloudPull();

  // 网络错误 / SDK 未加载 / 未登录 → 保持本地数据不变
  if (!result) {
    syncDebug('同步失败：云端不可达', 'error');
    updateSyncStatus('offline');
    return 'error';
  }

  // 新用户：云端还没有数据行
  if (!result.data) {
    syncDebug('云端无数据，判定为新用户', 'warn');
    return 'no_data';
  }

  const remote = result.data;
  const local = loadData();
  const localUpdated = local.settings._localUpdated || '1970-01-01T00:00:00Z';

  // 防御：如果云端没有 updated_at，视为新数据
  const remoteUpdated = remote.updated_at || new Date().toISOString();

  if (remoteUpdated > localUpdated) {
    // 云端更新 → 合并到本地
    const merged = {
      tasks: remote.tasks,
      settings: { ...remote.settings, _localUpdated: remoteUpdated }
    };
    saveData(merged);
    updateSyncStatus('synced');
    syncDebug('云端→本地：' + remote.tasks.length + ' 个任务', 'ok');
    return 'pulled';
  }

  // 本地更新 → 上传到云端
  const settings = { ...local.settings };
  settings._localUpdated = new Date().toISOString();
  saveData({ tasks: local.tasks, settings });
  await cloudPush(local.tasks, settings);
  updateSyncStatus('synced');
  syncDebug('本地→云端：' + local.tasks.length + ' 个任务', 'ok');
  return 'pushed';
}

// ========== 同步：本地 → 云端（防抖） ==========
function syncToCloud() {
  updateSyncStatus('syncing');
  clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(async () => {
    const data = loadData();
    const settings = { ...data.settings };
    settings._localUpdated = new Date().toISOString();
    saveData({ tasks: data.tasks, settings });

    const ok = await cloudPush(data.tasks, settings);
    if (ok) {
      updateSyncStatus('synced');
    } else {
      updateSyncStatus('offline');
    }
  }, SYNC_DEBOUNCE_MS);
}

// ========== 更新登录状态 UI ==========
function updateAuthUI(session) {
  const loginBar = document.getElementById('authBar');
  const userInfo = document.getElementById('authUserInfo');
  const userEmail = document.getElementById('authUserEmail');
  const loginBtn = document.getElementById('btnShowAuth');
  const logoutBtn = document.getElementById('btnLogout');

  if (!loginBar || !userInfo || !loginBtn || !logoutBtn) return;

  if (session && session.user) {
    userInfo.style.display = 'flex';
    loginBtn.style.display = 'none';
    if (userEmail) userEmail.textContent = session.user.email;
    logoutBtn.style.display = '';
  } else {
    userInfo.style.display = 'none';
    loginBtn.style.display = 'none'; // 隐藏登录按钮，弹窗强制显示
    logoutBtn.style.display = 'none';
    showAuthModal(true); // 退出后强制登录
  }
}

// ========== 显示登录弹窗 ==========
// mandatory=true 时关闭按钮隐藏，用户无法跳过登录
function showAuthModal(mandatory) {
  authMandatory = !!mandatory;
  const modal = document.getElementById('authModal');
  const closeBtn = document.getElementById('btnAuthClose');
  if (modal) {
    modal.style.display = 'flex';
    if (closeBtn) closeBtn.style.display = authMandatory ? 'none' : '';
    document.getElementById('authEmail').focus();
    document.getElementById('authError').textContent = '';
    document.getElementById('authSuccess').textContent = '';
  }
  // 重置加载状态
  setAuthLoading(false);
  // 重置密码可见
  const pwdField = document.getElementById('authPassword');
  if (pwdField) { pwdField.type = 'password'; }
  const toggleBtn = document.getElementById('btnTogglePwd');
  if (toggleBtn) { toggleBtn.textContent = '👁'; }
  // Enter 键提交
  if (pwdField && !pwdField._enterBound) {
    pwdField._enterBound = true;
    pwdField.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') handleAuthSubmit();
    });
  }
}

// ========== 隐藏登录弹窗 ==========
function hideAuthModal() {
  if (authMandatory) return; // 强制登录中，不能关闭
  const modal = document.getElementById('authModal');
  if (modal) modal.style.display = 'none';
}

// ========== 按钮加载状态 ==========
function setAuthLoading(loading) {
  const btn = document.getElementById('authSubmitBtn');
  const email = document.getElementById('authEmail');
  const pwd = document.getElementById('authPassword');
  if (btn) {
    btn.disabled = loading;
    btn.textContent = loading ? '⏳ 处理中...' : (document.getElementById('authModeRegister').checked ? '注册' : '登录');
  }
  if (email) email.disabled = loading;
  if (pwd) pwd.disabled = loading;
}

// ========== 处理登录/注册 ==========
async function handleAuthSubmit() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const isRegister = document.getElementById('authModeRegister').checked;
  const errorEl = document.getElementById('authError');
  const successEl = document.getElementById('authSuccess');

  errorEl.textContent = '';
  successEl.textContent = '';

  if (!email || !password) {
    errorEl.textContent = '请填写邮箱和密码';
    return;
  }

  if (password.length < 6) {
    errorEl.textContent = '密码长度至少 6 位';
    return;
  }

  setAuthLoading(true);
  let result;
  try {
    if (isRegister) {
      result = await authSignUp(email, password);
      if (result.needConfirm) {
        successEl.textContent = '✅ 确认邮件已发送至 ' + result.email + '，请查收后登录';
        return;
      }
      if (result.user) {
        successEl.textContent = '注册成功！正在同步数据...';
        await onLoginSuccess(result.user);
        return;
      }
    } else {
      result = await authSignIn(email, password);
      if (result.user) {
        successEl.textContent = '登录成功！正在同步数据...';
        await onLoginSuccess(result.user);
        return;
      }
    }
    errorEl.textContent = result?.error || '操作失败';
  } catch (err) {
    errorEl.textContent = '网络错误，请检查连接后重试';
    console.error('[Auth] submit error:', err);
  } finally {
    setAuthLoading(false);
  }
}

// ========== 新用户引导：预制示例任务 ==========
function seedSampleTasks() {
  const today = getTodayStr();
  const samples = [
    { text: '👋 欢迎使用待办清单！点击左侧圆圈可以完成任务', date: today, tag: null },
    { text: '⭐ 点击右侧星星可以把任务标为重要', date: today, tag: null, starred: true },
    { text: '🏷️ 长按任务可以设置标签和颜色', date: today, tag: null },
    { text: '📅 切换到日历视图看看本月进度', date: today, tag: null },
  ];
  const data = loadData();
  samples.forEach((s, i) => {
    data.tasks.push({
      id: generateId(),
      text: s.text,
      completed: false,
      completedAt: null,
      starred: s.starred || false,
      pinned: false,
      color: '#333333',
      tag: s.tag,
      date: s.date,
      order: data.tasks.length + i,
      reminder: null,
      note: '',
      createdAt: new Date().toISOString(),
      carriedFrom: null
    });
  });
  saveData(data);
  console.log('[Onboarding] 已添加示例任务');
}

// ========== 登录成功后的处理 ==========
async function onLoginSuccess(user) {
  authMandatory = false; // 解除强制登录
  // 恢复关闭按钮（以后手动打开弹窗时可以关闭）
  const closeBtn = document.getElementById('btnAuthClose');
  if (closeBtn) closeBtn.style.display = '';

  const session = await restoreSession();
  updateAuthUI(session);
  hideAuthModal();

  // 从云端同步数据
  syncDebug('登录成功，开始同步...', 'info');
  const syncResult = await syncFromCloud();
  const localData = loadData();

  if (syncResult === 'pulled') {
    // ✅ 云端有新数据 → 已合并到本地
    syncDebug('登录完成：已从云端恢复 ' + localData.tasks.length + ' 个任务', 'ok');
  } else if (syncResult === 'no_data') {
    // 🆕 云端无数据 — 把本地数据推上去
    if (localData.tasks.length === 0) {
      seedSampleTasks();
      syncDebug('登录完成：新用户，已创建示例任务', 'ok');
    } else {
      // 本地有数据但云端没有 → 立即推送
      syncDebug('云端无数据，推送本地 ' + localData.tasks.length + ' 个任务...', 'info');
      const updatedData = loadData(); // seedSampleTasks 可能已改数据
      const settings = { ...updatedData.settings, _localUpdated: new Date().toISOString() };
      saveData({ tasks: updatedData.tasks, settings });
      await cloudPush(updatedData.tasks, settings);
      syncDebug('登录完成：本地数据已上传', 'ok');
    }
  } else if (syncResult === 'pushed') {
    syncDebug('登录完成：本地数据已同步到云端', 'ok');
  } else {
    // ⚠️ syncResult === 'error' — 云端不可达
    syncDebug('登录完成：云端不可达，仅使用本地数据', 'error');
  }

  currentDate = getTodayStr();
  renderAll();
  if (currentView === 'calendar') {
    renderCalendar(calendarYear, calendarMonth);
  }
}

// ========== 忘记密码处理 ==========
async function handleForgotPassword() {
  const email = document.getElementById('authEmail').value.trim();
  const errorEl = document.getElementById('authError');
  const successEl = document.getElementById('authSuccess');

  if (!email) {
    errorEl.textContent = '请先输入邮箱地址';
    return;
  }

  const result = await authResetPassword(email);
  if (result.error) {
    errorEl.textContent = result.error;
  } else {
    successEl.textContent = result.success;
  }
}

// ========== 密码可见切换 ==========
function togglePasswordVisibility() {
  const pwd = document.getElementById('authPassword');
  const btn = document.getElementById('btnTogglePwd');
  if (!pwd || !btn) return;
  if (pwd.type === 'password') {
    pwd.type = 'text';
    btn.textContent = '🙈';
  } else {
    pwd.type = 'password';
    btn.textContent = '👁';
  }
}

// ========== 切换登录/注册模式 ==========
function toggleAuthMode() {
  const isRegister = document.getElementById('authModeRegister').checked;
  document.getElementById('authSubmitBtn').textContent = isRegister ? '注册' : '登录';
  document.getElementById('authTitle').textContent = isRegister ? '📝 注册账号' : '🔑 登录';
  document.getElementById('authToggleLabel').textContent = isRegister
    ? '已有账号？切换到登录'
    : '没有账号？切换到注册';
  document.getElementById('authError').textContent = '';
  document.getElementById('authSuccess').textContent = '';
}
