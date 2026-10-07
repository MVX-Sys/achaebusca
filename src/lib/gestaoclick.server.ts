// Server-only GestãoClick API helpers. Never import from client code.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Db = SupabaseClient<Database>;

/** Uses the service-role client when that key exists (Lovable hosting); otherwise the caller's client (self-hosting). */
async function getDb(client?: Db): Promise<Db> {
  if (process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as unknown as Db;
  }
  if (!client) throw new Error("Sem acesso ao banco para sincronizar com o Gestão Click");
  return client;
}

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
  return null;
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

/** Max GestãoClick products per call: the hosted worker limits outbound requests per request. */
export const GC_LOTE = 12;

/** Pushes the site's total stock for every GestãoClick product linked to the given site products. */
export async function pushEstoqueGestaoClick(produtoIds: string[] | "all", client?: Db) {
  const supabaseAdmin = await getDb(client);
  let q = supabaseAdmin.from("produtos").select("id,gestaoclick_id").not("gestaoclick_id", "is", null);
  if (produtoIds !== "all") {
    if (!produtoIds.length) return { ok: 0, erros: 0 };
    // Products created on the site that aren't in GestãoClick yet: create them there and link.
    const { data: novos } = await supabaseAdmin
      .from("produtos")
      .select("id,nome,preco,hash_id,codigo_base,ativo")
      .in("id", produtoIds)
      .is("gestaoclick_id", null);
    for (const p of (novos ?? []).slice(0, 4)) {
      if (!p.ativo) continue;
      const { data: vs } = await supabaseAdmin.from("variacoes_produto").select("quantidade_estoque").eq("produto_id", p.id);
      const estoque = (vs ?? []).reduce((s, v) => s + Math.max(0, v.quantidade_estoque), 0);
      try {
        const gid = await gcCriar({ nome: p.nome, codigo: p.hash_id || p.codigo_base, preco: Number(p.preco), estoque });
        await supabaseAdmin.from("produtos").update({ gestaoclick_id: gid }).eq("id", p.id);
        await supabaseAdmin.from("gestaoclick_sync_log").insert({ gestaoclick_id: gid, nome: p.nome, estoque, ok: true, mensagem: "Criado no Gestão Click" });
      } catch (e) {
        console.error("[gestaoclick] criar", p.id, e);
        await supabaseAdmin.from("gestaoclick_sync_log").insert({ gestaoclick_id: "-", nome: p.nome, estoque, ok: false, mensagem: `Falha ao criar: ${String((e as Error).message ?? e).slice(0, 250)}` });
      }
    }
    const { data: alvo } = await supabaseAdmin.from("produtos").select("gestaoclick_id").in("id", produtoIds).not("gestaoclick_id", "is", null);
    const gids = [...new Set((alvo ?? []).map((p) => p.gestaoclick_id!))];
    if (!gids.length) return { ok: 0, erros: 0 };
    q = q.in("gestaoclick_id", gids);
  }
  const { data: prods } = await q;
  const porGc = new Map<string, string[]>();
  for (const p of prods ?? []) porGc.set(p.gestaoclick_id!, [...(porGc.get(p.gestaoclick_id!) ?? []), p.id]);
  const gcIds = [...porGc.keys()].slice(0, GC_LOTE);
  const todosIds = gcIds.flatMap((g) => porGc.get(g)!);
  const { data: vars } = todosIds.length
    ? await supabaseAdmin.from("variacoes_produto").select("produto_id,quantidade_estoque").in("produto_id", todosIds)
    : { data: [] as { produto_id: string; quantidade_estoque: number }[] };
  const porProd = new Map<string, number>();
  for (const v of vars ?? []) porProd.set(v.produto_id, (porProd.get(v.produto_id) ?? 0) + Math.max(0, v.quantidade_estoque));
  let ok = 0, erros = 0;
  const logs: any[] = [];
  await Promise.all(
    gcIds.map(async (gid) => {
      const total = porGc.get(gid)!.reduce((s, id) => s + (porProd.get(id) ?? 0), 0);
      try {
        const nome = await gcSetEstoque(gid, total);
        ok++;
        logs.push({ gestaoclick_id: gid, nome, estoque: total, ok: true });
      } catch (e) {
        erros++;
        console.error("[gestaoclick]", gid, e);
        logs.push({ gestaoclick_id: gid, estoque: total, ok: false, mensagem: String((e as Error).message ?? e).slice(0, 300) });
      }
    }),
  );
  if (logs.length) await supabaseAdmin.from("gestaoclick_sync_log").insert(logs);
  return { ok, erros, restantes: Math.max(0, porGc.size - gcIds.length) };
}

