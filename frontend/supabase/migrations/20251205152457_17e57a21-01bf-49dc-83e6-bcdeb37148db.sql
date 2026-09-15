-- Fix about_section table: restrict INSERT/UPDATE/DELETE to staff with accommodation access
DROP POLICY IF EXISTS "Allow authenticated users to delete their own about_section" ON about_section;
DROP POLICY IF EXISTS "Allow authenticated users to insert their own about_section" ON about_section;
DROP POLICY IF EXISTS "Allow authenticated users to update their own about_section" ON about_section;

CREATE POLICY "Staff can insert about_section"
ON about_section FOR INSERT
TO authenticated
WITH CHECK (user_has_access_to_accommodation(auth.uid(), accommodation_id));

CREATE POLICY "Staff can update about_section"
ON about_section FOR UPDATE
TO authenticated
USING (user_has_access_to_accommodation(auth.uid(), accommodation_id))
WITH CHECK (user_has_access_to_accommodation(auth.uid(), accommodation_id));

CREATE POLICY "Staff can delete about_section"
ON about_section FOR DELETE
TO authenticated
USING (user_has_access_to_accommodation(auth.uid(), accommodation_id));

-- Fix about_features table: restrict INSERT/UPDATE/DELETE to staff with accommodation access
DROP POLICY IF EXISTS "Allow authenticated users to delete their own about_features" ON about_features;
DROP POLICY IF EXISTS "Allow authenticated users to insert their own about_features" ON about_features;
DROP POLICY IF EXISTS "Allow authenticated users to update their own about_features" ON about_features;

CREATE POLICY "Staff can insert about_features"
ON about_features FOR INSERT
TO authenticated
WITH CHECK (user_has_access_to_accommodation(auth.uid(), accommodation_id));

CREATE POLICY "Staff can update about_features"
ON about_features FOR UPDATE
TO authenticated
USING (user_has_access_to_accommodation(auth.uid(), accommodation_id))
WITH CHECK (user_has_access_to_accommodation(auth.uid(), accommodation_id));

CREATE POLICY "Staff can delete about_features"
ON about_features FOR DELETE
TO authenticated
USING (user_has_access_to_accommodation(auth.uid(), accommodation_id));