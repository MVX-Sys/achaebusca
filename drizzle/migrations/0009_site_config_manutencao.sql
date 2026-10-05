ALTER TABLE public.site_config
  ADD COLUMN IF NOT EXISTS manutencao_ativa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manutencao_inicio timestamptz,
  ADD COLUMN IF NOT EXISTS manutencao_fim timestamptz,
  ADD COLUMN IF NOT EXISTS manutencao_mensagem text;
NOTIFY pgrst, 'reload schema';