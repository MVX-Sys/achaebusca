import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  id: string;
  produto_nome: string | null;
  cor: string | null;
  tamanho: string | null;
  quantidade_anterior: number;
  quantidade_nova: number;
  diferenca: number;
  origem: string;
  user_email: string | null;
  criado_em: string;
};

const ORIGEM: Record<string, string> = { admin: "Admin", pedido: "Pedido", sistema: "Sistema" };

export function StockHistory() {
  const [busca, setBusca] = useState("");
  const [origem, setOrigem] = useState("todas");
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["estoque-historico"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estoque_historico" as any)
        .select("*")
        .order("criado_em", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const rows = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return data.filter(
      (r) =>
        (origem === "todas" || r.origem === origem) &&
        (!q ||
          [r.produto_nome, r.cor, r.tamanho, r.user_email].some((s) => s?.toLowerCase().includes(q))),
    );
  }, [data, busca, origem]);

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold">Histórico de estoque</h2>
          <p className="text-xs text-muted-foreground">Cada alteração de quantidade por variação.</p>
        </div>
        <div className="flex gap-2">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto, cor, admin..."
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-64"
          />
          <select
            value={origem}
            onChange={(e) => setOrigem(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="todas">Todas</option>
            <option value="admin">Admin</option>
            <option value="pedido">Pedido</option>
            <option value="sistema">Sistema</option>
          </select>
        </div>
      </div>
      <div className="max-h-[480px] overflow-auto">
        {isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Carregando...</p>
        ) : error ? (
          <p className="p-6 text-sm text-destructive">Erro ao carregar o histórico.</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nenhuma alteração registrada.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-3">Data</th>
                <th className="p-3">Produto</th>
                <th className="p-3">Variação</th>
                <th className="p-3 text-right">Antes → Depois</th>
                <th className="p-3 text-right">Dif.</th>
                <th className="p-3">Quem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap p-3 tabular-nums text-muted-foreground">
                    {new Date(r.criado_em).toLocaleString("pt-BR")}
                  </td>
                  <td className="p-3">{r.produto_nome ?? "—"}</td>
                  <td className="p-3">{r.cor} / {r.tamanho}</td>
                  <td className="p-3 text-right tabular-nums">{r.quantidade_anterior} → {r.quantidade_nova}</td>
                  <td className={`p-3 text-right font-semibold tabular-nums ${r.diferenca > 0 ? "text-primary" : "text-destructive"}`}>
                    {r.diferenca > 0 ? `+${r.diferenca}` : r.diferenca}
                  </td>
                  <td className="p-3">
                    <span className="text-xs">{r.user_email ?? "—"}</span>
                    <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                      {ORIGEM[r.origem] ?? r.origem}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
