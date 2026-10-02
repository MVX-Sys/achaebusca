import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X, ArrowUp, ArrowDown, Tags, ArrowRightLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/admin/categorias")({
  head: () => ({ meta: [{ title: "Categorias — Painel" }] }),
  component: CategoriasPage,
});

type Cat = { id: string; nome: string; slug: string; ordem: number };
type Prod = { id: string; nome: string; categoria_id: string | null };

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function CategoriasPage() {
  const qc = useQueryClient();
  const [novo, setNovo] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [moverDe, setMoverDe] = useState<Cat | null>(null);
  const [moverPara, setMoverPara] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-categorias"],
    queryFn: async () => {
      const [{ data: cats, error }, { data: prods, error: e2 }] = await Promise.all([
        supabase.from("categorias").select("id,nome,slug,ordem").order("ordem"),
        supabase.from("produtos").select("id,nome,categoria_id").order("nome"),
      ]);
      if (error) throw error;
      if (e2) throw e2;
      const contagem: Record<string, number> = {};
      (prods ?? []).forEach((p) => {
        if (p.categoria_id) contagem[p.categoria_id] = (contagem[p.categoria_id] ?? 0) + 1;
      });
      return { cats: (cats ?? []) as Cat[], contagem, prods: (prods ?? []) as Prod[] };
    },
  });
  const cats = data?.cats ?? [];
  const contagem = data?.contagem ?? {};
  const prods = data?.prods ?? [];
  const prodsDaCategoria = moverDe ? prods.filter((p) => p.categoria_id === moverDe.id) : [];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-categorias"] });
    qc.invalidateQueries({ queryKey: ["categorias"] });
    qc.invalidateQueries({ queryKey: ["produtos"] });
  };

  const nomeValido = (nome: string, ignoreId?: string) => {
    const n = nome.trim();
    if (n.length < 2) return "O nome precisa ter pelo menos 2 letras.";
    const slug = slugify(n);
    if (!slug) return "Nome inválido.";
    if (cats.some((c) => c.id !== ignoreId && c.slug === slug)) return "Já existe uma categoria com esse nome.";
    return null;
  };

  async function criar() {
    const err = nomeValido(novo);
    if (err) return toast.error(err);
    setBusy(true);
    const ordem = cats.reduce((m, c) => Math.max(m, c.ordem), 0) + 1;
    const { data: row, error } = await supabase
      .from("categorias")
      .insert({ nome: novo.trim(), slug: slugify(novo), ordem })
      .select("id")
      .single();
    setBusy(false);
    if (error) return toast.error("Erro ao criar: " + error.message);
    logAudit({ acao: "criar", entidade: "categoria", entidade_id: row?.id, descricao: `Criou categoria ${novo.trim()}` });
    toast.success("Categoria criada");
    setNovo("");
    refresh();
  }

  async function salvarEdicao(c: Cat) {
    const err = nomeValido(editNome, c.id);
    if (err) return toast.error(err);
    setBusy(true);
    const { error } = await supabase
      .from("categorias")
      .update({ nome: editNome.trim(), slug: slugify(editNome) })
      .eq("id", c.id);
    setBusy(false);
    if (error) return toast.error("Erro ao salvar: " + error.message);
    logAudit({ acao: "editar", entidade: "categoria", entidade_id: c.id, descricao: `Renomeou ${c.nome} para ${editNome.trim()}` });
    toast.success("Categoria renomeada");
    setEditId(null);
    refresh();
  }

  async function mover(c: Cat, dir: -1 | 1) {
    const idx = cats.findIndex((x) => x.id === c.id);
    const outro = cats[idx + dir];
    if (!outro) return;
    setBusy(true);
    const r1 = await supabase.from("categorias").update({ ordem: outro.ordem }).eq("id", c.id);
    const r2 = await supabase.from("categorias").update({ ordem: c.ordem === outro.ordem ? c.ordem + dir : c.ordem }).eq("id", outro.id);
    setBusy(false);
    if (r1.error || r2.error) return toast.error("Erro ao reordenar");
    refresh();
  }

  async function moverProdutos() {
    if (!moverDe || !moverPara || selecionados.size === 0) return;
    setBusy(true);
    const { error } = await supabase
      .from("produtos")
      .update({ categoria_id: moverPara })
      .in("id", Array.from(selecionados));
    setBusy(false);
    if (error) return toast.error("Erro ao mover produtos: " + error.message);
    const destino = cats.find((c) => c.id === moverPara)?.nome;
    logAudit({ acao: "editar", entidade: "categoria", entidade_id: moverDe.id, descricao: `Moveu ${selecionados.size} produto(s) de ${moverDe.nome} para ${destino}` });
    toast.success(`${selecionados.size} produto(s) movidos para ${destino}`);
    setMoverDe(null);
    setMoverPara("");
    setSelecionados(new Set());
    refresh();
  }

  function alternarSelecao(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function alternarTodos() {
    if (selecionados.size === prodsDaCategoria.length) setSelecionados(new Set());
    else setSelecionados(new Set(prodsDaCategoria.map((p) => p.id)));
  }

  async function excluir(c: Cat) {
    if ((contagem[c.id] ?? 0) > 0) {
      toast.error("Mova os produtos desta categoria para outra antes de excluir.");
      setMoverDe(c);
      return;
    }
    if (!confirm(`Excluir a categoria "${c.nome}"?`)) return;
    setBusy(true);
    const { error } = await supabase.from("categorias").delete().eq("id", c.id);
    setBusy(false);
    if (error) return toast.error("Erro ao excluir: " + error.message);
    logAudit({ acao: "excluir", entidade: "categoria", entidade_id: c.id, descricao: `Excluiu categoria ${c.nome}` });
    toast.success("Categoria excluída");
    refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold">
          <Tags className="h-6 w-6 text-primary" /> Categorias
        </h1>
        <p className="text-sm text-muted-foreground">
          Crie, renomeie, reordene e mova produtos entre categorias. As mudanças aparecem na loja.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 sm:flex-row">
        <input
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && criar()}
          placeholder="Nome da nova categoria"
          maxLength={60}
          className="h-10 flex-1 rounded-full border border-input bg-background px-4 text-sm"
        />
        <button
          onClick={criar}
          disabled={busy || !novo.trim()}
          className="flex h-10 items-center justify-center gap-1.5 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Criar categoria
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {isLoading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : cats.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nenhuma categoria.</p>
        ) : (
          <ul className="divide-y divide-border">
            {cats.map((c, i) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
                <div className="flex flex-col">
                  <button disabled={busy || i === 0} onClick={() => mover(c, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" title="Subir">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button disabled={busy || i === cats.length - 1} onClick={() => mover(c, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" title="Descer">
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  {editId === c.id ? (
                    <input
                      autoFocus
                      value={editNome}
                      onChange={(e) => setEditNome(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") salvarEdicao(c);
                        if (e.key === "Escape") setEditId(null);
                      }}
                      maxLength={60}
                      className="h-9 w-full rounded-full border border-input bg-background px-3 text-sm"
                    />
                  ) : (
                    <>
                      <p className="font-medium">{c.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {contagem[c.id] ?? 0} produto(s) · /{c.slug}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {editId === c.id ? (
                    <>
                      <IconBtn title="Salvar" onClick={() => salvarEdicao(c)} disabled={busy}><Check className="h-4 w-4" /></IconBtn>
                      <IconBtn title="Cancelar" onClick={() => setEditId(null)}><X className="h-4 w-4" /></IconBtn>
                    </>
                  ) : (
                    <>
                      <IconBtn title="Renomear" onClick={() => { setEditId(c.id); setEditNome(c.nome); }}><Pencil className="h-4 w-4" /></IconBtn>
                      <IconBtn title="Mover produtos para outra categoria" onClick={() => { setMoverDe(c); setMoverPara(""); }} disabled={(contagem[c.id] ?? 0) === 0}><ArrowRightLeft className="h-4 w-4" /></IconBtn>
                      <IconBtn title="Excluir" onClick={() => excluir(c)} danger disabled={busy}><Trash2 className="h-4 w-4" /></IconBtn>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {moverDe && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm" onClick={() => setMoverDe(null)}>
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-lg font-semibold">Mover produtos</h2>
            <p className="text-sm text-muted-foreground">
              Mover os {contagem[moverDe.id] ?? 0} produto(s) de <b>{moverDe.nome}</b> para:
            </p>
            <select
              value={moverPara}
              onChange={(e) => setMoverPara(e.target.value)}
              className="h-10 w-full rounded-full border border-input bg-background px-3 text-sm"
            >
              <option value="">Escolha a categoria</option>
              {cats.filter((c) => c.id !== moverDe.id).map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setMoverDe(null)} className="rounded-full px-4 py-2 text-sm hover:bg-accent">Cancelar</button>
              <button
                onClick={moverProdutos}
                disabled={busy || !moverPara}
                className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                Mover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, onClick, title, disabled, danger }: { children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors disabled:opacity-30 ${danger ? "hover:bg-destructive/10 hover:text-destructive" : "hover:bg-accent hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}
