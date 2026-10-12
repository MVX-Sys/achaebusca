import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GC_LOTE_CLIENTE, syncGestaoClick } from "@/lib/gestaoclick.functions";

type Linha = {
  gcId: string;
  produtoIds: string[];
  nomes: string[];
  codigos: string[];
  atual: number;
  enviado: number | null;
  quando: string | null;
  erro: string | null;
};

export function GestaoClickConferencia() {
  const [soDivergentes, setSoDivergentes] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState<string | null>(null);
  const sync = useServerFn(syncGestaoClick);

  const { data: linhas = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["gestaoclick-conferencia"],
    refetchInterval: 30000,
    queryFn: async (): Promise<Linha[]> => {
      const { data: prods } = await supabase
        .from("produtos")
        .select("id,nome,hash_id,gestaoclick_id,variacoes:variacoes_produto(quantidade_estoque)")
        .not("gestaoclick_id", "is", null);
      const mapa = new Map<string, Linha>();
      for (const p of (prods ?? []) as any[]) {
        const l: Linha = mapa.get(p.gestaoclick_id) ?? { gcId: p.gestaoclick_id, produtoIds: [], nomes: [], codigos: [], atual: 0, enviado: null, quando: null, erro: null };
        l.produtoIds.push(p.id);
        l.nomes.push(p.nome);
        if (p.hash_id) l.codigos.push(p.hash_id);
        l.atual += (p.variacoes ?? []).reduce((s: number, v: any) => s + Math.max(0, v.quantidade_estoque), 0);
        mapa.set(p.gestaoclick_id, l);
      }
      const ids = [...mapa.keys()];
      for (let i = 0; i < ids.length; i += 100) {
        const { data: logs } = await supabase
          .from("gestaoclick_sync_log")
          .select("gestaoclick_id,estoque,ok,mensagem,criado_em")
          .in("gestaoclick_id", ids.slice(i, i + 100))
          .order("criado_em", { ascending: false })
          .limit(1000);
        for (const lg of logs ?? []) {
          const l = mapa.get(lg.gestaoclick_id)!;
          if (lg.ok && l.enviado === null) { l.enviado = lg.estoque; l.quando = lg.criado_em; }
          if (!lg.ok && l.enviado === null && l.erro === null) l.erro = lg.mensagem;
        }
      }
      return [...mapa.values()].sort((a, b) => a.nomes[0].localeCompare(b.nomes[0], "pt-BR"));
    },
  });

  const divergente = (l: Linha) => l.enviado === null || l.enviado !== l.atual;
  const qtdDiv = linhas.filter(divergente).length;
  const lista = useMemo(() => (soDivergentes ? linhas.filter(divergente) : linhas), [linhas, soDivergentes]);
  const todosMarcados = lista.length > 0 && lista.every((l) => sel.has(l.gcId));

  function alternar(id: string) {
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function resolver(alvo: Linha[], chave: string) {
    if (!alvo.length) return;
    setOcupado(chave);
    try {
      const ids = alvo.flatMap((l) => l.produtoIds);
      let ok = 0, erros = 0;
      for (let i = 0; i < ids.length; i += GC_LOTE_CLIENTE) {
        const r = await sync({ data: { produtoIds: ids.slice(i, i + GC_LOTE_CLIENTE) } });
        ok += r.ok; erros += r.erros;
      }
      toast.success(`Resolvido: ${ok} ok${erros ? `, ${erros} com erro` : ""}`);
      setSel((s) => { const n = new Set(s); alvo.forEach((l) => n.delete(l.gcId)); return n; });
    } catch (e) {
      toast.error(`Não foi possível falar com o Gestão Click: ${(e as Error)?.message ?? e}`);
    }
    setOcupado(null);
    refetch();
  }

  const selecionadas = linhas.filter((l) => sel.has(l.gcId));

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ClipboardCheck className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-semibold">Conferência com o Gestão Click</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs ${qtdDiv ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>
          {isLoading ? "..." : qtdDiv ? `${qtdDiv} com divergência` : "Tudo conferido"}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={soDivergentes} onChange={(e) => setSoDivergentes(e.target.checked)} />
            Só divergentes
          </label>
          <button
            disabled={!selecionadas.length || !!ocupado}
            onClick={() => resolver(selecionadas, "lote")}
            className="h-8 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {ocupado === "lote" ? "Resolvendo..." : `Resolver selecionados (${selecionadas.length})`}
          </button>
          <button onClick={() => refetch()} className="h-8 rounded-md border border-input px-3 text-xs hover:bg-accent">
            {isFetching ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Compara o estoque atual do site com o último valor enviado ao Gestão Click. Resolva um item por vez pelo botão
        da linha, ou marque vários e use "Resolver selecionados" — o estoque do site é enviado só para esses itens.
      </p>
      <div className="mt-3 overflow-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2">
                <input
                  type="checkbox"
                  checked={todosMarcados}
                  onChange={() => setSel((s) => {
                    const n = new Set(s);
                    lista.forEach((l) => (todosMarcados ? n.delete(l.gcId) : n.add(l.gcId)));
                    return n;
                  })}
                />
              </th>
              <th className="p-2">Produto</th>
              <th className="p-2 text-right">Site agora</th>
              <th className="p-2 text-right">Último envio</th>
              <th className="p-2 text-right">Diferença</th>
              <th className="p-2">Situação</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lista.map((l) => {
              const div = divergente(l);
              return (
                <tr key={l.gcId} className={div ? "bg-destructive/5" : ""}>
                  <td className="p-2"><input type="checkbox" checked={sel.has(l.gcId)} onChange={() => alternar(l.gcId)} /></td>
                  <td className="p-2">
                    <p className="font-medium">{l.nomes.join(" / ")}</p>
                    <p className="text-xs text-muted-foreground">{l.codigos.join(", ")}</p>
                  </td>
                  <td className="p-2 text-right font-semibold">{l.atual}</td>
                  <td className="p-2 text-right">
                    {l.enviado ?? "—"}
                    {l.quando && <p className="text-[10px] text-muted-foreground">{new Date(l.quando).toLocaleString("pt-BR")}</p>}
                  </td>
                  <td className={`p-2 text-right font-semibold ${div ? "text-destructive" : ""}`}>
                    {l.enviado === null ? "—" : l.atual - l.enviado > 0 ? `+${l.atual - l.enviado}` : l.atual - l.enviado}
                  </td>
                  <td className="p-2 text-xs">
                    {div ? (
                      <span className="flex items-center gap-1 text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {l.enviado === null ? (l.erro ? `Envio falhou: ${l.erro}` : "Nunca enviado") : "Divergente"}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-success"><CheckCircle2 className="h-3.5 w-3.5" /> OK</span>
                    )}
                  </td>
                  <td className="p-2 text-right">
                    {div && (
                      <button
                        disabled={!!ocupado}
                        onClick={() => resolver([l], l.gcId)}
                        className="h-7 whitespace-nowrap rounded-md border border-input px-2 text-xs hover:bg-accent disabled:opacity-50"
                      >
                        {ocupado === l.gcId ? "Enviando..." : "Resolver"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!isLoading && lista.length === 0 && (
              <tr><td colSpan={7} className="p-4 text-center text-xs text-muted-foreground">
                {linhas.length ? "Nenhuma divergência." : "Nenhum produto vinculado ao Gestão Click."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
