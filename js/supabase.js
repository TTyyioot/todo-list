/**
 * supabase.js — Supabase 客户端 & 云端 CRUD
 * 每日待办事项清单 — 数据同步层
 * 支持离线降级：云端不可用时自动回退到 localStorage
 */

// Supabase 配置（通过 CDN 加载后 supabase 对象可用）
let supabaseClient = null;
const CLOUD_TIMEOUT = 10000; // 云端操作超时 10 秒（手机网络较慢）

function initSupabase() {
  if (supabaseClient) return supabaseClient;
  if (typeof supabase === 'undefined') {
    console.warn('[Supabase] SDK 未加载，云端功能不可用');
    if (typeof syncDebug === 'function') syncDebug('Supabase SDK 未加载', 'error');
    return null;
  }
  const { createClient } = supabase;
  supabaseClient = createClient(
    'https://luouydwprmembuewezma.supabase.co',
    'sb_publishable_cPbQc-KYmJwTcLGriRTHdQ_CiPGoag8',
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );
  console.log('[Supabase] 客户端已初始化');
  if (typeof syncDebug === 'function') syncDebug('Supabase SDK 就绪', 'ok');
  return supabaseClient;
}

// ========== 超时包装 ==========
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

// ========== 云端拉取 ==========
// 返回值：
//   { data: {...} } — 成功拉取到云数据
//   { data: null }  — 云端无数据（新用户，数据库没有 user_data 行）
//   null            — 错误（SDK 未加载 / 未登录 / 网络错误）
async function cloudPull() {
  const client = initSupabase();
  if (!client) {
    syncDebug('拉取失败：SDK 未就绪', 'error');
    return null;
  }

  try {
    const { data: { session } } = await withTimeout(client.auth.getSession(), CLOUD_TIMEOUT);
    if (!session) {
      syncDebug('拉取跳过：未登录', 'warn');
      return null;
    }

    syncDebug('正在从云端拉取...', 'info');
    const { data, error } = await withTimeout(
      client
        .from('user_data')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle(),
      CLOUD_TIMEOUT
    );

    if (error) {
      syncDebug('云端查询失败：' + error.message, 'error');
      updateSyncStatus('error');
      return null;
    }

    if (!data) {
      // 新用户 — 数据库里还没有这一行（不是错误，是正常情况）
      syncDebug('云端无数据（新用户，表行不存在）', 'warn');
      return { data: null };
    }

    syncDebug('云端拉取成功，' + (data.tasks || []).length + ' 个任务', 'ok');
    return {
      data: {
        tasks: data.tasks || [],
        settings: data.settings || {},
        updated_at: data.updated_at
      }
    };
  } catch (e) {
    syncDebug('拉取网络错误：' + e.message, 'error');
    updateSyncStatus('offline');
    return null;
  }
}

// ========== 云端推送 ==========
async function cloudPush(tasks, settings) {
  const client = initSupabase();
  if (!client) { syncDebug('推送失败：SDK 未就绪', 'error'); return false; }

  try {
    const { data: { session } } = await withTimeout(client.auth.getSession(), CLOUD_TIMEOUT);
    if (!session) { syncDebug('推送跳过：未登录', 'warn'); return false; }

    syncDebug('正在推送到云端...', 'info');
    const { error } = await withTimeout(
      client
        .from('user_data')
        .upsert({
          user_id: session.user.id,
          tasks: tasks,
          settings: settings,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' }),
      CLOUD_TIMEOUT
    );

    if (error) {
      syncDebug('推送失败：' + error.message, 'error');
      updateSyncStatus('error');
      return false;
    }

    syncDebug('推送成功，' + tasks.length + ' 个任务', 'ok');
    return true;
  } catch (e) {
    syncDebug('推送网络错误：' + e.message, 'error');
    updateSyncStatus('offline');
    return false;
  }
}
