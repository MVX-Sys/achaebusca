ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS personalizacoes jsonb NOT NULL DEFAULT '[]'::jsonb;
GRANT SELECT ON public.produtos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos TO authenticated;
GRANT ALL ON public.produtos TO service_role;
NOTIFY pgrst, 'reload schema';