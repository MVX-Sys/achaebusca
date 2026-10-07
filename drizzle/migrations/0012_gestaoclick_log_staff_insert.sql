GRANT SELECT, INSERT ON public.gestaoclick_sync_log TO authenticated;
GRANT ALL ON public.gestaoclick_sync_log TO service_role;
DROP POLICY IF EXISTS "staff grava sync gestaoclick" ON public.gestaoclick_sync_log;
CREATE POLICY "staff grava sync gestaoclick" ON public.gestaoclick_sync_log
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));