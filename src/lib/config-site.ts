import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";

export type HeroSlide = {
  id: string;
  tipo: 'gradient' | 'image' | 'video';
  media_url: string | null;
  /** Caminho do arquivo no storage (fonte de verdade salva no banco). */
  media_path?: string | null;
  titulo: string;
  subtitulo: string | null;
  ordem: number;
  ativo: boolean;
};

export type SiteConfig = {
  id: string;
  hero_slides: HeroSlide[];
  destaques_novidades: string[];
  destaques_ofertas: string[];
};

/** Extrai o caminho do arquivo caso um link (assinado/público) tenha sido salvo. */
export function toStoragePath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) return value;
  const clean = value.split("?")[0];
  const m = clean.match(/\/object\/(?:sign|public)\/product-images\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : value;
}

export async function getSiteConfig(): Promise<SiteConfig> {
  const { data: slides, error: slidesError } = await supabase
    .from("hero_slides")
    .select("*")
    .order("ordem", { ascending: true });

  if (slidesError) {
    console.error("Error fetching hero slides:", slidesError);
  }

  const { getImageUrl } = await import("@/lib/storage");

  const resolved = await Promise.all(
    ((slides as any[]) || []).map(async (s) => {
      const path = toStoragePath(s.media_url);
      let url: string | null = null;
      if (path) {
        url = /^https?:\/\//i.test(path)
          ? path
          : await getImageUrl(path, s.tipo === "video" ? undefined : { width: 1600, quality: 74 });

      }
      return { ...s, media_path: path, media_url: url } as HeroSlide;
    }),
  );

  const { data: cfg } = await supabase
    .from("site_config")
    .select("destaques_novidades, destaques_ofertas")
    .eq("id", "current")
    .maybeSingle();

  return {
    id: "current",
    hero_slides: resolved,
    destaques_novidades: ((cfg as any)?.destaques_novidades as string[]) ?? [],
    destaques_ofertas: ((cfg as any)?.destaques_ofertas as string[]) ?? [],
  };
}


export async function updateHeroSlide(id: string, slide: Partial<Omit<HeroSlide, 'id' | 'media_path'>>) {
  const { media_path: _mp, ...payload } = slide as any;
  const { error } = await supabase
    .from("hero_slides")
    .update(payload)
    .eq("id", id);
  
  if (error) throw error;
  await logAudit({ acao: "editar", entidade: "configuracao_site", entidade_id: id, descricao: `Editou slide do banner: ${slide.titulo || id}` });
}

export async function createHeroSlide(slide: Omit<HeroSlide, 'id' | 'media_path'>) {
  const { media_path: _mp, ...payload } = slide as any;
  const { data, error } = await supabase
    .from("hero_slides")
    .insert(payload)
    .select()
    .single();
  
  if (error) throw error;
  await logAudit({ acao: "criar", entidade: "configuracao_site", entidade_id: (data as any).id, descricao: `Criou novo slide no banner: ${slide.titulo}` });
  return data;
}

export async function deleteHeroSlide(id: string) {
  const { data: slide } = await supabase.from("hero_slides").select("titulo").eq("id", id).single();
  const { error } = await supabase
    .from("hero_slides")
    .delete()
    .eq("id", id);
  
  if (error) throw error;
  await logAudit({ acao: "excluir", entidade: "configuracao_site", entidade_id: id, descricao: `Excluiu slide do banner: ${slide?.titulo || id}` });
}