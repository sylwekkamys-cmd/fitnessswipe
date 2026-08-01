-- Naklejki na relacji (styl Instagram): pozycjonowane nakladki renderowane
-- na zdjeciu/wideo u ogladajacych. JSONB: [{"type": "time"|"gym", "x": 0..1, "y": 0..1}]
alter table training_status add column if not exists overlays jsonb not null default '[]';