/** All linked site product ids, used by the client to sync in batches. */
export async function listProdutosVinculados(client?: Db) {
  const supabaseAdmin = await getDb(client);
  const { data } = await supabaseAdmin.from("produtos").select("id,gestaoclick_id").not("gestaoclick_id", "is", null);
  const vistos = new Set<string>();
  return (data ?? []).filter((p) => !vistos.has(p.gestaoclick_id!) && vistos.add(p.gestaoclick_id!)).map((p) => p.id);
}

async function gcCriar(p: { nome: string; codigo: string; preco: number; estoque: number }) {
  const body = { nome: p.nome, codigo_interno: p.codigo, valor_venda: p.preco, valor_custo: 0, estoque: p.estoque };
  const r = await fetch(`${BASE}/produtos`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  const j: any = await r.json().catch(() => null);
  if (j?.code !== 200 || !j.data?.id) throw new Error(j?.data?.mensagem ?? `Erro ${r.status}`);
  return String(j.data.id);
}

async function gcDesativar(id: string) {
  const atual = await gcGet(id);
  if (!atual) return;
  const body = { nome: atual.nome, codigo_interno: atual.codigo_interno, valor_custo: atual.valor_custo, valor_venda: atual.valor_venda, valores: atual.valores, ativo: "0" };
  await fetch(`${BASE}/produtos/${id}`, { method: "PUT", headers: headers(), body: JSON.stringify(body) });
}

/** Two-way product sync, run on demand. Deletions only deactivate. Limited writes per call. */
export async function syncMaoDupla(client?: Db) {
  const supabaseAdmin = await getDb(client);
  const gcLista = await gcListProdutosCompleto();
  const gcMap = new Map(gcLista.map((g) => [g.id, g]));
  const { data: prods } = await supabaseAdmin.from("produtos").select("id,nome,preco,ativo,codigo_base,gestaoclick_id");
  const vinculados = new Set((prods ?? []).map((p) => p.gestaoclick_id).filter(Boolean) as string[]);
  const r = { atualizados: 0, desativadosSite: 0, criadosSite: 0, criadosGc: 0, desativadosGc: 0, restantes: false };
  let escritasGc = 0;
  for (const p of prods ?? []) {
    if (p.gestaoclick_id) {
      const g = gcMap.get(p.gestaoclick_id);
      if (!g || !g.ativo) {
        if (p.ativo) { await supabaseAdmin.from("produtos").update({ ativo: false }).eq("id", p.id); r.desativadosSite++; }
        continue;
      }
      if (!p.ativo) {
        if (escritasGc >= GC_LOTE) { r.restantes = true; continue; }
        await gcDesativar(p.gestaoclick_id); escritasGc++; r.desativadosGc++;
        continue;
      }
      const upd: { nome?: string; preco?: number } = {};
      if (g.nome && g.nome !== p.nome) upd.nome = g.nome;
      if (g.preco > 0 && Number(g.preco) !== Number(p.preco)) upd.preco = g.preco;
      if (Object.keys(upd).length) { await supabaseAdmin.from("produtos").update(upd).eq("id", p.id); r.atualizados++; }
    } else if (p.ativo) {
      if (escritasGc >= GC_LOTE) { r.restantes = true; continue; }
      const { data: vars } = await supabaseAdmin.from("variacoes_produto").select("quantidade_estoque").eq("produto_id", p.id);
      const estoque = (vars ?? []).reduce((s, v) => s + Math.max(0, v.quantidade_estoque), 0);
      try {
        const gid = await gcCriar({ nome: p.nome, codigo: p.codigo_base, preco: Number(p.preco), estoque });
        escritasGc++;
        await supabaseAdmin.from("produtos").update({ gestaoclick_id: gid }).eq("id", p.id);
        vinculados.add(gid); r.criadosGc++;
      } catch (e) { console.error("[gestaoclick] criar", p.id, e); escritasGc++; }
    }
  }
  for (const g of gcLista) {
    if (vinculados.has(g.id) || !g.ativo) continue;
    const codigo = (g.codigo_interno || g.nome).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) || `GC${g.id}`;
    const { error } = await supabaseAdmin.from("produtos").insert({ nome: g.nome, preco: g.preco || 0, codigo_base: codigo, ativo: false, gestaoclick_id: g.id } as any);
    if (!error) r.criadosSite++; else console.error("[gestaoclick] importar", g.id, error.message);
  }
  return r;
}

type GcCompleto = { id: string; nome: string; codigo_interno: string; preco: number; ativo: boolean };
async function gcListProdutosCompleto(): Promise<GcCompleto[]> {
  const out: GcCompleto[] = [];
  for (let pagina = 1; pagina <= 20; pagina++) {
    const r = await fetch(`${BASE}/produtos?limite=100&pagina=${pagina}`, { headers: headers() });
    const j: any = await r.json();
    if (j?.code !== 200) throw new Error(j?.data?.mensagem ?? "Erro no Gestão Click");
    for (const p of j.data ?? [])
      out.push({ id: String(p.id), nome: p.nome, codigo_interno: p.codigo_interno ?? "", preco: precoAtacado(p), ativo: String(p.ativo ?? "1") !== "0" });
    if (!j.meta?.proxima_pagina) break;
  }
  return out;
}

