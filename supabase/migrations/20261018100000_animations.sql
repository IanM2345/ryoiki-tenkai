-- Animations in the Sketchbook: allow a third kind of drawing. Nothing else changes.
ALTER TABLE public.drawings DROP CONSTRAINT IF EXISTS drawings_kind_check;
ALTER TABLE public.drawings ADD CONSTRAINT drawings_kind_check CHECK (kind IN ('sketch', 'note', 'animation'));
