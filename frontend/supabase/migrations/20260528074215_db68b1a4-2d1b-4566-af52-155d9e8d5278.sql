WITH csv_kol(kol_name, rarity, kpi_qualified, check_in_date, cid_code, order_number) AS (VALUES
('參考示範用1','ck',false,DATE '2025-01-01','LakezeVIP','abc'),
('參考示範用2','',false,DATE '2025-01-02','100','123456'),
('旅宿達人貝瑞大叔','N',true,DATE '2025-05-13','Lakeze1','0'),
('人客多 客服N','',false,NULL,'NicoleLINE',''),
('人客多 客服D','',false,NULL,'DodoLINE',''),
('人客多 客服 R','',false,NULL,'RnnyLINE',''),
('人客多 客服K','',false,NULL,'KirstyLINE',''),
('人客多 客服 J','',false,NULL,'JonnyLINE',''),
('麗虹之選 - 寵物友善寶藏地','SR',true,DATE '2025-05-19','LinghongP','9226115'),
('小資夫妻倆 Couple Love Trip','N',true,DATE '2025-05-19','Couplelovet','9252586'),
('Min and Wei','SR',true,DATE '2025-05-19','Minandwei','9270301'),
('Niceday 玩體驗','UR',true,DATE '2025-05-22','NiceDay','9281712'),
('Min and Wei 米拉米拉米拉','SR',true,DATE '2025-05-29','Minandwei2','9295305')
) ,
matched AS (
  UPDATE public.kol_profiles kp SET
    kpi_qualified = c.kpi_qualified,
    rarity = CASE WHEN kp.rarity IS NULL OR kp.rarity = '' THEN NULLIF(c.rarity,'') ELSE kp.rarity END,
    order_number = CASE WHEN (kp.order_number IS NULL OR kp.order_number = '') AND c.order_number <> '' THEN c.order_number ELSE kp.order_number END,
    updated_at = now()
  FROM csv_kol c
  WHERE (c.cid_code <> '' AND kp.cid_code = c.cid_code)
     OR (c.cid_code = '' AND kp.name = c.kol_name AND kp.check_in_date = c.check_in_date)
  RETURNING 1
)
SELECT 1;