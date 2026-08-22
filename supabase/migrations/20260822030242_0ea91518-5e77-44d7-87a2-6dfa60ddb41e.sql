DELETE FROM group_buy_payment_events WHERE order_id IN (SELECT id FROM orders WHERE order_number IN ('WK4D58G5','CV5H54A9'));
DELETE FROM group_buy_commissions WHERE order_id IN (SELECT id FROM orders WHERE order_number IN ('WK4D58G5','CV5H54A9'));
DELETE FROM order_rooms WHERE order_id IN (SELECT id FROM orders WHERE order_number IN ('WK4D58G5','CV5H54A9'));
DELETE FROM orders WHERE order_number IN ('WK4D58G5','CV5H54A9');
UPDATE group_buy_campaign_packages SET max_guests = NULL WHERE id = '9156bb11-8e23-4fc4-b322-7c156dc4c281';