import { supabase } from "@/integrations/supabase/client";

export type Manutencao = {
  manutencao_ativa: boolean;
  manutencao_inicio: string | null;
  manutencao_fim: string | null;
  manutencao_mensagem: string | null;
};

export async function getManutencao(): Promise<Manutencao | null> {
  const { data } = await supabase
    .from("site_config")
    .select("manutencao_ativa, manutencao_inicio, manutencao_fim, manutencao_mensagem")
    .eq("id", "current")
    .maybeSingle();
  return (data as Manutencao | null) ?? null;
}

export function manutencaoEmAndamento(m: Manutencao | null, now = Date.now()): boolean {
  if (!m) return false;
  const fim = m.manutencao_fim ? new Date(m.manutencao_fim).getTime() : null;
  if (fim !== null && now >= fim) return false;
  if (m.manutencao_ativa) return true;
  if (m.manutencao_inicio && now >= new Date(m.manutencao_inicio).getTime()) return true;
  return false;
}
