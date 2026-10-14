CREATE TABLE public.pix_chaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('cpf','cnpj','email','telefone','aleatoria')),
  chave text NOT NULL UNIQUE,
  nome_recebedor text NOT NULL,
  cidade text,
  banco text,
  principal boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pix_chaves TO authenticated;
GRANT ALL ON public.pix_chaves TO service_role;
ALTER TABLE public.pix_chaves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso técnico gerencia chaves PIX" ON public.pix_chaves FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_permission(auth.uid(),'admin.advanced'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_permission(auth.uid(),'admin.advanced'));