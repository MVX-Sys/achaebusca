CREATE TABLE public.personalizacao_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  opcoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personalizacao_presets TO authenticated;
GRANT ALL ON public.personalizacao_presets TO service_role;
ALTER TABLE public.personalizacao_presets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff gerencia presets" ON public.personalizacao_presets FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));