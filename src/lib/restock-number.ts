import { supabase } from "@/integrations/supabase/client";
import { WHATSAPP_NUMBER } from "@/lib/config";

/** Número (somente dígitos) que recebe os avisos de reposição. */
export async function getRestockWhatsapp(): Promise<string> {
  try {
    const { data } = await supabase
      .from("site_config")
      .select("restock_whatsapp")
      .eq("id", "current")
      .maybeSingle();
    const num = ((data as any)?.restock_whatsapp ?? "").replace(/\D/g, "");
    return num || WHATSAPP_NUMBER;
  } catch {
    return WHATSAPP_NUMBER;
  }
}

export async function setRestockWhatsapp(numero: string): Promise<void> {
  const digitos = numero.replace(/\D/g, "");
  if (digitos.length < 10 || digitos.length > 15) {
    throw new Error("Informe o número com DDI e DDD (ex.: 5581997480691).");
  }
  const { error } = await supabase
    .from("site_config")
    .update({ restock_whatsapp: digitos } as any)
    .eq("id", "current");
  if (error) throw error;
}
