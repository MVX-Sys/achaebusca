ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS personalizacoes jsonb NOT NULL DEFAULT '[]'::jsonb;
NOTIFY pgrst, 'reload schema';