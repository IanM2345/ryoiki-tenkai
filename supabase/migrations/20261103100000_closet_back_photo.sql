-- Wardrobe: a photo of the back of each closet piece (the 3D figure wears it on her back).
-- One new optional column; nothing existing changes. Pieces added before this have no back until she adds one.
ALTER TABLE public.closet_items ADD COLUMN IF NOT EXISTS back_path text;
