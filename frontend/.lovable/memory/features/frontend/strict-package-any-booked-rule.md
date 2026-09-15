---
name: Strict Package Any-Booked Availability Rule
description: 奧莉薇雅、淞湘前台日曆採「任一包棟被訂走即關閉整天」嚴格規則，散客房不參與。
type: feature
---
適用住宿（VillaAvailabilityCalendar.tsx 中 `STRICT_PACKAGE_ANY_BOOKED_IDS`）：
- 奧莉薇雅生活小酒店 `74d064f4-1f8c-47e8-9be0-f0a596bbe6f8`
- 淞湘卉館 `8e3e8866-3cb0-4654-91f3-d9b09a543301`

規則：
- 任一 `is_exclusive_package=true` 房型被訂走或關閉 → 整天關閉。
- 散客房型不參與可訂判斷（前台只賣包棟）。
- 任一包棟有空才開放當天。

不影響：森山（獨立嚴格規則 + 散客全無條件）、哈庫納（包棟≥2 無庫存才關）、雲岫（包棟散客分流計算住房率，不在此元件特殊處理）。
