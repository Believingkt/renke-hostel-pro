/**
 * RLS 端對端驗證 — kol_reciprocal_monthly_quotas
 *
 * 用法：
 *   1) 分別以 scout_manager 與 hotel_admin 帳號登入 /admin
 *   2) 開啟瀏覽器 Console，貼上並執行本檔內容
 *   3) 觀察 4 個操作（SELECT / INSERT / UPDATE / DELETE）是否成功
 *
 * 預期結果：
 *   - scout_manager：SELECT/INSERT/UPDATE/DELETE 皆成功
 *   - hotel_admin  ：於自家 accommodation 底下皆成功
 *   - 匿名使用者   ：SELECT 空陣列 / 寫入失敗
 *
 * 注意：測試會建立一筆 year_month='2099-12' 的暫時資料並在最後刪掉。
 */

(async () => {
  const { supabase } = await import('/src/integrations/supabase/client.ts');

  // 取得目前登入者 role 與 accommodation
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return console.error('❌ 尚未登入，請先登入再執行');

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role, accommodation_id')
    .eq('user_id', user.id);
  console.log('👤 目前使用者角色：', roles);

  // 隨便挑一個包棟方案作為測試 payload
  const { data: pkg, error: pkgErr } = await supabase
    .from('accommodation_packages')
    .select('id, accommodation_id')
    .limit(1)
    .maybeSingle();
  if (pkgErr || !pkg) return console.error('❌ 找不到可用的 package', pkgErr);

  const YEAR_MONTH = '2099-12';
  const label = (op, ok, extra) =>
    console.log(`${ok ? '✅' : '❌'} ${op}`, extra ?? '');

  // ---- SELECT ----
  const sel = await supabase.from('kol_reciprocal_monthly_quotas').select('id').limit(1);
  label('SELECT', !sel.error, sel.error?.message ?? `rows=${sel.data?.length ?? 0}`);

  // ---- INSERT ----
  const ins = await supabase
    .from('kol_reciprocal_monthly_quotas')
    .insert({
      accommodation_id: pkg.accommodation_id,
      package_id: pkg.id,
      year_month: YEAR_MONTH,
      quota: 9,
    })
    .select()
    .maybeSingle();
  label('INSERT', !ins.error, ins.error?.message ?? `id=${ins.data?.id}`);
  const insertedId = ins.data?.id;

  // ---- UPDATE ----
  if (insertedId) {
    const upd = await supabase
      .from('kol_reciprocal_monthly_quotas')
      .update({ quota: 8 })
      .eq('id', insertedId)
      .select()
      .maybeSingle();
    label('UPDATE', !upd.error, upd.error?.message ?? `quota=${upd.data?.quota}`);
  } else {
    label('UPDATE', false, '（skipped：無 insertedId）');
  }

  // ---- DELETE ----
  if (insertedId) {
    const del = await supabase
      .from('kol_reciprocal_monthly_quotas')
      .delete()
      .eq('id', insertedId);
    label('DELETE', !del.error, del.error?.message ?? 'ok');
  } else {
    // 保險：以 year_month 清除任何殘留
    await supabase.from('kol_reciprocal_monthly_quotas').delete().eq('year_month', YEAR_MONTH);
    label('DELETE', false, '（skipped：無 insertedId）');
  }
})();
