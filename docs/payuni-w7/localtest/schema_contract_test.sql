-- W7 程式寫入的欄位／值 與 migration 實際 schema 是否相符（在交易內執行後 ROLLBACK，不留資料）
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO accommodation_info (id, name) VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'W7 測試館');
INSERT INTO orders (id, accommodation_id, order_number, guest_name, guest_phone, check_in_date, check_out_date, total_price, final_price)
VALUES ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'W7TEST01', 'x', '0900', '2027-01-01', '2027-01-02', 8000, 8000);
SET LOCAL session_replication_role = origin;
INSERT INTO payment_transactions (id, order_id, accommodation_id, provider, mer_id, mer_trade_no, provider_trade_no, kind, payment_type, amount, status)
VALUES ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'payuni', 'M1', 'W7TEST01-P1', 'UNI-1', 'full', 2, 8000, 'paid');
INSERT INTO payment_transactions (order_id, accommodation_id, provider, mer_id, mer_trade_no, provider_trade_no, kind, payment_type, amount, status, parent_tx_id, refund_source, refund_pending_reason, raw_response)
SELECT 'bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'payuni', 'M1', 'W7TEST01-P1-R' || n, 'UNI-1', 'refund', 2, 100, s, 'cccccccc-0000-4000-8000-000000000001', src, NULL, '{"action":"offline_refund"}'
FROM (VALUES (1, 'pending', 'member'), (2, 'paid', 'admin'), (3, 'failed', 'system'), (4, 'cancelled', 'payuni_backstage'), (5, 'pending', 'guest')) v(n, s, src);
SELECT 'refund rows=' || count(*) FROM payment_transactions WHERE parent_tx_id = 'cccccccc-0000-4000-8000-000000000001';
INSERT INTO refund_bank_accounts (order_id, refund_tx_id, bank_code, bank_sub_code, account_no, holder_name)
SELECT order_id, id, '812', '0016', '1234567890128901', '王小明' FROM payment_transactions WHERE mer_trade_no = 'W7TEST01-P1-R1';
SELECT 'bank rows=' || count(*) FROM refund_bank_accounts WHERE order_id = 'bbbbbbbb-0000-4000-8000-000000000001';
SAVEPOINT s1;
\set ON_ERROR_STOP off
INSERT INTO payment_transactions (order_id, accommodation_id, provider, mer_trade_no, kind, amount, status, refund_source)
VALUES ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'payuni', 'W7TEST01-P1-R9', 'refund', 1, 'pending', 'bogus');
ROLLBACK TO s1;
INSERT INTO payment_transactions (order_id, accommodation_id, provider, mer_trade_no, kind, amount, status)
VALUES ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'payuni', 'W7TEST01-P1-R1', 'refund', 1, 'pending');
ROLLBACK TO s1;
ROLLBACK;
