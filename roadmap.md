# Step 3 方案 B：訂單歷程統一時間線（實作＋實測，未部署）

- [ ] 新元件 src/components/orders/OrderTimelineCard.tsx（四來源合併＋篩選＋重送按鈕搬移）
- [ ] 以 YC6U86W2 / NJ3U85G6 / CE2V95Y5 真實資料 fixture 跑元件，輸出實際 items 與筆數
- [ ] 四種情境重送按鈕快照實測（一般 canManage / 非 canManage / 團購信用卡 / 團購匯款）
- [ ] stub supabase.functions.invoke，實際捕捉三顆按鈕的 functionName 與 body
- [ ] 不部署、不 Publish、不改 OrderDetail 掛載點，等使用者確認

備註：真實寄送測試暫不進行，測試全綠後再評估是否詢問。
