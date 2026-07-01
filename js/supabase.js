/**
 * supabase.js — Supabase 客户端 & 云端 CRUD
 * 每日待办事项清单 — 数据同步层
 */

// Supabase 配置（通过 CDN 加载后 supabase 对象可用）
let supabaseClient = null;

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

// ========== 云端拉取 ==========
async function cloudPull() {
  const client = initSupabase();
  if (!client) return null;

  const { data: { session } } = await client.auth.getSession();
  if (!session) return null;

  const { data, error } = await client
    .from('user_data')
    .select('*')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error) {
    console.error('[Cloud] 拉取失败:', error.message);
    return null;
  }

  if (!data) return null; // 新用户还没有数据

  return {
    tasks: data.tasks || [],
    settings: data.settings || {},
    updated_at: data.updated_at
  };
}

// ========== 云端推送 ==========
async function cloudPush(tasks, settings) {
  const client = initSupabase();
  if (!client) return false;

  const { data: { session } } = await client.auth.getSession();
  if (!session) return false;

  const { error } = await client
    .from('user_data')
    .upsert({
      user_id: session.user.id,
      tasks: tasks,
      settings: settings
    }, { onConflict: 'user_id' });

  if (error) {
    console.error('[Cloud] 推送失败:', error.message);
    return false;
  }

  console.log('[Cloud] 推送成功');
  return true;
}
