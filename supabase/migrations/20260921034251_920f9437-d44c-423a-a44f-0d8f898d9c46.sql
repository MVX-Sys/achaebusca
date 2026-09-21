ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS codigo_base text;

UPDATE public.produtos SET codigo_base = upper(left(hash_id, 3)) WHERE codigo_base IS NULL AND hash_id IS NOT NULL AND length(hash_id) >= 3;
UPDATE public.produtos SET codigo_base = upper(left(md5(id::text), 3)) WHERE codigo_base IS NULL;
ALTER TABLE public.produtos ALTER COLUMN codigo_base SET NOT NULL;

CREATE OR REPLACE FUNCTION public.product_color_letter(_produto_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT coalesce(
    nullif(left(regexp_replace(public.slug_upper(v.nome_cor), '[^A-Z0-9]', '', 'g'), 1), ''),
    'X')
  FROM public.variacoes_produto v
  WHERE v.produto_id = _produto_id
  ORDER BY v.criado_em ASC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.generate_product_hash_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  base text;
  letra text;
BEGIN
  base := regexp_replace(public.slug_upper(coalesce(NEW.codigo_base, '')), '[^A-Z0-9]', '', 'g');
  IF base = '' THEN
    RAISE EXCEPTION 'CODIGO_OBRIGATORIO';
  END IF;
  base := left(base, 3);
  NEW.codigo_base := base;
  letra := coalesce(public.product_color_letter(NEW.id), 'X');
  NEW.hash_id := base || letra;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_product_hash_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  pid uuid;
  base text;
BEGIN
  pid := coalesce(NEW.produto_id, OLD.produto_id);
  SELECT p.codigo_base INTO base FROM public.produtos p WHERE p.id = pid;
  IF base IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  UPDATE public.produtos
  SET hash_id = left(regexp_replace(public.slug_upper(base), '[^A-Z0-9]', '', 'g'), 3)
                || coalesce(public.product_color_letter(pid), 'X')
  WHERE id = pid;
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_product_hash_id ON public.variacoes_produto;
CREATE TRIGGER trg_refresh_product_hash_id
AFTER INSERT OR UPDATE OR DELETE ON public.variacoes_produto
FOR EACH ROW EXECUTE FUNCTION public.refresh_product_hash_id();

DROP FUNCTION IF EXISTS public.build_product_code(uuid, text, uuid);