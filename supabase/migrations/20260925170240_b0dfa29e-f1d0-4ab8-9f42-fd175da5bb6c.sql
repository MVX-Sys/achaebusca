CREATE OR REPLACE FUNCTION public.delete_pedido(_pedido_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _st text;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT status INTO _st FROM public.pedidos WHERE id = _pedido_id FOR UPDATE;
  IF _st IS NULL THEN RAISE EXCEPTION 'pedido nao encontrado'; END IF;
  IF _st NOT IN ('cancelado','entregue') THEN RAISE EXCEPTION 'apenas pedidos cancelados ou entregues podem ser apagados'; END IF;
  DELETE FROM public.pedidos_itens WHERE pedido_id = _pedido_id;
  DELETE FROM public.pedidos WHERE id = _pedido_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.delete_pedido(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_pedido(uuid) TO authenticated;