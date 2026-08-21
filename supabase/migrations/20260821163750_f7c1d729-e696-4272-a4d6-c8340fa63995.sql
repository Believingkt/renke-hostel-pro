UPDATE public.group_buy_campaign_packages
SET image_urls = image_urls || ARRAY[
  'https://dmafqwfynatdvnaeovhz.supabase.co/storage/v1/object/public/room-photos/7690a606-6bac-4cd5-a3e7-2fa754b318e8/gallery-1785286860123-2.webp?qa=5',
  'https://dmafqwfynatdvnaeovhz.supabase.co/storage/v1/object/public/room-photos/7690a606-6bac-4cd5-a3e7-2fa754b318e8/gallery-1785286856237-0.webp?qa=6'
]
WHERE campaign_id = '00000000-0000-4000-8000-0000000000a1'
  AND display_name LIKE 'QA1%'
  AND coalesce(array_length(image_urls, 1), 0) = 4;