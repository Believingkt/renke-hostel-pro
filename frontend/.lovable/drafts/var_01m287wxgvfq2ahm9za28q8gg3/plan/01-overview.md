# 包棟房間組成：每筆房間各自對應（設計稿）

## 目標

1. 編輯訂單頁：每一筆包棟房間依自己的房型載入自己的組成欄位（種類＋上限），顯示與存備註都改用各自那份。
2. 新增訂單頁：選定／切換房型當下自動帶入該房型 package_contents 的預設間數；使用者手動改過的數字不得被後續重新渲染蓋回預設。
3. 兩邊共用同一套讀取 package_contents 的邏輯，避免日後再度漂移。

## Precheck 基準（目前狀態）

| 檔案 | 行數 | md5 |
| --- | --- | --- |
| `src/pages/OrderDetail.tsx` | 4156 | `3848eabe5fa9a5d894ca1723a827b321` |
| `src/components/orders/CreateOrderDialog.tsx` | 3244 | `5d3052103740601bc04ef5a38582e22d` |

## 要改的檔案與範圍

**新增共用檔案：`src/hooks/use-package-breakdown.tsx`**

職責界線（只做這些）：
- 輸入：一組房型 ID。
- 輸出：`Record<roomTypeId, Array<{ room_type_id, name, count }>>`，以及 `getBreakdown(roomTypeId)`。
- 只負責查詢 `room_types.package_contents`、正規化、快取。
- 輸入 ID 集合採去重、排序後形成穩定 key；新增房間或切換房型使 ID 集合改變時，effect 會立刻補查尚未快取的新 ID，並保留已查結果，不是只在掛載時查一次。
- 補查期間以目前快取繼續顯示；新 ID 回來後只更新該 ID。effect cleanup／request token 阻止較舊請求覆蓋較新的 ID 集合。
- 不含任何價格、庫存、備註字串組裝、表單狀態；呼叫端自行決定怎麼用。

**`src/pages/OrderDetail.tsx`**
- 移除單一 `exclusiveRoomTypeId` / 單一 `customBreakdown`（約 442–506）的整頁共用來源，改用共用 hook，傳入所有編輯列的房型 ID。
- 渲染處（約 2898–2919、3016–3037）改成用「該列房型」的組成清單。
- 存檔備註組裝處（約 1105 的 `parts`）改成逐列取自己的組成清單產生 `【包區/包棟房間配置】` 文字。
- 房型下拉 `onValueChange`（約 2663–2690）維持既有價格行為；當 room_type_id **實際改變**時，該列改用新房型欄位，並帶入新房型 package_contents 的預設 count。不屬於新房型的舊 key 不寫入備註。
- 這是刻意選擇：既有訂單初次開啟時仍保留已存數值；只有客服主動換成另一房型，舊房型的實際配置已不適用，才初始化成新房型預設。之後重新渲染或改其他欄位不再覆蓋客服手動值。

**`src/components/orders/CreateOrderDialog.tsx`**
- `breakdownByPackage` 的載入改由共用 hook 提供（行為等價）。
- `updateRoomSelection`：當 `room_type_id` 實際改變時，將該列的組成數值重設為新房型的預設 count（第一列用 `exclusiveCustomCounts`，其餘用 `extraExclusiveCustomCounts[sel.id]`）。
- 帶預設值只發生在「房型變更」這一次動作，不放在 useEffect／render，因此手動改過的值不會被蓋回。

## 明確不動

- 價格計算、方案／template 邏輯、房況庫存、付款與退款欄位、通知信。
- DB schema、migration、RLS、Edge Function。
- 既有 9 筆舊格式備註資料不修改。
- 只有 1 筆包棟房間的訂單行為：新舊邏輯結果需逐字相同（第一列＝原本的 first-exclusive 來源）。
