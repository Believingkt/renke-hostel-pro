UPDATE team_member_profiles SET user_id = 'bceadb80-f8c4-48bf-8837-496cdba280e7' WHERE user_id = '809053f2-f7dd-40a9-ab9a-e639e1a72ea1' AND display_name = '財務';

UPDATE user_roles SET user_id = 'bceadb80-f8c4-48bf-8837-496cdba280e7' WHERE user_id = '809053f2-f7dd-40a9-ab9a-e639e1a72ea1' AND accommodation_id IS NULL AND role = 'finance';