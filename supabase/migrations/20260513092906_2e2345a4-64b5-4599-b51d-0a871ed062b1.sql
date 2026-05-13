UPDATE public.owlting_service_accounts
   SET password = 'OwlTing#Lakeze2026!Relay',
       is_active = true,
       updated_at = now()
 WHERE username = 'owlting_partner';