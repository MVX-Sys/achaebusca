// Server-only GestãoClick API helpers. Never import from client code.
const BASE = "https://api.gestaoclick.com";

function headers() {
  const a = process.env["GESTAOCLICK_ACCESS_TOKEN"];
  const s = process.env["GESTAOCLICK_SECRET_ACCESS_TOKEN"];
  if (!a || !s) throw new Error("Chaves do Gestão Click não configuradas");
  return { "access-token": a, "secret-access-token": s, "Content-Type": "application/json" };
}

export type GcProduto = { id: string; nome: string; codigo_interno: string; estoque: number };

export async function gcListProdutos(): Promise<GcProduto[]> {
  const out: GcProduto[] = [];
  for (let pagina = 1; pagina <= 50; pagina++) {
    const r = await fetch(`${BASE}/produtos?limite=100&pagina=${pagina}`, { headers: headers() });
    const j: any = await r.json();
    if (j?.code !== 200) throw new Error(j?.data?.mensagem ?? "Erro no Gestão Click");
    for (const p of j.data ?? [])
      out.push({ id: String(p.id), nome: p.nome, codigo_interno: p.codigo_interno, estoque: Number(p.estoque) || 0 });
    if (!j.meta?.proxima_pagina) break;
  }
  return out;
}

async function gcGet(id: string): Promise<any | null> {
  const r = await fetch(`${BASE}/produtos/${id}`, { headers: headers() });
  const j: any = await r.json().catch(() => null);
  if (j?.code === 200 && j.data?.id) return j.data;
  const r2 = await fetch(`${BASE}/produtos?id=${encodeURIComponent(id)}`, { headers: headers() });
  const j2: any = await r2.json().catch(() => null);
  return (j2?.data ?? []).find((p: any) => String(p.id) === id) ?? null;
}

export async function gcSetEstoque(id: string, estoque: number) {
  const atual = await gcGet(id);
  if (!atual) throw new Error("Produto não encontrado no Gestão Click");
  const body = {
    nome: atual.nome,
    codigo_interno: atual.codigo_interno,
    valor_custo: atual.valor_custo,
    valor_venda: atual.valor_venda,
    valores: atual.valores,
    estoque,
  };
  const r = await fetch(`${BASE}/produtos/${id}`, { method: "PUT", headers: headers(), body: JSON.stringify(body) });
  const j: any = await r.json().catch(() => null);
  if (j?.code !== 200) throw new Error(j?.data?.mensagem ?? `Erro ${r.status}`);
  return atual.nome as string;
}

/** Pushes the site's total stock for every GestãoClick product linked to the given site products. */
export async function pushEstoqueGestaoClick(produtoIds: string[] | "all") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let gcIds: string[];
  if (produtoIds === "all") {
    const { data } = await supabaseAdmin.from("produtos").select("gestaoclick_id").not("gestaoclick_id", "is", null);
    gcIds = (data ?? []).map((p) => p.gestaoclick_id!) ;
  } else {
    if (!produtoIds.length) return { ok: 0, erros: 0 };
    const { data } = await supabaseAdmin.from("produtos").select("gestaoclick_id").in("id", produtoIds).not("gestaoclick_id", "is", null);
    gcIds = (data ?? []).map((p) => p.gestaoclick_id!);
  }
  gcIds = [...new Set(gcIds)];
  let ok = 0, erros = 0;
  for (const gid of gcIds) {
    const { data: prods } = await supabaseAdmin.from("produtos").select("id").eq("gestaoclick_id", gid);
    const ids = (prods ?? []).map((p) => p.id);
    const { data: vars } = await supabaseAdmin.from("variacoes_produto").select("quantidade_estoque").in("produto_id", ids);
    const total = (vars ?? []).reduce((s, v) => s + Math.max(0, v.quantidade_estoque), 0);
    try {
      const nome = await gcSetEstoque(gid, total);
      ok++;
      await supabaseAdmin.from("gestaoclick_sync_log").insert({ gestaoclick_id: gid, nome, estoque: total, ok: true });
    } catch (e) {
      erros++;
      console.error("[gestaoclick]", gid, e);
      await supabaseAdmin.from("gestaoclick_sync_log").insert({ gestaoclick_id: gid, estoque: total, ok: false, mensagem: String((e as Error).message ?? e).slice(0, 300) });
    }
  }
  return { ok, erros };
}
