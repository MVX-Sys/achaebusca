import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Plus, Settings2, Trash2, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { importarSelecionadosGc, listImportaveisGc } from "@/lib/gestaoclick.functions";

type Cor = { nome: string; hex: string; estoque: number };
type Escolha = { preco: "atacado" | "varejo"; codigo: string; fotos: string[]; locais: File[]; link: string; cores: Cor[]; ativo: boolean };
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
      else n[g.id] = { preco: g.atacado > 0 ? "atacado" : "varejo", codigo: limpa(g.codigo_interno || g.nome) || `GC${g.id}`, fotos: g.fotos.slice(0, 1), locais: [], link: "", cores: [], ativo: true };
      return n;
    });
  const muda = (id: string, p: Partial<Escolha>) => setSel((s) => ({ ...s, [id]: { ...({ fotos: [], locais: [], link: "", cores: [] } as Partial<Escolha>), ...s[id], ...p } as Escolha }));

  async function importarTudo() {
    const escolhidos = itens.filter((g) => sel[g.id]);
    if (escolhidos.some((g) => !sel[g.id].codigo)) return toast.error("Todo item precisa de um código");
    if (escolhidos.some((g) => sel[g.id].cores.some((c) => !c.nome.trim()))) return toast.error("Toda cor precisa de um nome");
    setOcupado(true);
    let criados = 0; const erros: string[] = [];
    try {
      for (let i = 0; i < escolhidos.length; i += 12) {
        const lote = await Promise.all(escolhidos.slice(i, i + 12).map(async (g) => {
          const e = sel[g.id];
          const storagePaths: string[] = [];
          for (const f of e.locais) {
            const ext = (f.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
            const path = `gc-import/${crypto.randomUUID()}.${ext}`;
            const { error: upErr } = await supabase.storage.from("product-images")
              .upload(path, f, { contentType: f.type, cacheControl: "31536000" });
            if (upErr) throw new Error(`${g.nome}: imagem ${f.name} não enviada`);
            storagePaths.push(path);
          }
          const link = e.link.trim();
          return {
            gcId: g.id, nome: g.nome, preco: e.preco === "atacado" ? g.atacado : g.varejo, codigo: e.codigo,
            imagemUrls: [...e.fotos, ...(link && !e.fotos.includes(link) ? [link] : [])], storagePaths,
            cores: e.cores.map((c) => ({ ...c, nome: c.nome.trim() })), estoque: g.estoque, ativo: e.ativo,
          };
        }));
        const r = await importar({ data: { itens: lote } });
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
                  {(e?.fotos?.[0] || g.fotos[0]) ? (
                    <img src={e?.fotos?.[0] || g.fotos[0]} alt="" className="h-10 w-10 rounded object-cover" loading="lazy" />
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
                        {e.preco === "atacado" ? "Atacado" : "Varejo"} · {e.codigo || "sem código"} · {e.cores?.length || 1} cor(es) · {(e.fotos?.length ?? 0) + (e.locais?.length ?? 0) + (e.link?.trim() ? 1 : 0)} foto(s)
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
          <div className="max-h-[90vh] w-full max-w-md space-y-3 overflow-auto rounded-2xl border border-border bg-card p-4" onClick={(ev) => ev.stopPropagation()}>
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
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">Imagens</span>
              {atual.fotos.length > 0 ? (
                <>
                  <p className="mb-1 text-[11px] text-muted-foreground">Fotos do Gestão Click (toque para escolher)</p>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {atual.fotos.map((f) => {
                      const on = sel[atual.id].fotos.includes(f);
                      return (
                        <button key={f} onClick={() => muda(atual.id, { fotos: on ? sel[atual.id].fotos.filter((x) => x !== f) : [...sel[atual.id].fotos, f] })}>
                          <img src={f} alt="" className={`h-14 w-14 rounded object-cover ${on ? "ring-2 ring-primary" : "opacity-50"}`} />
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="mb-2 text-[11px] text-muted-foreground">Este item não tem fotos no Gestão Click.</p>
              )}
              {sel[atual.id].locais.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {sel[atual.id].locais.map((f, i) => (
                    <div key={i} className="relative">
                      <img src={URL.createObjectURL(f)} alt="" className="h-14 w-14 rounded object-cover" />
                      <button
                        onClick={() => muda(atual.id, { locais: sel[atual.id].locais.filter((_, j) => j !== i) })}
                        className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                      ><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
              )}
              <label className="mb-2 flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-input text-sm hover:bg-accent">
                <Upload className="h-4 w-4" /> Adicionar imagens do computador
                <input
                  type="file" accept="image/*" multiple className="hidden"
                  onChange={(ev) => {
                    const fs = Array.from(ev.target.files ?? []);
                    muda(atual.id, { locais: [...sel[atual.id].locais, ...fs].slice(0, 10) });
                    ev.target.value = "";
                  }}
                />
              </label>
              <input className={`${input} w-full`} placeholder="Ou cole um link de imagem (opcional)" value={sel[atual.id].link} onChange={(ev) => muda(atual.id, { link: ev.target.value })} />
              <p className="mt-1 text-[11px] text-muted-foreground">A primeira imagem vira a principal.</p>
            </div>
            <div>
              <div className="mb-1 flex items-center">
                <span className="flex-1 text-xs font-semibold text-muted-foreground">Cores</span>
                <button
                  onClick={() => muda(atual.id, { cores: [...sel[atual.id].cores, { nome: "", hex: "#000000", estoque: sel[atual.id].cores.length ? 0 : atual.estoque }] })}
                  className="flex items-center gap-1 text-xs text-primary"
                ><Plus className="h-3.5 w-3.5" /> Adicionar cor</button>
              </div>
              {sel[atual.id].cores.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Sem cores: entra como cor "Única" com estoque {atual.estoque}.</p>
              ) : (
                <div className="space-y-1.5">
                  {sel[atual.id].cores.map((c, i) => {
                    const set = (p: Partial<Cor>) => muda(atual.id, { cores: sel[atual.id].cores.map((x, j) => (j === i ? { ...x, ...p } : x)) });
                    return (
                      <div key={i} className="flex items-center gap-1.5">
                        <input type="color" value={c.hex} onChange={(ev) => set({ hex: ev.target.value })} className="h-9 w-9 rounded border border-input" />
                        <input className={`${input} min-w-0 flex-1`} placeholder="Nome da cor" value={c.nome} maxLength={40} onChange={(ev) => set({ nome: ev.target.value })} />
                        <input type="number" min={0} className={`${input} w-20`} value={c.estoque} onChange={(ev) => set({ estoque: Math.max(0, Math.floor(Number(ev.target.value) || 0)) })} />
                        <button onClick={() => muda(atual.id, { cores: sel[atual.id].cores.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4 text-destructive" /></button>
                      </div>
                    );
                  })}
                  <p className="text-[11px] text-muted-foreground">
                    Estoque somado: {sel[atual.id].cores.reduce((s, c) => s + c.estoque, 0)} (Gestão Click: {atual.estoque})
                  </p>
                </div>
              )}
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
