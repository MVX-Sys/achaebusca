DROP POLICY IF EXISTS "produtos públicos" ON public.produtos;
DROP POLICY IF EXISTS "staff gerencia produtos" ON public.produtos;
DROP POLICY IF EXISTS "categorias públicas" ON public.categorias;
DROP POLICY IF EXISTS "staff gerencia categorias" ON public.categorias;
DROP POLICY IF EXISTS "Public can view hero slides" ON public.hero_slides;
DROP POLICY IF EXISTS "Staff can manage all hero slides" ON public.hero_slides;
DROP POLICY IF EXISTS "Public can view active hero slides" ON public.hero_slides;
CREATE POLICY "Public can view active hero slides" ON public.hero_slides FOR SELECT TO anon, authenticated USING (ativo = true OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'funcionario'::app_role));