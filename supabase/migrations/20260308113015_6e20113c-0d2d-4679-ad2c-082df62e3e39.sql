
ALTER TABLE public.sessions ADD COLUMN location TEXT DEFAULT 'Gym' CHECK (location IN ('Gym', 'Outdoor'));
