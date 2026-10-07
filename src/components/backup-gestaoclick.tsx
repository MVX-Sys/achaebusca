import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, RefreshCw, Loader2, Upload, AlertTriangle, X } from "lucide-react";
import { exportarGestaoClick, previewRestauracaoGc, aplicarRestauracaoGc } from "@/lib/gestaoclick.functions";
import { logAudit } from "@/lib/audit";

type Mudanca = Awaited<ReturnType<typeof previewRestauracaoGc>>[number];
type Entrada = { id: string; nome: string; codigo_interno: string; preco: number; ativo: boolean };
type Validacao = { arquivo: string; total: number; validos: Entrada[]; invalidos: { linha: number; motivo: string }[]; conflitos: string[] };

const brl = (n: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

function baixar(nome: string, conteudo: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

function parseCsv(txt: string): Record<string, string>[] {
  const linhas = txt.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!linhas.length) return [];
  const sep = linhas[0].includes(";") ? ";" : ",";
  const split = (l: string) => {
    const out: string[] = []; let cur = ""; let q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === sep) { out.push(cur); cur = ""; } else cur += c;
    }
    out.push(cur); return out;
  };
  const cab = split(linhas[0]).map((h) => h.trim().toLowerCase());
  return linhas.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [cab[i], v.trim()])));
}

