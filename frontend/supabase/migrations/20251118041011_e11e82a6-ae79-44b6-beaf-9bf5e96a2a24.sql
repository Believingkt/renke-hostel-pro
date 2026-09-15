-- Add individual text size columns for title, subtitle and secondary_subtitle
ALTER TABLE accommodation_photos
ADD COLUMN title_size TEXT DEFAULT 'large',
ADD COLUMN subtitle_size TEXT DEFAULT 'medium',
ADD COLUMN secondary_subtitle_size TEXT DEFAULT 'small';