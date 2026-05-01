---
name: Exclusive Package Availability Close Rule
description: 前台日曆庫存判斷規則 — 有包棟房型的住宿（森山、哈庫納馬塔塔）採「任一包棟無庫存或被封鎖即關閉整天」；散客沒開庫存不算關閉條件；無包棟住宿沿用原 OR 邏輯。
type: feature
---

# 前台日曆庫存關閉規則

位置：`src/components/HeroSection.tsx` loadAvailability。

## 套用範圍
依房型資料動態判斷：當住宿有任何 `room_types.is_exclusive_package=true` 房型時套用包棟規則；否則沿用原邏輯。
目前實際生效：森山寫照、哈庫納馬塔塔。

## 規則
- 有包棟（hasExclusive=true）：
  - 關閉：**任一**包棟房型當天 `adjusted available_rooms=0` 或 `is_blocked=true`
  - 包棟當天沒開庫存（無 inventory row）視為無空 → 關閉
  - 散客房型沒開庫存 → 不影響判斷
- 無包棟：沿用「任一房型有空即開啟」OR 邏輯

## 注意
修改邏輯時務必遞增 `AVAILABILITY_CACHE_VERSION` 強制清快取。
