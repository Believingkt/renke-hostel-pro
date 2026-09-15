UPDATE public.orders 
SET total_price = 33300, 
    discount_amount = 26700, 
    final_price = 6600,
    updated_at = now()
WHERE id = 'e29520e0-38bc-423c-8329-90b515340e5d';