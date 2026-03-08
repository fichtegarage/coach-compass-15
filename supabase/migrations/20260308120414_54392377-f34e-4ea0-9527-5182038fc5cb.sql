
CREATE TABLE public.package_feature_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  package_id uuid NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  completed_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (package_id, feature_key)
);

ALTER TABLE public.package_feature_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own feature completions"
  ON public.package_feature_completions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
