ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS gestaoclick_id text;
CREATE INDEX IF NOT EXISTS produtos_gestaoclick_id_idx ON public.produtos(gestaoclick_id);
CREATE TABLE public.gestaoclick_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestaoclick_id text NOT NULL,
  nome text,
  estoque integer,
  ok boolean NOT NULL DEFAULT true,
  mensagem text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gestaoclick_sync_log TO authenticated;
GRANT ALL ON public.gestaoclick_sync_log TO service_role;
ALTER TABLE public.gestaoclick_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff le sync gestaoclick" ON public.gestaoclick_sync_log FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));