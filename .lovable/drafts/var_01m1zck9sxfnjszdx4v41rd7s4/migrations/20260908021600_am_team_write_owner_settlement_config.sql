-- 讓 AM 團隊（am / am_manager）可以寫入業主月結設定的對照副本
-- 背景：owner_settlement_pricing_rules 已允許 AM 寫入，但 system_settings
-- 的 owner_settlement_config:<accommodation_id> 只開放 super_admin，
-- 導致 AM 儲存時「一半成功、一半 0 筆更新」而顯示儲存失敗。
-- 僅限 owner_settlement_config 開頭的 key，其他系統設定維持原本限制。

DROP POLICY IF EXISTS "AM team can insert owner settlement settings" ON public.system_settings;
CREATE POLICY "AM team can insert owner settlement settings"
  ON public.system_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_am_team(auth.uid())
    AND setting_key LIKE 'owner_settlement_config%'
  );

DROP POLICY IF EXISTS "AM team can update owner settlement settings" ON public.system_settings;
CREATE POLICY "AM team can update owner settlement settings"
  ON public.system_settings
  FOR UPDATE
  TO authenticated
  USING (
    public.is_am_team(auth.uid())
    AND setting_key LIKE 'owner_settlement_config%'
  )
  WITH CHECK (
    public.is_am_team(auth.uid())
    AND setting_key LIKE 'owner_settlement_config%'
  );

GRANT SELECT, INSERT, UPDATE ON public.system_settings TO authenticated;
