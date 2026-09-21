CREATE OR REPLACE FUNCTION public.generate_product_hash_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  base text;
  letra text;
BEGIN
  base := regexp_replace(public.slug_upper(coalesce(NEW.codigo_base, '')), '[^A-Z0-9]', '', 'g');
  IF base = '' THEN
    RAISE EXCEPTION 'CODIGO_OBRIGATORIO';
  END IF;
  NEW.codigo_base := base;
  letra := coalesce(public.product_color_letter(NEW.id), 'X');
  NEW.hash_id := base || letra;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_product_hash_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  SET hash_id = regexp_replace(public.slug_upper(base), '[^A-Z0-9]', '', 'g')
                || coalesce(public.product_color_letter(pid), 'X')
  WHERE id = pid;
  RETURN coalesce(NEW, OLD);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.refresh_product_hash_id() FROM anon, authenticated, public;