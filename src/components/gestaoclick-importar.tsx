import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Settings2, X } from "lucide-react";
import { importarSelecionadosGc, listImportaveisGc } from "@/lib/gestaoclick.functions";

type Escolha = { preco: "atacado" | "varejo"; codigo: string; imagem: string; ativo: boolean };
const limpa = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function GestaoClickImportar() {
  const qc = useQueryClient();
  const listar = useServerFn(listImportaveisGc);
  const importar = useServerFn(importarSelecionadosGc);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Record<string, Escolha>>({});
  const [editando, setEditando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const { data: itens = [], isLoading, error } = useQuery({
    queryKey: ["gc-importaveis"],
    queryFn: () => listar(),
    enabled: aberto,
    staleTime: 2 * 60_000,
  });

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((g) => !g.vinculado && (!q || [g.nome, g.codigo_interno].some((s) => s?.toLowerCase().includes(q))));
  }, [itens, busca]);

  const toggle = (g: (typeof itens)[number]) =>
    setSel((s) => {
      const n = { ...s };
      if (n[g.id]) delete n[g.id];
      else n[g.id] = { preco: g.atacado > 0 ? "atacado" : "varejo", codigo: limpa(g.codigo_interno || g.nome) || `GC${g.id}`, imagem: g.fotos[0] ?? "", ativo: true };
      return n;
    });
  const muda = (id: string, p: Partial<Escolha>) => setSel((s) => ({ ...s, [id]: { ...s[id], ...p } }));

  async function importarTudo() {
    const escolhidos = itens.filter((g) => sel[g.id]);
    if (escolhidos.some((g) => !sel[g.id].codigo)) return toast.error("Todo item precisa de um código");
    setOcupado(true);
    let criados = 0; const erros: string[] = [];
    try {
      for (let i = 0; i < escolhidos.length; i += 12) {
        const r = await importar({
          data: {
            itens: escolhidos.slice(i, i + 12).map((g) => {
              const e = sel[g.id];
              return {
                gcId: g.id, nome: g.nome, preco: e.preco === "atacado" ? g.atacado : g.varejo,
                codigo: e.codigo, imagemUrl: e.imagem.trim() || null, estoque: g.estoque, ativo: e.ativo,
              };
            }),
          },
        });
        criados += r.criados; erros.push(...r.erros);
      }
      toast.success(`${criados} produto(s) importado(s) para o site`);
      if (erros.length) toast.error(erros.slice(0, 3).join(" · "));
      setSel({});
    } catch (e) {
      toast.error(`Erro ao importar: ${(e as Error).message}`);
    }
    setOcupado(false);
    qc.invalidateQueries({ queryKey: ["gc-importaveis"] });
    qc.invalidateQueries({ queryKey: ["produtos-gc-link"] });
  }

  const input = "h-9 rounded-md border border-input bg-background px-2 text-sm";
  const qtd = Object.keys(sel).length;
  const atual = editando ? itens.find((g) => g.id === editando) : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Download className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-semibold">Importar do Gestão Click</h2>
        <span className="text-xs text-muted-foreground">Escolha quais itens entram no site</span>
        <div className="ml-auto flex gap-2">
          {qtd > 0 && (
            <button disabled={ocupado} onClick={importarTudo} className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground">
              {ocupado ? "Importando..." : `Importar ${qtd} selecionado(s)`}
            </button>
          )}
          <button onClick={() => setAberto(!aberto)} className="h-9 px-2 text-sm text-primary">
            {aberto ? "Fechar" : "Escolher itens"}
          </button>
        </div>
      </div>

      {aberto && (
        <div className="mt-4 space-y-2">
          <input className={`${input} w-full sm:w-72`} placeholder="Buscar no Gestão Click..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          {isLoading && <p className="text-sm text-muted-foreground">Carregando itens do Gestão Click...</p>}
          {error && <p className="text-sm text-destructive">Erro ao carregar itens do Gestão Click.</p>}
          {!isLoading && !error && lista.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum item novo — todos já estão no site.</p>
          )}
          <div className="max-h-[28rem] divide-y divide-border overflow-auto rounded-md border border-border">
            {lista.map((g) => {
              const e = sel[g.id];
              return (
                <div key={g.id} className="flex flex-wrap items-center gap-2 p-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={!!e} onChange={() => toggle(g)} />
                  {(e?.imagem || g.fotos[0]) ? (
                    <img src={e?.imagem || g.fotos[0]} alt="" className="h-10 w-10 rounded object-cover" loading="lazy" />
                  ) : (
                    <div className="h-10 w-10 rounded bg-muted" />
                  )}
                  <div className="min-w-40 flex-1">
                    <p className="font-medium">{g.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      Atacado {brl(g.atacado)} · Varejo {brl(g.varejo)} · estoque {g.estoque}
                    </p>
                  </div>
                  {e && (
                    <>
                      <span className="text-xs text-muted-foreground">
                        {e.preco === "atacado" ? "Atacado" : "Varejo"} · {e.codigo || "sem código"}
                      </span>
                      <button onClick={() => setEditando(g.id)} className="flex h-8 items-center gap-1 rounded-md border border-input px-2 text-xs hover:bg-accent">
                        <Settings2 className="h-3.5 w-3.5" /> Ajustar
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {atual && sel[atual.id] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4" onClick={() => setEditando(null)}>
          <div className="w-full max-w-md space-y-3 rounded-2xl border border-border bg-card p-4" onClick={(ev) => ev.stopPropagation()}>
            <div className="flex items-center">
              <h3 className="flex-1 font-semibold">{atual.nome}</h3>
              <button onClick={() => setEditando(null)}><X className="h-5 w-5" /></button>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">Preço no site</p>
              <div className="grid grid-cols-2 gap-2">
                {(["atacado", "varejo"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => muda(atual.id, { preco: t })}
                    className={`rounded-md border p-2 text-sm ${sel[atual.id].preco === t ? "border-primary bg-primary/10 text-primary" : "border-input"}`}
                  >
                    {t === "atacado" ? "Atacado" : "Varejo"}
                    <br />
                    <b>{brl(t === "atacado" ? atual.atacado : atual.varejo)}</b>
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">Código (letras e números)</span>
              <input className={`${input} w-full`} value={sel[atual.id].codigo} onChange={(ev) => muda(atual.id, { codigo: limpa(ev.target.value) })} />
            </label>
            <div>
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">Imagem</span>
              {atual.fotos.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {atual.fotos.map((f) => (
                    <button key={f} onClick={() => muda(atual.id, { imagem: f })}>
                      <img src={f} alt="" className={`h-14 w-14 rounded object-cover ${sel[atual.id].imagem === f ? "ring-2 ring-primary" : ""}`} />
                    </button>
                  ))}
                </div>
              )}
              <input className={`${input} w-full`} placeholder="Link da imagem (opcional)" value={sel[atual.id].imagem} onChange={(ev) => muda(atual.id, { imagem: ev.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-primary" checked={sel[atual.id].ativo} onChange={(ev) => muda(atual.id, { ativo: ev.target.checked })} />
              Já mostrar no site
            </label>
            <button onClick={() => setEditando(null)} className="h-9 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground">Pronto</button>
          </div>
        </div>
      )}
    </div>
  );
}
