-- Wardrobe: which 3D garment shape each closet photo is worn as (a T-shirt, jeans, a midi dress...).
-- One new optional column; nothing existing changes. Empty means "guess from the category".
ALTER TABLE public.closet_items ADD COLUMN IF NOT EXISTS shape3d text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'closet_items_shape3d_check') THEN
    ALTER TABLE public.closet_items ADD CONSTRAINT closet_items_shape3d_check CHECK (shape3d IS NULL OR shape3d IN (
      'tee', 'longsleeve', 'tank', 'crop', 'hoodie', 'jacket', 'coat',
      'jeans', 'leggings', 'shorts', 'skirt', 'longskirt',
      'dress', 'minidress', 'maxidress', 'sneakers', 'boots'));
  END IF;
END $$;
