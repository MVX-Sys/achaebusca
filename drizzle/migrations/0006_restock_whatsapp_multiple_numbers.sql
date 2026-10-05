ALTER TABLE public.site_config ADD COLUMN restock_whatsapp_list text[];

UPDATE public.site_config
SET restock_whatsapp_list = ARRAY[restock_whatsapp]
WHERE id = 'current' AND restock_whatsapp IS NOT NULL AND restock_whatsapp <> '';

COMMENT ON COLUMN public.site_config.restock_whatsapp IS 'DEPRECATED: replaced by restock_whatsapp_list (multiple numbers)';
COMMENT ON COLUMN public.site_config.restock_whatsapp_list IS 'Lista de números (somente dígitos, com DDI+DDD) que recebem os avisos de reposição.';