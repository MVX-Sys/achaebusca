
-- Helper: strip accents and uppercase
CREATE OR REPLACE FUNCTION public.slug_upper(_txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT upper(translate(coalesce(_txt,''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'));
$$;

-- Build the 4-char product code
CREATE OR REPLACE FUNCTION public.build_product_code(_produto_id uuid, _nome text, _categoria_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  c1 text; c2 text; c3 text; c4 text;
  base text; cand text;
  cat_nome text; cor text;
  alphabet text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  i int; j int;
  clean_nome text;
  parts text[];
BEGIN
  SELECT public.slug_upper(nome) INTO cat_nome FROM public.categorias WHERE id = _categoria_id;
  c1 := coalesce(nullif(regexp_replace(coalesce(cat_nome,''), '[^A-Z0-9]', '', 'g'), ''), 'X');
  c1 := left(c1, 1);

  clean_nome := regexp_replace(public.slug_upper(_nome), '[^A-Z0-9 ]', '', 'g');
  parts := regexp_split_to_array(btrim(clean_nome), '\s+');
  c2 := coalesce(nullif(left(coalesce(parts[1], ''), 1), ''), 'X');

  SELECT public.slug_upper(v.nome_cor) INTO cor
  FROM public.variacoes_produto v
  WHERE v.produto_id = _produto_id
  ORDER BY v.criado_em ASC
  LIMIT 1;
  cor := regexp_replace(coalesce(cor, ''), '[^A-Z0-9]', '', 'g');
  IF cor <> '' THEN
    c3 := left(cor, 1);
  ELSE
    c3 := coalesce(nullif(left(coalesce(parts[2], ''), 1), ''), 'X');
  END IF;

  base := c1 || c2 || c3;

  -- 4th char: first free char keeping the code unique
  FOR i IN 1..length(alphabet) LOOP
    cand := base || substr(alphabet, i, 1);
    IF NOT EXISTS (SELECT 1 FROM public.produtos p WHERE p.hash_id = cand AND p.id IS DISTINCT FROM _produto_id) THEN
      RETURN cand;
    END IF;
  END LOOP;

  -- Fallback: vary the 3rd char too
  FOR j IN 1..length(alphabet) LOOP
    FOR i IN 1..length(alphabet) LOOP
      cand := c1 || c2 || substr(alphabet, j, 1) || substr(alphabet, i, 1);
      IF NOT EXISTS (SELECT 1 FROM public.produtos p WHERE p.hash_id = cand AND p.id IS DISTINCT FROM _produto_id) THEN
        RETURN cand;
      END IF;
    END LOOP;
  END LOOP;

  RETURN base || substr(alphabet, 1 + floor(random()*36)::int, 1);
END;
$$;

-- Trigger: assign on insert, and refresh when name/category changes
CREATE OR REPLACE FUNCTION public.generate_product_hash_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.hash_id := public.build_product_code(NEW.id, NEW.nome, NEW.categoria_id);
  ELSIF NEW.hash_id IS NULL OR length(NEW.hash_id) <> 4 THEN
    NEW.hash_id := public.build_product_code(NEW.id, NEW.nome, NEW.categoria_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Keep the code stable but unique
CREATE UNIQUE INDEX IF NOT EXISTS produtos_hash_id_key ON public.produtos (hash_id);

-- Backfill existing products
DO $$
DECLARE r record;
BEGIN
  UPDATE public.produtos SET hash_id = NULL;
  FOR r IN SELECT id, nome, categoria_id FROM public.produtos ORDER BY criado_em ASC LOOP
    UPDATE public.produtos
      SET hash_id = public.build_product_code(r.id, r.nome, r.categoria_id)
      WHERE id = r.id;
  END LOOP;
END $$;
