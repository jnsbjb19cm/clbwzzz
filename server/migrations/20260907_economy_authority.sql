-- 20260907 economy authority migration notes
-- Player wallet remains server authoritative.
-- If deployment schema does not already contain these columns, apply:
-- player_profiles.gold INT NOT NULL DEFAULT 0
-- player_profiles.updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

-- Guild upgrade must consume player_profiles.gold inside the same transaction
-- that updates guilds.level.

-- Smithy binding migration will be added after schema inspection.
