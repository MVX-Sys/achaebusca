import { supabase } from "@/integrations/supabase/client";
import { WHATSAPP_NUMBER } from "@/lib/config";

function limpar(numero: string): string {
  return numero.replace(/\D/g, "");
}

function validar(digitos: string): boolean {
  return digitos.length >= 10 && digitos.length <= 15;
}

/** Números (somente dígitos) que recebem os avisos de reposição. */
export async function getRestockWhatsappList(): Promise<string[]> {
  try {
    const { data } = await supabase
      .from("site_config")
      .select("restock_whatsapp_list, restock_whatsapp")
      .eq("id", "current")
      .maybeSingle();
    const lista = ((data as any)?.restock_whatsapp_list as string[] | null) ?? [];
    const numeros = lista.map(limpar).filter(validar);
    if (numeros.length > 0) return numeros;
    const antigo = limpar((data as any)?.restock_whatsapp ?? "");
    if (validar(antigo)) return [antigo];
    return [WHATSAPP_NUMBER];
  } catch {
    return [WHATSAPP_NUMBER];
  }
}

/** Primeiro número da lista (compatibilidade). */
export async function getRestockWhatsapp(): Promise<string> {
  const lista = await getRestockWhatsappList();
  return lista[0] ?? WHATSAPP_NUMBER;
}

export async function setRestockWhatsappList(numeros: string[]): Promise<void> {
  const limpos = numeros.map(limpar).filter((n) => n.length > 0);
  if (limpos.length === 0) {
    throw new Error("Informe ao menos um número.");
  }
  for (const n of limpos) {
    if (!validar(n)) {
      throw new Error(`Número inválido: ${n}. Use DDI e DDD (ex.: 5581997480691).`);
    }
  }
  const unicos = [...new Set(limpos)];
  const { error } = await supabase
    .from("site_config")
    .update({ restock_whatsapp_list: unicos } as any)
    .eq("id", "current");
  if (error) throw error;
}

export async function setRestockWhatsapp(numero: string): Promise<void> {
  await setRestockWhatsappList([numero]);
}

export type RestockModo = "rodizio" | "todos";

export async function getRestockModo(): Promise<RestockModo> {
  const { data } = await supabase.from("site_config").select("restock_modo").eq("id", "current").maybeSingle();
  return ((data as any)?.restock_modo as RestockModo) === "todos" ? "todos" : "rodizio";
}

export async function setRestockModo(modo: RestockModo): Promise<void> {
  const { error } = await supabase.from("site_config").update({ restock_modo: modo } as any).eq("id", "current");
  if (error) throw error;
}

/** Destinos deste aviso: no rodízio, um número por vez (A, B, C, A...). */
export async function getRestockDestinos(): Promise<string[]> {
  try {
    const { data, error } = await (supabase as any).rpc("next_restock_whatsapp");
    if (error) throw error;
    const lista = ((data as string[] | null) ?? []).map(limpar).filter(validar);
    if (lista.length > 0) return lista;
  } catch {
    // cai no padrão abaixo
  }
  const todos = await getRestockWhatsappList();
  return todos.slice(0, 1);
}
