-- saved_items: daily favorites (quotes and Bible verses)
CREATE TABLE public.saved_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('quote', 'verse')),
  content TEXT NOT NULL,
  author TEXT,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own saved items" ON public.saved_items
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own saved items" ON public.saved_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own saved items" ON public.saved_items
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_saved_items_user ON public.saved_items(user_id);
CREATE INDEX idx_saved_items_user_type ON public.saved_items(user_id, type);
