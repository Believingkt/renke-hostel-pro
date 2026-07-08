DELETE FROM public.team_pending_invites pi
WHERE EXISTS (
  SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(pi.email)
);