ALTER TABLE player_profiles ADD COLUMN avatar_id TEXT NOT NULL DEFAULT 'unselected';
ALTER TABLE player_profiles ADD COLUMN theme_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE player_profiles ADD COLUMN favourite_map TEXT NOT NULL DEFAULT '';
ALTER TABLE player_profiles ADD COLUMN bio TEXT NOT NULL DEFAULT '';
