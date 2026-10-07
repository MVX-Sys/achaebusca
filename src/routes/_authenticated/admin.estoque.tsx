import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Minus, Plus, Trash2, Save, Boxes, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { StockHistory } from "@/components/stock-history";
import { useServerFn } from "@tanstack/react-start";
import { syncGestaoClick } from "@/lib/gestaoclick.functions";

export const Route = createFileRoute("/_authenticated/admin/estoque")({
  head: () => ({ meta: [{ title: "Estoque — Painel" }] }),
  component: EstoquePage,
});

type Var = {
  id: string;
  produto_id: string;
  nome_cor: string;
  hex_cor: string;
  tamanho: string;
  quantidade_estoque: number;
  produto: { id: string; nome: string; hash_id: string | null; categoria_id: string | null; ativo: boolean } | null;
};

function EstoquePage() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState("todas");
  const [filtro, setFiltro] = useState<"todos" | "baixo" | "zerado">("todos");
  const [limite, setLimite] = useState(5);
  const [edits, setEdits] = useState<Record<string, Partial<Var>>>({});
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [lote, setLote] = useState("");
  const [loteModo, setLoteModo] = useState<"somar" | "definir">("somar");
  const [salvando, setSalvando] = useState(false);
  const [novo, setNovo] = useState({ produto_id: "", nome_cor: "", hex_cor: "#000000", tamanho: "", qtd: "0" });

  const { data: vars = [], isLoading } = useQuery({
    queryKey: ["admin-estoque"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("variacoes_produto")
        .select("*, produto:produtos(id,nome,hash_id,categoria_id,ativo)")
        .order("criado_em");
      if (error) throw error;
      return (data ?? []) as unknown as Var[];
    },
  });
  const { data: cats = [] } = useQuery({
    queryKey: ["admin-categorias-estoque"],
    queryFn: async () => (await supabase.from("categorias").select("id,nome").order("ordem")).data ?? [],
  });
  const { data: prods = [] } = useQuery({
    queryKey: ["admin-produtos-estoque"],
    queryFn: async () =>
      (await supabase.from("produtos").select("id,nome,hash_id").order("nome")).data ?? [],
  });

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return vars
      .filter((v) => cat === "todas" || v.produto?.categoria_id === cat)
      .filter((v) =>
        filtro === "zerado" ? v.quantidade_estoque <= 0 : filtro === "baixo" ? v.quantidade_estoque <= limite : true,
      )
      .filter(
        (v) =>
          !q ||
          [v.produto?.nome, v.produto?.hash_id, v.nome_cor, v.tamanho].some((s) => s?.toLowerCase().includes(q)),
      )
      .sort((a, b) => (a.produto?.nome ?? "").localeCompare(b.produto?.nome ?? "", "pt-BR"));
  }, [vars, busca, cat, filtro, limite]);

  const totais = useMemo(() => {
    const pecas = vars.reduce((s, v) => s + Math.max(0, v.quantidade_estoque), 0);
    return {
      pecas,
      zeradas: vars.filter((v) => v.quantidade_estoque <= 0).length,
      baixas: vars.filter((v) => v.quantidade_estoque > 0 && v.quantidade_estoque <= limite).length,
    };
  }, [vars, limite]);

  const syncGc = useServerFn(syncGestaoClick);
  const refresh = (produtoIds: (string | undefined | null)[] = []) => {
    qc.invalidateQueries({ queryKey: ["admin-estoque"] });
    qc.invalidateQueries({ queryKey: ["estoque-historico"] });
    qc.invalidateQueries({ queryKey: ["produtos"] });
    const ids = [...new Set(produtoIds.filter(Boolean) as string[])];
    if (ids.length)
      syncGc({ data: { produtoIds: ids } })
        .then(() => qc.invalidateQueries({ queryKey: ["gestaoclick-log"] }))
        .catch((e) => console.error("Gestão Click:", e));
  };
  const pidsDe = (ids: Iterable<string>) => [...ids].map((id) => vars.find((x) => x.id === id)?.produto_id);

  const valor = (v: Var) => ({ ...v, ...edits[v.id] });
  const setEdit = (id: string, patch: Partial<Var>) =>
    setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));

  async function salvarTudo() {
    const ids = Object.keys(edits);
    if (!ids.length) return;
    setSalvando(true);
    let erros = 0;
    for (const id of ids) {
      const e = edits[id];
      const payload: Record<string, unknown> = {};
      if (e.quantidade_estoque !== undefined) payload.quantidade_estoque = Math.max(0, Math.floor(Number(e.quantidade_estoque) || 0));
      if (e.nome_cor !== undefined) payload.nome_cor = e.nome_cor.trim();
      if (e.hex_cor !== undefined) payload.hex_cor = e.hex_cor;
      if (e.tamanho !== undefined) payload.tamanho = e.tamanho.trim();
      if (payload.nome_cor === "" || payload.tamanho === "") { erros++; continue; }
      const { error } = await supabase.from("variacoes_produto").update(payload as never).eq("id", id);
      if (error) erros++;
    }
    await logAudit({ acao: "editar", entidade: "variacao", descricao: `Estoque: ${ids.length} variação(ões) editada(s)` });
    setSalvando(false);
    setEdits({});
    refresh(pidsDe(ids));
    erros ? toast.error(`${erros} alteração(ões) não foram salvas`) : toast.success("Estoque atualizado");
  }

  async function ajustar(v: Var, delta: number) {
    const nova = Math.max(0, v.quantidade_estoque + delta);
    const { error } = await supabase.from("variacoes_produto").update({ quantidade_estoque: nova }).eq("id", v.id);
    if (error) return toast.error("Erro ao ajustar");
    refresh([v.produto_id]);
  }

  async function aplicarLote() {
    const n = Math.floor(Number(lote));
    if (!sel.size || Number.isNaN(n)) return toast.error("Selecione variações e informe um número");
    setSalvando(true);
    for (const id of sel) {
      const v = vars.find((x) => x.id === id);
      if (!v) continue;
      const nova = Math.max(0, loteModo === "somar" ? v.quantidade_estoque + n : n);
      await supabase.from("variacoes_produto").update({ quantidade_estoque: nova }).eq("id", id);
    }
    await logAudit({ acao: "editar", entidade: "variacao", descricao: `Ajuste em lote (${loteModo} ${n}) em ${sel.size} variação(ões)` });
    setSalvando(false);
    refresh(pidsDe(sel));
    setSel(new Set());
    setLote("");
    toast.success("Ajuste em lote aplicado");
  }

  async function excluir(v: Var) {
    if (!confirm(`Excluir a variação ${v.nome_cor} / ${v.tamanho} de ${v.produto?.nome}?`)) return;
    const { error } = await supabase.from("variacoes_produto").delete().eq("id", v.id);
    if (error) return toast.error("Não foi possível excluir (pode estar ligada a pedidos)");
    await logAudit({ acao: "excluir", entidade: "variacao", entidade_id: v.id, descricao: `${v.produto?.nome} ${v.nome_cor}/${v.tamanho}` });
    refresh([v.produto_id]);
    toast.success("Variação excluída");
  }

  async function criar() {
    if (!novo.produto_id || !novo.nome_cor.trim() || !novo.tamanho.trim()) return toast.error("Preencha produto, cor e tamanho");
    const { error } = await supabase.from("variacoes_produto").insert({
      produto_id: novo.produto_id,
      nome_cor: novo.nome_cor.trim(),
      hex_cor: novo.hex_cor,
      tamanho: novo.tamanho.trim(),
      quantidade_estoque: Math.max(0, Math.floor(Number(novo.qtd) || 0)),
    });
    if (error) return toast.error("Erro ao criar variação");
    await logAudit({ acao: "criar", entidade: "variacao", descricao: `Nova variação ${novo.nome_cor}/${novo.tamanho}` });
    setNovo({ ...novo, nome_cor: "", tamanho: "", qtd: "0" });
    refresh([novo.produto_id]);
    toast.success("Variação criada");
  }

  const todosSel = lista.length > 0 && lista.every((v) => sel.has(v.id));
  const input = "h-9 rounded-md border border-input bg-background px-2 text-sm";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Boxes className="h-6 w-6 text-primary" />
        <h1 className="font-display text-2xl font-semibold">Estoque</h1>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Peças em estoque" v={totais.pecas} />
        <Stat label={`Estoque baixo (≤${limite})`} v={totais.baixas} />
        <Stat label="Esgotadas" v={totais.zeradas} destaque />
      </div>


      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Nova variação</h2>
        <div className="grid gap-2 sm:grid-cols-6">
          <select className={`${input} sm:col-span-2`} value={novo.produto_id} onChange={(e) => setNovo({ ...novo, produto_id: e.target.value })}>
            <option value="">Produto...</option>
            {prods.map((p: any) => (
              <option key={p.id} value={p.id}>{p.hash_id ? `[${p.hash_id}] ` : ""}{p.nome}</option>
            ))}
          </select>
          <input className={input} placeholder="Cor" value={novo.nome_cor} onChange={(e) => setNovo({ ...novo, nome_cor: e.target.value })} />
          <input type="color" className={`${input} p-1`} value={novo.hex_cor} onChange={(e) => setNovo({ ...novo, hex_cor: e.target.value })} />
          <input className={input} placeholder="Tamanho" value={novo.tamanho} onChange={(e) => setNovo({ ...novo, tamanho: e.target.value })} />
          <div className="flex gap-2">
            <input type="number" min={0} className={`${input} w-20`} value={novo.qtd} onChange={(e) => setNovo({ ...novo, qtd: e.target.value })} />
            <button onClick={criar} className="h-9 flex-1 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground">Criar</button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <input className={`${input} w-full sm:w-64`} placeholder="Buscar produto, código, cor..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          <select className={input} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="todas">Todas categorias</option>
            {cats.map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select className={input} value={filtro} onChange={(e) => setFiltro(e.target.value as any)}>
            <option value="todos">Todos</option>
            <option value="baixo">Estoque baixo</option>
            <option value="zerado">Esgotados</option>
          </select>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            Limite baixo
            <input type="number" min={0} className={`${input} w-16`} value={limite} onChange={(e) => setLimite(Math.max(0, Number(e.target.value) || 0))} />
          </label>
          {Object.keys(edits).length > 0 && (
            <button disabled={salvando} onClick={salvarTudo} className="ml-auto flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground">
              <Save className="h-4 w-4" /> Salvar {Object.keys(edits).length} alteração(ões)
            </button>
          )}
        </div>

        {sel.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/50 p-3 text-sm">
            <span className="font-semibold">{sel.size} selecionada(s)</span>
            <select className={input} value={loteModo} onChange={(e) => setLoteModo(e.target.value as any)}>
              <option value="somar">Somar / subtrair</option>
              <option value="definir">Definir quantidade</option>
            </select>
            <input type="number" className={`${input} w-24`} placeholder={loteModo === "somar" ? "+10 / -5" : "0"} value={lote} onChange={(e) => setLote(e.target.value)} />
            <button disabled={salvando} onClick={aplicarLote} className="h-9 rounded-md bg-primary px-3 font-semibold text-primary-foreground">Aplicar</button>
            <button onClick={() => setSel(new Set())} className="h-9 px-2 text-muted-foreground">Limpar</button>
          </div>
        )}

        <div className="max-h-[600px] overflow-auto">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Carregando...</p>
          ) : lista.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Nenhuma variação encontrada.</p>
          ) : (
            <table className="w-full min-w-[760px] text-sm">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-3">
                    <input type="checkbox" checked={todosSel} onChange={() => setSel(todosSel ? new Set() : new Set(lista.map((v) => v.id)))} />
                  </th>
                  <th className="p-3">Produto</th>
                  <th className="p-3">Cor</th>
                  <th className="p-3">Tamanho</th>
                  <th className="p-3 text-center">Quantidade</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lista.map((v) => {
                  const e = valor(v);
                  const q = v.quantidade_estoque;
                  return (
                    <tr key={v.id} className={edits[v.id] ? "bg-primary/5" : ""}>
                      <td className="p-3">
                        <input type="checkbox" checked={sel.has(v.id)} onChange={() => {
                          const s = new Set(sel); s.has(v.id) ? s.delete(v.id) : s.add(v.id); setSel(s);
                        }} />
                      </td>
                      <td className="p-3">
                        <div className="font-medium">{v.produto?.nome ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {v.produto?.hash_id}{v.produto && !v.produto.ativo ? " · inativo" : ""}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <input type="color" value={e.hex_cor} onChange={(ev) => setEdit(v.id, { hex_cor: ev.target.value })} className="h-7 w-7 cursor-pointer rounded border border-input bg-background p-0.5" />
                          <input className={`${input} h-8 w-28`} value={e.nome_cor} onChange={(ev) => setEdit(v.id, { nome_cor: ev.target.value })} />
                        </div>
                      </td>
                      <td className="p-3">
                        <input className={`${input} h-8 w-16`} value={e.tamanho} onChange={(ev) => setEdit(v.id, { tamanho: ev.target.value })} />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => ajustar(v, -1)} disabled={q <= 0} className="grid h-8 w-8 place-items-center rounded-md border border-input hover:bg-accent disabled:opacity-40"><Minus className="h-3.5 w-3.5" /></button>
                          <input type="number" min={0} className={`${input} h-8 w-20 text-center tabular-nums ${q <= 0 ? "text-destructive" : ""}`} value={e.quantidade_estoque}
                            onChange={(ev) => setEdit(v.id, { quantidade_estoque: ev.target.value as unknown as number })} />
                          <button onClick={() => ajustar(v, 1)} className="grid h-8 w-8 place-items-center rounded-md border border-input hover:bg-accent"><Plus className="h-3.5 w-3.5" /></button>
                          {q > 0 && q <= limite && <AlertTriangle className="h-4 w-4 text-primary" aria-label="Estoque baixo" />}
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <button onClick={() => excluir(v)} className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Excluir variação">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <StockHistory />
    </div>
  );
}

function Stat({ label, v, destaque }: { label: string; v: number; destaque?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-display text-2xl font-semibold tabular-nums ${destaque && v > 0 ? "text-destructive" : ""}`}>{v}</p>
    </div>
  );
}
