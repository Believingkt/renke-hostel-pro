INSERT INTO public.group_buy_campaigns (
  id, accommodation_id, slug, title, subtitle, description_html, terms_html,
  sale_start, sale_end, stay_start_date, stay_end_date, status,
  deposit_percentage, payment_deadline_hours, commission_rate, kol_display_name,
  cover_image_url, featured_photo_urls, highlight_points
) VALUES (
  '00000000-0000-4000-8000-0000000000a1'::uuid,
  '7690a606-6bac-4cd5-a3e7-2fa754b318e8',
  'qa-gb-verify',
  '【QA】驗收測試活動',
  'QA 驗收用，勿對外',
  '<h2>測試標題 H2</h2><h3>測試標題 H3</h3><p>這是<strong>粗體</strong>與<em>斜體</em>與<u>底線</u>段落。</p><ul><li>條列一</li><li>條列二</li></ul><ol><li>編號一</li><li>編號二</li></ol><p><a href="https://example.com" target="_blank" rel="noopener">正常連結</a></p><p style="color:red" class="evil">帶 style 與 class 的段落</p><p onclick="alert(1)">帶 onclick 的段落</p><p><a href="javascript:alert(2)">javascript 連結</a></p><script>alert(3)</script><iframe src="https://evil.example"></iframe><img src="x" onerror="alert(4)">',
  E'注意事項純文字第一行\n第二行\n・全形點條列\n• 圓點條列\n．全形句點條列\n- 減號條列\n最後一行',
  now() - interval '1 day',
  now() + interval '30 days',
  '2026-08-22',
  '2026-10-05',
  'active',
  30, 72, 0, 'QA',
  'https://dmafqwfynatdvnaeovhz.supabase.co/storage/v1/object/public/room-photos/7690a606-6bac-4cd5-a3e7-2fa754b318e8/gallery-1785287484758-0.webp',
  ARRAY[
    'https://dmafqwfynatdvnaeovhz.supabase.co/storage/v1/object/public/room-photos/7690a606-6bac-4cd5-a3e7-2fa754b318e8/gallery-1785287484758-0.webp',
    'https://dmafqwfynatdvnaeovhz.supabase.co/storage/v1/object/public/room-photos/7690a606-6bac-4cd5-a3e7-2fa754b318e8/gallery-1785287184751-0.webp'
  ],
  ARRAY['QA 測試亮點一','QA 測試亮點二']
);

INSERT INTO public.group_buy_campaign_packages (
  campaign_id, display_name, short_summary, description, group_buy_price, original_price,
  weekday_price, peak_price, holiday_price, disabled_date_types, excluded_dates,
  image_url, image_urls, room_type_id, room_type_ids, max_quantity, sort_order, is_active
) VALUES
('00000000-0000-4000-8000-0000000000a1','QA1 全部適用','三種日期皆可訂','QA1',10000,30000,10000,15000,20000,'{}'::public.group_buy_day_type[],'{}'::date[],
 'https://dmafqwfynatdvnaeovhz.supabase.co/storage/v1/object/public/room-photos/7690a606-6bac-4cd5-a3e7-2fa754b318e8/gallery-1785287484758-0.webp',
 ARRAY[
  'https://dmafqwfynatdvnaeovhz.supabase.co/storage/v1/object/public/room-photos/7690a606-6bac-4cd5-a3e7-2fa754b318e8/gallery-1785287484758-0.webp',
  'https://dmafqwfynatdvnaeovhz.supabase.co/storage/v1/object/public/room-photos/7690a606-6bac-4cd5-a3e7-2fa754b318e8/gallery-1785287184751-0.webp',
  'https://dmafqwfynatdvnaeovhz.supabase.co/storage/v1/object/public/room-photos/7690a606-6bac-4cd5-a3e7-2fa754b318e8/gallery-1785286860123-2.webp',
  'https://dmafqwfynatdvnaeovhz.supabase.co/storage/v1/object/public/room-photos/7690a606-6bac-4cd5-a3e7-2fa754b318e8/gallery-1785286856237-0.webp'
 ],
 '2ab16f88-9c72-443a-9d7e-91831c618274',
 ARRAY['2ab16f88-9c72-443a-9d7e-91831c618274','a6d49a3a-0b48-4465-ba0c-d643b4f6700a','c65366d3-c1d6-4a93-b5c8-34a15c3ea8de']::uuid[],1,1,true),
