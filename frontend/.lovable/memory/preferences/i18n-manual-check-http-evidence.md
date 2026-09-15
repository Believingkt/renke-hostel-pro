---
name: 英文模式核對必附 translate-content HTTP 狀態
description: 每批雙語 postcheck 第 5 項（人工核對英文無殘留中文）必須附上該頁對 translate-content 的實際 HTTP 請求狀態
type: preference
---

所有「英文模式無殘留中文」的人工核對，不得只用肉眼看畫面，必須一併附上該頁對
`translate-content` 的實際 HTTP 請求狀態（200 / 4xx / 5xx、有無發出請求）。

**Why:** 2026-09-11 第一批上線後 `translate-content` 實際是 404，`useTranslatedFields`
靜默 fallback 顯示原文，肉眼核對照樣「通過」，導致動態內容英文從未真正生效卻無人察覺。

**How to apply:** 往後每一批雙語 postcheck 的第 5 項固定包含：頁面截查結果 + 該頁
translate-content 請求的 URL 與 HTTP 狀態；若該頁沒有動態欄位會呼叫該服務，也要明講
「本頁不觸發 translate-content，故此項無法覆蓋」。
