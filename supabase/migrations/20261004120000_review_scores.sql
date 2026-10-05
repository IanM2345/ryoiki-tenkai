-- Learn: when she types her answer, remember how close it was (0-100) for accuracy over time.
-- One new empty column; nothing existing changes.
ALTER TABLE public.study_reviews ADD COLUMN IF NOT EXISTS score smallint CHECK (score BETWEEN 0 AND 100);
