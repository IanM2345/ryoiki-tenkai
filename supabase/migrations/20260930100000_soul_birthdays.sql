-- Birthdays for Souls. One nullable date column; existing people are untouched.
-- When the year isn't known the app stores it as 1904 (a leap year, so 29 Feb works)
-- and never shows an age for it.
ALTER TABLE public.souls ADD COLUMN IF NOT EXISTS birthday date;
