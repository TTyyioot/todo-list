/**
 * supabase.js — Supabase 客户端 & 云端 CRUD
 * 每日待办事项清单 — 数据同步层
 * 支持离线降级：云端不可用时自动回退到 localStorage
 */

// Supabase 配置（通过 CDN 加载后 supabase 对象可用）
let supabaseClient = null;
const CLOUD_TIMEOUT = 5000; // 云端操作超时 5 秒

function initSupabase() {
  if (supabaseClient) return supabaseClient;
  if (typeof supabase === 'undefined') {
    console.warn('[Supabase] SDK 未加载，云端功能不可用');
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
//   { data: null }  — 云端无数据（新用户）
//   null            — 错误（SDK 未加载 / 未登录 / 网络错误）
async function cloudPull() {
  const client = initSupabase();
  if (!client) {
    console.warn('[Cloud] SDK 未加载，无法拉取');
    return null;
  }

  try {
    const { data: { session } } = await withTimeout(client.auth.getSession(), CLOUD_TIMEOUT);
    if (!session) {
      console.log('[Cloud] 未登录，跳过拉取');
      return null;
    }

    const { data, error } = await withTimeout(
      client
        .from('user_data')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle(),
      CLOUD_TIMEOUT
    );

    if (error) {
      console.error('[Cloud] 拉取失败（数据库错误）:', error.message);
      updateSyncStatus('error');
      return null;
    }

    if (!data) {
      // 新用户 — 数据库里还没有这一行
      console.log('[Cloud] 云端无数据（新用户）');
      return { data: null };
    }

    return {
      data: {
        tasks: data.tasks || [],
        settings: data.settings || {},
        updated_at: data.updated_at
      }
    };
  } catch (e) {
    console.warn('[Cloud] 拉取超时或网络错误:', e.message);
    updateSyncStatus('offline');
    return null;
  }
}

// ========== 云端推送 ==========
async function cloudPush(tasks, settings) {
  const client = initSupabase();
  if (!client) return false;

  try {
    const { data: { session } } = await withTimeout(client.auth.getSession(), CLOUD_TIMEOUT);
    if (!session) return false;

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
      console.error('[Cloud] 推送失败:', error.message);
      updateSyncStatus('error');
      return false;
    }

    console.log('[Cloud] 推送成功');
    return true;
  } catch (e) {
    console.warn('[Cloud] 推送超时或网络错误，数据已保存在本地:', e.message);
    updateSyncStatus('offline');
    return false;
  }
}
