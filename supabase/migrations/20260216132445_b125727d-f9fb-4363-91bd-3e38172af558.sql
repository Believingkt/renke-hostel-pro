-- Drop the old unique constraint that only allows one role per user per accommodation
ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_user_id_accommodation_id_key;

-- Add a new unique constraint that allows multiple roles per user per accommodation
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_accommodation_id_role_key UNIQUE (user_id, accommodation_id, role);