('00000000-0000-4000-8000-0000000000a1','QA2 平日不適用','週一～週四不可訂','QA2',10000,30000,10000,15000,20000,'{weekday}'::public.group_buy_day_type[],'{}'::date[],null,'{}'::text[],
 '2ab16f88-9c72-443a-9d7e-91831c618274',
 ARRAY['2ab16f88-9c72-443a-9d7e-91831c618274','a6d49a3a-0b48-4465-ba0c-d643b4f6700a','c65366d3-c1d6-4a93-b5c8-34a15c3ea8de']::uuid[],1,2,true),
('00000000-0000-4000-8000-0000000000a1','QA3 旺日不適用','週五、週日不可訂','QA3',10000,30000,10000,15000,20000,'{peak}'::public.group_buy_day_type[],'{}'::date[],null,'{}'::text[],
 '2ab16f88-9c72-443a-9d7e-91831c618274',
 ARRAY['2ab16f88-9c72-443a-9d7e-91831c618274','a6d49a3a-0b48-4465-ba0c-d643b4f6700a','c65366d3-c1d6-4a93-b5c8-34a15c3ea8de']::uuid[],1,3,true),
('00000000-0000-4000-8000-0000000000a1','QA4 假日不適用','週六與國定假日不可訂','QA4',10000,30000,10000,15000,20000,'{holiday}'::public.group_buy_day_type[],'{}'::date[],null,'{}'::text[],
 '2ab16f88-9c72-443a-9d7e-91831c618274',
 ARRAY['2ab16f88-9c72-443a-9d7e-91831c618274','a6d49a3a-0b48-4465-ba0c-d643b4f6700a','c65366d3-c1d6-4a93-b5c8-34a15c3ea8de']::uuid[],1,4,true),
('00000000-0000-4000-8000-0000000000a1','QA5 全部不適用','三種類型皆不適用','QA5',10000,30000,10000,15000,20000,'{weekday,peak,holiday}'::public.group_buy_day_type[],'{}'::date[],null,'{}'::text[],
 '2ab16f88-9c72-443a-9d7e-91831c618274',
 ARRAY['2ab16f88-9c72-443a-9d7e-91831c618274','a6d49a3a-0b48-4465-ba0c-d643b4f6700a','c65366d3-c1d6-4a93-b5c8-34a15c3ea8de']::uuid[],1,5,true),
('00000000-0000-4000-8000-0000000000a1','QA6 假日不適用＋排除日','holiday 不適用且 9/14 排除','QA6',10000,30000,10000,15000,20000,'{holiday}'::public.group_buy_day_type[],ARRAY['2026-09-14']::date[],null,'{}'::text[],
 '2ab16f88-9c72-443a-9d7e-91831c618274',
 ARRAY['2ab16f88-9c72-443a-9d7e-91831c618274','a6d49a3a-0b48-4465-ba0c-d643b4f6700a','c65366d3-c1d6-4a93-b5c8-34a15c3ea8de']::uuid[],1,6,true),
('00000000-0000-4000-8000-0000000000a1','QA7 舊資料單圖','只有 image_url','QA7',10000,30000,10000,15000,20000,'{}'::public.group_buy_day_type[],'{}'::date[],
 'https://dmafqwfynatdvnaeovhz.supabase.co/storage/v1/object/public/room-photos/7690a606-6bac-4cd5-a3e7-2fa754b318e8/gallery-1785286860123-2.webp','{}'::text[],
 '2ab16f88-9c72-443a-9d7e-91831c618274',
 ARRAY['2ab16f88-9c72-443a-9d7e-91831c618274','a6d49a3a-0b48-4465-ba0c-d643b4f6700a','c65366d3-c1d6-4a93-b5c8-34a15c3ea8de']::uuid[],1,7,true),
('00000000-0000-4000-8000-0000000000a1','QA8 完全沒有圖片','無 image_url 也無 image_urls','QA8',10000,30000,10000,15000,20000,'{}'::public.group_buy_day_type[],'{}'::date[],null,'{}'::text[],
 '2ab16f88-9c72-443a-9d7e-91831c618274',
 ARRAY['2ab16f88-9c72-443a-9d7e-91831c618274','a6d49a3a-0b48-4465-ba0c-d643b4f6700a','c65366d3-c1d6-4a93-b5c8-34a15c3ea8de']::uuid[],1,8,true);