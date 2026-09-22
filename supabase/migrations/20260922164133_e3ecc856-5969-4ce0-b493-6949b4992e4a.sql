ALTER TABLE public.site_config ADD COLUMN IF NOT EXISTS restock_whatsapp text;
INSERT INTO public.site_config (id) VALUES ('current') ON CONFLICT (id) DO NOTHING;
UPDATE public.site_config SET restock_whatsapp = COALESCE(restock_whatsapp, '5581997480691') WHERE id = 'current';