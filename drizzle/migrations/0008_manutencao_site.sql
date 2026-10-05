ALTER TABLE public.site_config
  ADD COLUMN IF NOT EXISTS manutencao_ativa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manutencao_inicio timestamptz,
  ADD COLUMN IF NOT EXISTS manutencao_fim timestamptz,
  ADD COLUMN IF NOT EXISTS manutencao_mensagem text;
INSERT INTO public.site_config (id) VALUES ('current') ON CONFLICT (id) DO NOTHING;
NOTIFY pgrst, 'reload schema';