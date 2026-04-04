

# 人客多訂房入口 — 完整規劃

## 專案概述

在 `lakeze.com/booking` 建立人客多訂房平台入口，整合旗下所有民宿，並建構會員系統、紅利點數與優惠券三大核心機制。各民宿保有獨立訂房頁 `lakeze.com/{系統編碼}`（即現有的 `short_url_alias` 機制）。

---

## 架構總覽

```text
┌─────────────────────────────────────────────────┐
│  lakeze.com/booking (平台入口)                    │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐    │
│  │ 會員系統   │  │ 紅利點數   │  │ 優惠券    │    │
│  └───────────┘  └───────────┘  └───────────┘    │
│  ┌─────────────────────────────────────────┐    │
│  │ 民宿列表 (所有 is_active 民宿)            │    │
│  │  → 點擊進入 /booking?accId=xxx           │    │
│  │  → 或進入 lakeze.com/{short_url_alias}   │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

---

## 一、資料庫設計（新增 6 張表）

### 1. `platform_members` — 平台會員
| 欄位 | 類型 | 說明 |
|------|------|------|
| id | uuid PK | |
| user_id | uuid FK → auth.users | 登入帳號關聯 |
| name | text | 姓名 |
| phone | text | 手機 |
| email | text | Email |
| avatar_url | text | 頭像 |
| created_at | timestamptz | 註冊時間 |
| updated_at | timestamptz | |

### 2. `member_points` — 紅利點數帳戶
| 欄位 | 類型 | 說明 |
|------|------|------|
| id | uuid PK | |
| member_id | uuid FK → platform_members | |
| balance | integer | 目前餘額 |
| lifetime_earned | integer | 累計獲得 |
| lifetime_used | integer | 累計使用 |
| updated_at | timestamptz | |

### 3. `point_transactions` — 點數異動紀錄
| 欄位 | 類型 | 說明 |
|------|------|------|
| id | uuid PK | |
| member_id | uuid FK | |
| type | enum('earn_order', 'earn_event', 'redeem', 'expire', 'admin_adjust') | 異動類型 |
| amount | integer | 正數=獲得，負數=扣除 |
| balance_after | integer | 異動後餘額 |
| order_id | uuid FK → orders (nullable) | 關聯訂單 |
| accommodation_id | uuid FK (nullable) | 來源民宿 |
| description | text | 說明 |
| expires_at | timestamptz (nullable) | 點數到期日 |
| created_at | timestamptz | |

### 4. `point_rules` — 點數回饋規則
| 欄位 | 類型 | 說明 |
|------|------|------|
| id | uuid PK | |
| accommodation_id | uuid FK (nullable) | null=平台通用規則 |
| earn_rate | numeric | 回饋比例（如 0.05 = 5%）|
| min_order_amount | integer | 最低消費門檻 |
| points_per_dollar | numeric | 每元回饋幾點 |
| is_active | boolean | |
| created_at / updated_at | timestamptz | |

### 5. `platform_coupons` — 平台優惠券
| 欄位 | 類型 | 說明 |
|------|------|------|
| id | uuid PK | |
| code | text UNIQUE | 優惠碼 |
| coupon_type | enum('percentage', 'fixed') | 折扣類型 |
| coupon_value | integer | 折扣值 |
| scope | enum('platform', 'accommodation') | 適用範圍 |
| accommodation_id | uuid FK (nullable) | scope=accommodation 時指定 |
| min_order_amount | integer | 最低消費 |
| usage_limit | integer | 總用量上限 |
| per_member_limit | integer | 每人限用次數 |
| used_count | integer DEFAULT 0 | 已使用次數 |
| valid_from | timestamptz | 生效起 |
| valid_until | timestamptz (nullable) | 到期日 |
| is_active | boolean | |
| created_at / updated_at | timestamptz | |

### 6. `coupon_usages` — 優惠券使用紀錄
| 欄位 | 類型 | 說明 |
|------|------|------|
| id | uuid PK | |
| coupon_id | uuid FK | |
| member_id | uuid FK | |
| order_id | uuid FK → orders | |
| used_at | timestamptz | |

---

## 二、會員系統

### 登入方式
- **Email + 密碼** 註冊/登入
- **Google OAuth**（使用 Lovable Cloud 託管方案，無需額外設定）

### 頁面規劃
| 路由 | 說明 |
|------|------|
| `/member/auth` | 會員登入/註冊頁（獨立於後台 `/auth`）|
| `/member/profile` | 個人資料管理 |
| `/member/points` | 點數餘額與異動紀錄 |
| `/member/coupons` | 我的優惠券 |
| `/member/orders` | 訂房紀錄 |

### 與現有系統的區隔
- 現有 `/auth` 為**民宿管理員**登入，保持不變
- 新增 `/member/auth` 為**旅客會員**登入
- 兩者共用 `auth.users`，透過 `platform_members` 表區分身份
- 登入後由 `platform_members` 是否存在判斷導向

---

## 三、紅利點數機制

### 獲得方式
1. **訂房消費回饋**：訂單狀態變為 `checked_out` 時，依 `point_rules` 自動回饋
2. **活動贈點**：管理員可於總部後台手動贈送點數（type = `earn_event`）

### 使用方式
- 訂房時可折抵部分金額（1 點 = 1 元）
- 折抵上限可設定（如最高折抵訂單金額 X%）

### 自動化
- DB Trigger：訂單退房時自動計算並寫入 `point_transactions`
- 點數到期機制：可設定有效期限，搭配定期清理

---

## 四、優惠券機制

### 與現有折扣碼的差異
| | 現有 discount_codes | 新 platform_coupons |
|---|---|---|
| 範圍 | 單一民宿 | 平台通用 or 民宿專屬 |
| 綁定 | 民宿管理員管理 | 總部管理 + 民宿管理 |
| 會員限制 | 無 | 每人限用次數 |
| 並存 | 保留不變 | 新增 |

### 驗證流程
訂房時可同時輸入：民宿折扣碼（現有）或平台優惠券（新增），系統分開驗證，擇一使用。

---

## 五、入口頁面 `/booking`

### 頁面內容
1. **頂部導航**：人客多 Logo、會員登入/頭像
2. **搜尋篩選**：地區、入住日期、退房日期、人數
3. **民宿卡片列表**：照片、名稱、地區、星級、起始房價
4. **每張卡片**點擊 → 進入該民宿的訂房流程 `/booking?accId=xxx`

### 資料來源
- 查詢 `accommodation_info` WHERE `is_active = true`
- 依 `display_order` 排序
- 房價取各民宿最低 `base_price`

---

## 六、總部後台管理擴充

在 HQ 後台新增管理模組：
- **會員管理**：查看會員列表、手動贈點
- **優惠券管理**：建立/編輯平台級優惠券
- **點數規則**：設定各民宿或平台通用的回饋比例

---

## 七、實作階段建議

| 階段 | 內容 | 預估工作量 |
|------|------|-----------|
| **Phase 1** | DB 遷移（6 張表 + RLS）+ 會員註冊/登入 + 個人中心 | 大 |
| **Phase 2** | `/booking` 入口頁 + 民宿列表展示 | 中 |
| **Phase 3** | 紅利點數（規則、回饋 Trigger、折抵邏輯）| 大 |
| **Phase 4** | 優惠券（CRUD、驗證、訂房整合）| 中 |
| **Phase 5** | HQ 後台管理介面 | 中 |

### RLS 策略重點
- `platform_members`：會員只能讀寫自己的資料
- `point_transactions`：會員只能讀自己的紀錄；Trigger 以 `SECURITY DEFINER` 寫入
- `platform_coupons`：所有人可讀 active 券；僅管理員可寫
- `coupon_usages`：會員只能讀自己的使用紀錄

---

## 八、技術要點

- 會員 Google 登入使用 `lovable.auth.signInWithOAuth("google")` 託管方案
- 新增路由群組 `/member/*` 與 `/booking`，加入 `App.tsx` 路由表
- 會員與管理員共用 `auth.users`，以 `platform_members` 表存在與否區分角色
- 點數回饋 Trigger 掛在 `orders` 表的 `UPDATE` 事件上

