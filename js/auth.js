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

// ========== 同步：云端 → 本地 ==========
async function syncFromCloud() {
  const remote = await cloudPull();
  if (!remote) {
    console.log('[Sync] 云端无数据或未登录');
    return false;
  }

  // 比较时间戳，选择更新的
  const local = loadData();
  const localUpdated = local.settings._localUpdated || '1970-01-01T00:00:00Z';

  if (remote.updated_at > localUpdated) {
    // 云端更新，合并到本地
    const merged = {
      tasks: remote.tasks,
      settings: { ...remote.settings, _localUpdated: remote.updated_at }
    };
    saveData(merged);
    console.log('[Sync] 云端 → 本地 同步完成');
    return true;
  }

  // 本地更新，上传到云端
  await cloudPush(local.tasks, local.settings);
  console.log('[Sync] 本地 → 云端 同步完成');
  return false; // 没有拉取新数据，不需要重渲染
}

// ========== 同步：本地 → 云端（防抖） ==========
function syncToCloud() {
  clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(async () => {
    const data = loadData();
    const settings = { ...data.settings };
    settings._localUpdated = new Date().toISOString();
    // 也把 _localUpdated 写回本地
    saveData({ tasks: data.tasks, settings });

    const ok = await cloudPush(data.tasks, settings);
    if (ok) console.log('[Sync] 本地 → 云端 同步完成');
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
  // Enter 键提交
  const pwdField = document.getElementById('authPassword');
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

  let result;
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

  errorEl.textContent = result.error || '操作失败';
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

  // 从云端拉数据
  const pulled = await syncFromCloud();
  if (pulled) {
    // 云端数据更新了本地，重渲染
    currentDate = getTodayStr();
    renderAll();
    if (currentView === 'calendar') {
      renderCalendar(calendarYear, calendarMonth);
    }
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
