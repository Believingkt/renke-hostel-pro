-- 在 room_types 表中添加不同類型房間的間數欄位
ALTER TABLE room_types
ADD COLUMN quad_room_count integer DEFAULT 0,
ADD COLUMN triple_room_count integer DEFAULT 0,
ADD COLUMN double_room_count integer DEFAULT 0;

COMMENT ON COLUMN room_types.quad_room_count IS '四人房間數';
COMMENT ON COLUMN room_types.triple_room_count IS '三人房間數';
COMMENT ON COLUMN room_types.double_room_count IS '雙人房間數';