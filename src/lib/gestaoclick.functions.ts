import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { GC_LOTE, gcListProdutos, listProdutosVinculados, pushEstoqueGestaoClick } from "./gestaoclick.server";
export const GC_LOTE_CLIENTE = 12;
void GC_LOTE;

async function assertStaff(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (!data) throw new Error("Forbidden");
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export const listGestaoClickProdutos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);
    return await gcListProdutos();
  });

export const linkGestaoClick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ produtoId: z.string().uuid(), gcId: z.string().max(40).nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { error } = await context.supabase.from("produtos").update({ gestaoclick_id: data.gcId }).eq("id", data.produtoId);
    if (error) throw new Error(error.message);
    if (data.gcId) await pushEstoqueGestaoClick([data.produtoId]);
    return { ok: true };
  });

/** Links unlinked site products to GestãoClick products with the same name. */
export const autoLinkGestaoClick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);
    const gc = await gcListProdutos();
    const porNome = new Map(gc.map((p) => [norm(p.nome), p.id]));
    const { data: prods } = await context.supabase.from("produtos").select("id,nome").is("gestaoclick_id", null);
    const ligados: string[] = [];
    for (const p of prods ?? []) {
      const gid = porNome.get(norm(p.nome));
      if (!gid) continue;
      await context.supabase.from("produtos").update({ gestaoclick_id: gid }).eq("id", p.id);
      ligados.push(p.id);
    }
    const r = await pushEstoqueGestaoClick(ligados);
    return { vinculados: ligados.length, ...r };
  });

export const listVinculadosGestaoClick = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);
    return await listProdutosVinculados();
  });

export const syncGestaoClick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ produtoIds: z.array(z.string().uuid()).max(1000).optional(), pedidoId: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    let ids: string[] | "all" = data.produtoIds ?? "all";
    if (data.pedidoId) {
      const { data: itens } = await context.supabase.from("pedidos_itens").select("produto_id").eq("pedido_id", data.pedidoId);
      ids = (itens ?? []).map((i: any) => i.produto_id).filter(Boolean);
    }
    return await pushEstoqueGestaoClick(ids);
  });

export const syncMaoDuplaGestaoClick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);
    const { syncMaoDupla } = await import("./gestaoclick.server");
    return await syncMaoDupla();
  });
