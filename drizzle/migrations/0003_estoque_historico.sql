CREATE TABLE public.estoque_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variacao_id uuid,
  produto_id uuid,
  produto_nome text,
  cor text,
  tamanho text,
  quantidade_anterior integer NOT NULL DEFAULT 0,
  quantidade_nova integer NOT NULL DEFAULT 0,
  diferenca integer NOT NULL DEFAULT 0,
  origem text NOT NULL DEFAULT 'admin',
  user_id uuid,
  user_email text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.estoque_historico TO authenticated;
GRANT ALL ON public.estoque_historico TO service_role;
ALTER TABLE public.estoque_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff ve historico de estoque" ON public.estoque_historico
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE INDEX estoque_historico_criado_idx ON public.estoque_historico (criado_em DESC);

CREATE OR REPLACE FUNCTION public.tg_log_estoque()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _ant int; _nova int; _uid uuid := auth.uid(); _email text; _nome text; _origem text;
BEGIN
  IF TG_OP = 'INSERT' THEN _ant := 0; _nova := NEW.quantidade_estoque;
  ELSE _ant := OLD.quantidade_estoque; _nova := NEW.quantidade_estoque; END IF;
  IF _ant = _nova THEN RETURN NEW; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  SELECT nome INTO _nome FROM public.produtos WHERE id = NEW.produto_id;
  _origem := CASE WHEN _uid IS NOT NULL AND public.is_staff(_uid) THEN 'admin'
                  WHEN _uid IS NOT NULL THEN 'pedido' ELSE 'sistema' END;
  INSERT INTO public.estoque_historico (variacao_id, produto_id, produto_nome, cor, tamanho,
    quantidade_anterior, quantidade_nova, diferenca, origem, user_id, user_email)
  VALUES (NEW.id, NEW.produto_id, _nome, NEW.nome_cor, NEW.tamanho, _ant, _nova, _nova - _ant, _origem, _uid, _email);
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_log_estoque
AFTER INSERT OR UPDATE OF quantidade_estoque ON public.variacoes_produto
FOR EACH ROW EXECUTE FUNCTION public.tg_log_estoque();