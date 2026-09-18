import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { logAudit } from "@/lib/audit";

export type AtendenteRow = {
  id: string;
  nome: string;
  whatsapp: string;
  foto_path: string | null;
  cargo: string | null;
  ativo: boolean;
  criado_em: string;
};

export const listAtendentes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("atendentes")
      .select("*")
      .order("criado_em", { ascending: false });

    if (error) throw error;
    return (data as unknown) as AtendenteRow[];
  });

const nomeSchema = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s.length >= 2 && s.length <= 80, "Informe um nome válido (2 a 80 caracteres).");

const whatsappSchema = z
  .string()
  .transform((s) => s.replace(/\D/g, ""))
  .refine((s) => s.length >= 10 && s.length <= 15, "WhatsApp inválido. Use DDI+DDD+número, ex: 5587991547820.");

const cargoSchema = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => s.length <= 40, "Cargo muito longo.");

async function assertNoDuplicate(
  supabase: any,
  whatsapp: string,
  ignoreId?: string,
) {
  let q = supabase.from("atendentes").select("id").eq("whatsapp", whatsapp);
  if (ignoreId) q = q.neq("id", ignoreId);
  const { data } = await q.limit(1);
  if (data && data.length > 0) {
    throw new Error("Já existe um atendente com esse número de WhatsApp.");
  }
}

export const createAtendente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      nome: nomeSchema,
      whatsapp: whatsappSchema,
      foto_path: z.string().optional().nullable(),
      cargo: cargoSchema.optional(),
      ativo: z.boolean().optional(),
    })
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertNoDuplicate(supabase, data.whatsapp);
    const { data: atendente, error } = await supabase
      .from("atendentes")
      .insert({
        nome: data.nome,
        whatsapp: data.whatsapp,
        foto_path: data.foto_path ?? null,
        cargo: data.cargo || "Vendedor",
        ativo: data.ativo ?? true,
      })
      .select()
      .single();

    if (error) throw error;
    await logAudit({ acao: "criar", entidade: "atendente", entidade_id: (atendente as any).id, descricao: `Criou atendente ${data.nome}` });
    return (atendente as unknown) as AtendenteRow;
  });

export const updateAtendente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      nome: nomeSchema.optional(),
      whatsapp: whatsappSchema.optional(),
      foto_path: z.string().optional().nullable(),
      cargo: cargoSchema.optional(),
      ativo: z.boolean().optional(),
    })
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { id, ...updates } = data;
    if (updates.whatsapp) await assertNoDuplicate(supabase, updates.whatsapp, id);
    const { data: atendente, error } = await supabase
      .from("atendentes")
      .update(updates)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!atendente) throw new Error("Atendente não encontrado ou sem permissão para editar.");
    await logAudit({ acao: "editar", entidade: "atendente", entidade_id: id, descricao: `Editou atendente ${data.nome || id}` });
    return (atendente as unknown) as AtendenteRow;
  });

export const deleteAtendente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: atendente } = await supabase.from("atendentes").select("nome").eq("id", data.id).maybeSingle();
    if (!atendente) throw new Error("Atendente não encontrado.");

    const { count } = await supabase
      .from("pedidos")
      .select("id", { count: "exact", head: true })
      .eq("atendente_id", data.id);

    if ((count ?? 0) > 0) {
      throw new Error(
        `Este atendente tem ${count} pedido(s) vinculado(s) e não pode ser excluído. Desative-o para que pare de receber novos pedidos.`,
      );
    }

    const { error } = await supabase.from("atendentes").delete().eq("id", data.id);
    if (error) throw error;
    await logAudit({ acao: "excluir", entidade: "atendente", entidade_id: data.id, descricao: `Excluiu atendente ${atendente?.nome || data.id}` });
    return { success: true };
  });