function validar(arquivo: string, linhas: any[]): Validacao {
  const validos: Entrada[] = []; const invalidos: Validacao["invalidos"] = []; const conflitos: string[] = [];
  const ids = new Map<string, number>(); const cods = new Map<string, number>();
  linhas.forEach((r, i) => {
    const linha = i + 1;
    if (!r || typeof r !== "object") return invalidos.push({ linha, motivo: "Linha vazia ou mal formatada" });
    const id = String(r.id ?? "").trim();
    const nome = String(r.nome ?? "").trim();
    const precoTxt = String(r.preco_atacado ?? r.preco ?? "").replace(/\s|R\$/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const preco = Number(precoTxt);
    const motivos: string[] = [];
    if (!id) motivos.push("sem id do Gestão Click");
    if (!nome) motivos.push("sem nome");
    if (precoTxt === "" || !Number.isFinite(preco) || preco < 0) motivos.push(`preço inválido (${r.preco_atacado ?? r.preco ?? "vazio"})`);
    if (motivos.length) return invalidos.push({ linha, motivo: `${nome || id || "?"}: ${motivos.join(", ")}` });
    if (ids.has(id)) { conflitos.push(`ID ${id} repetido nas linhas ${ids.get(id)} e ${linha} (mantida a primeira)`); return; }
    ids.set(id, linha);
    const cod = String(r.codigo_interno ?? "").trim();
    if (cod) {
      if (cods.has(cod)) conflitos.push(`Código "${cod}" usado nas linhas ${cods.get(cod)} e ${linha}`);
      else cods.set(cod, linha);
    }
    const at = String(r.ativo ?? "true").toLowerCase();
    validos.push({ id, nome: nome.slice(0, 300), codigo_interno: cod.slice(0, 100), preco, ativo: !["false", "0", "não", "nao", "inativo"].includes(at) });
  });
  return { arquivo, total: linhas.length, validos, invalidos, conflitos };
}

export function BackupGestaoClick() {
  const exportar = useServerFn(exportarGestaoClick);
  const preview = useServerFn(previewRestauracaoGc);
  const aplicar = useServerFn(aplicarRestauracaoGc);
  const [busy, setBusy] = useState<"" | "json" | "csv" | "prev" | "apl">("");
  const [val, setVal] = useState<Validacao | null>(null);
  const [mud, setMud] = useState<Mudanca[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  async function exp(fmt: "json" | "csv") {
    setBusy(fmt);
    try {
      const lista = await exportar();
      const data = new Date().toISOString().slice(0, 10);
      if (fmt === "json") baixar(`gestaoclick-produtos-${data}.json`, JSON.stringify(lista, null, 2), "application/json");
      else {
        const cols = ["id", "nome", "codigo_interno", "codigo_barra", "preco_atacado", "preco_varejo", "estoque", "ativo"];
        const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const csv = [cols.join(";"), ...lista.map((p: any) => cols.map((c) => esc(p[c])).join(";"))].join("\n");
        baixar(`gestaoclick-produtos-${data}.csv`, "\uFEFF" + csv, "text/csv");
      }
      toast.success(`${lista.length} produtos exportados do Gestão Click`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao exportar do Gestão Click");
    } finally { setBusy(""); }
  }

  async function gerarPrevia(itens?: Entrada[]) {
    setBusy("prev");
    try {
      const m = await preview({ data: { itens } });
      setMud(m);
      setSel(new Set(m.map((x) => x.gcId)));
      if (!m.length) toast.info("Nenhuma diferença encontrada");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao comparar produtos");
    } finally { setBusy(""); }
  }

  async function lerArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setMud(null);
    try {
      const txt = await f.text();
      let linhas: any[];
      if (/\.json$/i.test(f.name)) {
        const j = JSON.parse(txt);
        linhas = Array.isArray(j) ? j : Array.isArray(j?.produtos) ? j.produtos : (() => { throw new Error("O JSON precisa ser uma lista de produtos"); })();
      } else if (/\.csv$/i.test(f.name)) {
        linhas = parseCsv(txt);
      } else throw new Error("Use um arquivo .json ou .csv");
      if (!linhas.length) throw new Error("Arquivo sem produtos");
      setVal(validar(f.name, linhas));
    } catch (err: any) {
      setVal(null);
      toast.error(err instanceof SyntaxError ? "JSON inválido: não foi possível ler o arquivo" : err?.message ?? "Arquivo inválido");
    }
  }

  async function confirmar() {
    const escolhidas = (mud ?? []).filter((m) => sel.has(m.gcId));
    if (!escolhidas.length) return toast.error("Selecione ao menos uma alteração");
    setBusy("apl");
    try {
      const r = await aplicar({ data: { mudancas: escolhidas } });
      await logAudit({ acao: "editar", entidade: "produto", descricao: `Restauração do Gestão Click: ${r.atualizados} atualizados, ${r.vinculados} vinculados, ${r.importados} importados` });
      toast.success(`${r.atualizados} atualizados · ${r.vinculados} vinculados · ${r.importados} importados${r.erros ? ` · ${r.erros} erros` : ""}`);
      setMud(null); setVal(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao restaurar");
    } finally { setBusy(""); }
  }

  const todos = !!mud?.length && mud.every((m) => sel.has(m.gcId));
  const contagem = useMemo(() => {
    const c = { atualizar: 0, vincular: 0, importar: 0 };
    mud?.forEach((m) => c[m.tipo]++);
    return c;
  }, [mud]);

  const btn = "inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60";
  const spin = <Loader2 className="h-4 w-4 animate-spin" />;
  const rotulo = { atualizar: "Atualizar", vincular: "Vincular", importar: "Importar (inativo)" };

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <RefreshCw className="h-5 w-5 text-primary" />
        <h2 className="font-display text-lg font-semibold">Produtos do Gestão Click</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Exporte o catálogo do Gestão Click ou restaure os produtos do site a partir dele ou de um arquivo exportado. Você revisa cada alteração antes de aplicar. Preços usados: <strong>Atacado</strong>.
      </p>
      <div className="flex flex-wrap gap-2">
        <button disabled={!!busy} onClick={() => exp("json")} className={`${btn} bg-foreground text-background`}>
          {busy === "json" ? spin : <Download className="h-4 w-4" />} Exportar .json
        </button>
        <button disabled={!!busy} onClick={() => exp("csv")} className={`${btn} border border-border`}>
          {busy === "csv" ? spin : <Download className="h-4 w-4" />} Exportar .csv
        </button>
        <button disabled={!!busy} onClick={() => { setVal(null); gerarPrevia(); }} className={`${btn} bg-primary text-primary-foreground`}>
          {busy === "prev" && !val ? spin : <RefreshCw className="h-4 w-4" />} Comparar com o Gestão Click
        </button>
        <button disabled={!!busy} onClick={() => fileRef.current?.click()} className={`${btn} border border-border`}>
          <Upload className="h-4 w-4" /> Restaurar de arquivo (.json/.csv)
        </button>
        <input ref={fileRef} type="file" accept=".json,.csv" className="hidden" onChange={lerArquivo} />
      </div>

      {val && (
        <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4 text-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">Validação de “{val.arquivo}”</p>
            <button onClick={() => { setVal(null); setMud(null); }} className="text-muted-foreground"><X className="h-4 w-4" /></button>
          </div>
          <p className="mt-1">{val.total} linhas · <span className="text-primary font-medium">{val.validos.length} válidas</span> · <span className={val.invalidos.length ? "text-destructive font-medium" : ""}>{val.invalidos.length} inválidas</span> · {val.conflitos.length} conflitos</p>
          {val.invalidos.length > 0 && (
            <details className="mt-2" open={val.invalidos.length <= 10}>
              <summary className="cursor-pointer font-medium text-destructive">Produtos inválidos (serão ignorados)</summary>
              <ul className="mt-1 max-h-40 list-disc overflow-auto pl-5 text-xs">
                {val.invalidos.map((x, i) => <li key={i}>Linha {x.linha}: {x.motivo}</li>)}
              </ul>
            </details>
          )}
          {val.conflitos.length > 0 && (
            <details className="mt-2" open={val.conflitos.length <= 10}>
              <summary className="cursor-pointer font-medium"><AlertTriangle className="mr-1 inline h-4 w-4 text-primary" />Conflitos</summary>
              <ul className="mt-1 max-h-40 list-disc overflow-auto pl-5 text-xs">
                {val.conflitos.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </details>
          )}
          {!mud && (
            <button disabled={!!busy || !val.validos.length} onClick={() => gerarPrevia(val.validos)} className={`${btn} mt-3 bg-primary text-primary-foreground`}>
              {busy === "prev" ? spin : null} Ver diferenças com o site
            </button>
          )}
        </div>
      )}

      {mud && mud.length > 0 && (
        <div className="mt-4 rounded-xl border border-border">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3 text-sm">
            <span className="font-semibold">Prévia: {mud.length} alterações</span>
            <span className="text-muted-foreground">({contagem.atualizar} atualizar · {contagem.vincular} vincular · {contagem.importar} importar)</span>
            <div className="ml-auto flex gap-2">
              <button onClick={() => setMud(null)} className="h-9 px-3 text-muted-foreground">Cancelar</button>
              <button disabled={!!busy || !sel.size} onClick={confirmar} className={`${btn} bg-primary text-primary-foreground`}>
                {busy === "apl" ? spin : null} Aplicar {sel.size} selecionada(s)
              </button>
            </div>
          </div>
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="sticky top-0 bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-2"><input type="checkbox" checked={todos} onChange={() => setSel(todos ? new Set() : new Set(mud.map((m) => m.gcId)))} /></th>
                  <th className="p-2">Ação</th>
                  <th className="p-2">Nome</th>
                  <th className="p-2">Preço</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {mud.map((m) => {
                  const nomeMuda = m.nomeAtual !== m.nomeNovo;
                  const precoMuda = m.precoAtual !== m.precoNovo;
                  return (
                    <tr key={m.gcId} className={sel.has(m.gcId) ? "" : "opacity-50"}>
                      <td className="p-2"><input type="checkbox" checked={sel.has(m.gcId)} onChange={() => { const s = new Set(sel); s.has(m.gcId) ? s.delete(m.gcId) : s.add(m.gcId); setSel(s); }} /></td>
                      <td className="p-2 whitespace-nowrap text-xs font-medium">{rotulo[m.tipo]}</td>
                      <td className="p-2">
                        {m.nomeAtual && nomeMuda && <div className="text-xs text-muted-foreground line-through">{m.nomeAtual}</div>}
                        <div className={nomeMuda ? "font-medium" : ""}>{m.nomeNovo}</div>
                        <div className="text-xs text-muted-foreground">{m.codigo}</div>
                      </td>
                      <td className="p-2 whitespace-nowrap tabular-nums">
                        {m.precoAtual != null && precoMuda && <span className="mr-1 text-xs text-muted-foreground line-through">{brl(m.precoAtual)}</span>}
                        <span className={precoMuda ? "font-medium text-primary" : ""}>{brl(m.precoNovo)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
