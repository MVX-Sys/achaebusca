ALTER TABLE public.site_config ADD COLUMN IF NOT EXISTS restock_whatsapp_list text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.site_config ADD COLUMN IF NOT EXISTS restock_modo text NOT NULL DEFAULT 'rodizio';
ALTER TABLE public.site_config ADD COLUMN IF NOT EXISTS restock_rodizio_idx integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.next_restock_whatsapp()
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lista text[];
  _modo text;
  _idx integer;
  _n integer;
BEGIN
  SELECT restock_whatsapp_list, restock_modo, restock_rodizio_idx
    INTO _lista, _modo, _idx
  FROM public.site_config WHERE id = 'current' FOR UPDATE;
  _n := coalesce(array_length(_lista, 1), 0);
  IF _n = 0 THEN RETURN '{}'::text[]; END IF;
  IF _modo = 'todos' THEN RETURN _lista; END IF;
  UPDATE public.site_config SET restock_rodizio_idx = (_idx + 1) % _n WHERE id = 'current';
  RETURN ARRAY[_lista[(_idx % _n) + 1]];
END;
$$;
GRANT EXECUTE ON FUNCTION public.next_restock_whatsapp() TO anon, authenticated;
NOTIFY pgrst, 'reload schema';