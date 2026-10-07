import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  autoLinkGestaoClick,
  linkGestaoClick,
  listGestaoClickProdutos,
  syncGestaoClick,
} from "@/lib/gestaoclick.functions";

export function GestaoClickPanel() {
  const qc = useQueryClient();
  const listGc = useServerFn(listGestaoClickProdutos);
  const link = useServerFn(linkGestaoClick);
  const autoLink = useServerFn(autoLinkGestaoClick);
  const sync = useServerFn(syncGestaoClick);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const { data: gc = [], isLoading: carregandoGc, error: erroGc } = useQuery({
    queryKey: ["gestaoclick-produtos"],
    queryFn: () => listGc(),
    enabled: aberto,
    staleTime: 5 * 60_000,
  });
  const { data: prods = [] } = useQuery({
    queryKey: ["produtos-gc-link"],
    queryFn: async () =>
      (await supabase.from("produtos").select("id,nome,hash_id,gestaoclick_id").order("nome")).data ?? [],
  });
  const { data: logs = [] } = useQuery({
    queryKey: ["gestaoclick-log"],
    queryFn: async () =>
      (await supabase.from("gestaoclick_sync_log").select("*").order("criado_em", { ascending: false }).limit(8)).data ?? [],
    refetchInterval: 15000,
  });

  const vinculados = prods.filter((p) => p.gestaoclick_id).length;
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return prods.filter((p) => !q || [p.nome, p.hash_id].some((s) => s?.toLowerCase().includes(q)));
  }, [prods, busca]);

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["produtos-gc-link"] });
    qc.invalidateQueries({ queryKey: ["gestaoclick-log"] });
  };

  async function rodar(fn: () => Promise<string>) {
    setOcupado(true);
    try {
      toast.success(await fn());
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível falar com o Gestão Click");
    }
    setOcupado(false);
    recarregar();
  }

  const input = "h-9 rounded-md border border-input bg-background px-2 text-sm";

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link2 className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-semibold">Gestão Click</h2>
        <span className="text-xs text-muted-foreground">{vinculados} produto(s) vinculado(s)</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            disabled={ocupado}
            onClick={() =>
              rodar(async () => {
                const r = await autoLink();
                return `${r.vinculados} produto(s) vinculado(s) pelo nome`;
              })
            }
            className="h-9 rounded-md border border-input px-3 text-sm hover:bg-accent"
          >
            Vincular pelo nome
          </button>
          <button
            disabled={ocupado}
            onClick={() =>
              rodar(async () => {
                const r = await sync({ data: {} });
                return `Enviado: ${r.ok} ok${r.erros ? `, ${r.erros} com erro` : ""}`;
              })
            }
            className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground"
          >
            <RefreshCw className={`h-4 w-4 ${ocupado ? "animate-spin" : ""}`} /> Enviar estoque agora
          </button>
          <button onClick={() => setAberto(!aberto)} className="h-9 px-2 text-sm text-primary">
            {aberto ? "Fechar vínculos" : "Ver vínculos"}
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Toda mudança de estoque no site (painel, pedidos confirmados ou cancelados) envia o total de peças do produto
        para o produto vinculado no Gestão Click.
      </p>

      {aberto && (
        <div className="mt-4 space-y-2">
          <input className={`${input} w-full sm:w-72`} placeholder="Buscar produto..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          {erroGc && <p className="text-sm text-destructive">Erro ao carregar produtos do Gestão Click.</p>}
          <div className="max-h-96 divide-y divide-border overflow-auto rounded-md border border-border">
            {lista.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 p-2 text-sm">
                <span className="w-20 text-xs text-muted-foreground">{p.hash_id}</span>
                <span className="min-w-40 flex-1">{p.nome}</span>
                <select
                  className={`${input} w-full sm:w-72`}
                  disabled={carregandoGc}
                  value={p.gestaoclick_id ?? ""}
                  onChange={(e) =>
                    rodar(async () => {
                      await link({ data: { produtoId: p.id, gcId: e.target.value || null } });
                      return e.target.value ? "Vinculado e estoque enviado" : "Vínculo removido";
                    })
                  }
                >
                  <option value="">{carregandoGc ? "Carregando..." : "— Sem vínculo —"}</option>
                  {gc.map((g) => (
                    <option key={g.id} value={g.id}>{g.nome} (estoque {g.estoque})</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {logs.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-xs font-semibold text-muted-foreground">Últimos envios</p>
          <ul className="space-y-0.5 text-xs">
            {logs.map((l) => (
              <li key={l.id} className={l.ok ? "" : "text-destructive"}>
                {new Date(l.criado_em).toLocaleString("pt-BR")} · {l.nome ?? l.gestaoclick_id} · {l.estoque} peças
                {l.ok ? "" : ` · erro: ${l.mensagem}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