/** Wholesale (ATACADO) price from GestãoClick, falling back to the default sale price. */
export function precoAtacado(p: any): number {
  const v = (p?.valores ?? []).find((x: any) => /atacado/i.test(String(x?.nome_tipo ?? "")));
  const n = Number(v?.valor_venda);
  return n > 0 ? n : Number(p?.valor_venda) || 0;
}

export async function gcExportarProdutos() {
  const out: any[] = [];
  for (let pagina = 1; pagina <= 50; pagina++) {
    const r = await fetch(`${BASE}/produtos?limite=100&pagina=${pagina}`, { headers: headers() });
    const j: any = await r.json();
    if (j?.code !== 200) throw new Error(j?.data?.mensagem ?? "Erro no Gestão Click");
    for (const p of j.data ?? [])
      out.push({
        id: String(p.id), nome: p.nome, codigo_interno: p.codigo_interno ?? "", codigo_barra: p.codigo_barra ?? "",
        preco_atacado: precoAtacado(p), preco_varejo: Number(p.valor_venda) || 0,
        estoque: Number(p.estoque) || 0, ativo: String(p.ativo ?? "1") !== "0",
      });
    if (!j.meta?.proxima_pagina) break;
  }
  return out;
}

export type GcEntrada = { id: string; nome: string; codigo_interno: string; preco: number; ativo: boolean };
export type Mudanca = {
  gcId: string; tipo: "atualizar" | "vincular" | "importar"; produtoId: string | null;
  nomeAtual: string | null; nomeNovo: string; precoAtual: number | null; precoNovo: number; codigo: string;
};
const limpa = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Computes the changes a GestãoClick restore would make, without writing anything. */
export async function planejarRestauracao(client: Db | undefined, entrada?: GcEntrada[]) {
  const db = await getDb(client);
  const gc = entrada ?? (await gcListProdutosCompleto());
  const { data: prods } = await db.from("produtos").select("id,nome,preco,codigo_base,gestaoclick_id");
  const porGid = new Map((prods ?? []).filter((p) => p.gestaoclick_id).map((p) => [p.gestaoclick_id!, p]));
  const porCodigo = new Map((prods ?? []).filter((p) => !p.gestaoclick_id).map((p) => [limpa(p.codigo_base), p]));
  const out: Mudanca[] = [];
  for (const g of gc) {
    if (!g.ativo) continue;
    let p = porGid.get(g.id);
    let tipo: Mudanca["tipo"] = "atualizar";
    if (!p && g.codigo_interno) { p = porCodigo.get(limpa(g.codigo_interno)); if (p) tipo = "vincular"; }
    const codigo = limpa(g.codigo_interno || g.nome).slice(0, 20) || `GC${g.id}`;
    if (p) {
      const nomeMuda = !!g.nome && g.nome !== p.nome;
      const precoMuda = g.preco > 0 && Number(g.preco) !== Number(p.preco);
      if (tipo === "atualizar" && !nomeMuda && !precoMuda) continue;
      out.push({ gcId: g.id, tipo, produtoId: p.id, nomeAtual: p.nome, nomeNovo: g.nome || p.nome, precoAtual: Number(p.preco), precoNovo: g.preco > 0 ? g.preco : Number(p.preco), codigo });
    } else {
      out.push({ gcId: g.id, tipo: "importar", produtoId: null, nomeAtual: null, nomeNovo: g.nome, precoAtual: null, precoNovo: g.preco || 0, codigo });
    }
  }
  return out;
}

/** Applies only the reviewed changes. Never deletes. */
export async function aplicarRestauracao(client: Db | undefined, mudancas: Mudanca[]) {
  const db = await getDb(client);
  const r = { atualizados: 0, vinculados: 0, importados: 0, erros: 0 };
  for (const m of mudancas) {
    if (m.produtoId) {
      const upd: Record<string, unknown> = { nome: m.nomeNovo, preco: m.precoNovo };
      if (m.tipo === "vincular") upd.gestaoclick_id = m.gcId;
      const { error } = await db.from("produtos").update(upd as any).eq("id", m.produtoId);
      if (error) r.erros++; else m.tipo === "vincular" ? r.vinculados++ : r.atualizados++;
    } else {
      const { error } = await db.from("produtos").insert({ nome: m.nomeNovo, preco: m.precoNovo, codigo_base: m.codigo, ativo: false, gestaoclick_id: m.gcId } as any);
      if (error) r.erros++; else r.importados++;
    }
  }
  return r;
}
