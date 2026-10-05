CREATE TABLE IF NOT EXISTS public.estoque_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variacao_id uuid,
  produto_id uuid,
  produto_nome text,
  cor text,
  tamanho text,
  quantidade_anterior integer NOT NULL DEFAULT 0,
  quantidade_nova integer NOT NULL DEFAULT 0,
  diferenca integer NOT NULL DEFAULT 0,
  origem text NOT NULL DEFAULT 'sistema',
  user_id uuid,
  user_email text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.estoque_historico TO authenticated;
GRANT ALL ON public.estoque_historico TO service_role;
ALTER TABLE public.estoque_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff le historico estoque" ON public.estoque_historico FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE INDEX IF NOT EXISTS estoque_historico_criado_idx ON public.estoque_historico (criado_em DESC);

CREATE OR REPLACE FUNCTION public.tg_log_estoque()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _nome text;
  _ant int; _nova int; _row record; _origem text;
BEGIN
  IF TG_OP = 'DELETE' THEN _row := OLD; _ant := OLD.quantidade_estoque; _nova := 0;
  ELSIF TG_OP = 'INSERT' THEN _row := NEW; _ant := 0; _nova := NEW.quantidade_estoque;
  ELSE _row := NEW; _ant := OLD.quantidade_estoque; _nova := NEW.quantidade_estoque; END IF;
  IF _ant = _nova THEN RETURN NULL; END IF;
  IF _uid IS NOT NULL THEN SELECT email INTO _email FROM auth.users WHERE id = _uid; END IF;
  SELECT nome INTO _nome FROM public.produtos WHERE id = _row.produto_id;
  _origem := COALESCE(NULLIF(current_setting('app.estoque_origem', true), ''),
    CASE WHEN _uid IS NOT NULL AND public.is_staff(_uid) THEN 'admin' WHEN _uid IS NOT NULL THEN 'pedido' ELSE 'sistema' END);
  INSERT INTO public.estoque_historico (variacao_id, produto_id, produto_nome, cor, tamanho, quantidade_anterior, quantidade_nova, diferenca, origem, user_id, user_email)
  VALUES (_row.id, _row.produto_id, _nome, _row.nome_cor, _row.tamanho, _ant, _nova, _nova - _ant, _origem, _uid, _email);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_log_estoque ON public.variacoes_produto;
CREATE TRIGGER trg_log_estoque AFTER INSERT OR UPDATE OF quantidade_estoque OR DELETE ON public.variacoes_produto
FOR EACH ROW EXECUTE FUNCTION public.tg_log_estoque();