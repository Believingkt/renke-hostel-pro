-- 為 booking_settings 新增各區塊的自訂標題和副標題欄位
ALTER TABLE public.booking_settings
ADD COLUMN check_in_section_title text DEFAULT '入住時間',
ADD COLUMN check_in_section_subtitle text,
ADD COLUMN payment_section_title text DEFAULT '付款方式',
ADD COLUMN payment_section_subtitle text,
ADD COLUMN cancellation_section_title text DEFAULT '取消政策',
ADD COLUMN cancellation_section_subtitle text,
ADD COLUMN important_section_title text DEFAULT '重要事項',
ADD COLUMN important_section_subtitle text,
ADD COLUMN pet_section_title text DEFAULT '寵物入住守則',
ADD COLUMN pet_section_subtitle text,
ADD COLUMN other_section_title text DEFAULT '其他注意事項',
ADD COLUMN other_section_subtitle text;