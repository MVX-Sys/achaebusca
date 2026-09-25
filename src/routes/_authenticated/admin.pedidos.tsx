import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { 
  Search, 
  User, 
  ShoppingBag, 
  Clock, 
  CheckCircle2, 
  Users,
  Loader2,
  Trash2
} from "lucide-react";
import { listPedidos, updatePedidoStatus, deletePedido } from "@/lib/pedidos.functions";
import { listAtendentes } from "@/lib/atendentes.functions";
import { listAdminUsers } from "@/lib/admin-users.functions";
import { brl } from "@/lib/format";
import { BRAND } from "@/lib/config";
import { useAuth } from "@/lib/auth";
import { ExportMenu } from "@/components/export-menu";
import { downloadTableCSV, downloadTablePDF, downloadTableXLSX } from "@/lib/pdf";

export const Route = createFileRoute("/_authenticated/admin/pedidos")({
  head: () => ({
    meta: [
      { title: `Pedidos — ${BRAND}` },
    ],
  }),
  component: PedidosAdminPage,
});

type Periodo = "dia" | "semana" | "mes" | "semestre" | "todos";

function PedidosAdminPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const fetchPedidos = useServerFn(listPedidos);
  const updateStatus = useServerFn(updatePedidoStatus);
  const removePedido = useServerFn(deletePedido);
  const fetchAtendentes = useServerFn(listAtendentes);
  const fetchUsers = useServerFn(listAdminUsers);

  const [q, setQ] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("todos");
  const [atendenteId, setAtendenteId] = useState("todos");
  const [usuarioId, setUsuarioId] = useState("todos");

  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ["admin-pedidos", periodo, atendenteId, usuarioId],
    queryFn: () => fetchPedidos({ 
      data: {
        periodo, 
        atendente_id: atendenteId === "todos" ? undefined : atendenteId,
        usuario_id: usuarioId === "todos" ? undefined : usuarioId
      }
    }),
  });

  const { data: atendentes = [] } = useQuery({
    queryKey: ["admin-atendentes-list"],
    queryFn: () => fetchAtendentes(),
  });

  const { data: usuarios = [] } = useQuery({
    queryKey: ["admin-usuarios-list"],
    queryFn: () => fetchUsers(),
    enabled: isAdmin
  });

  const filtered = useMemo(() => {
    if (!q.trim()) return pedidos;
    const term = q.toLowerCase();
    return pedidos.filter(p => 
      (p.cliente_nome || "").toLowerCase().includes(term) ||
      (p.cliente_whatsapp || "").includes(term) ||
      p.id.toLowerCase().includes(term)
    );
  }, [pedidos, q]);

  const stats = useMemo(() => {
    const validos = pedidos.filter(p => p.status !== "cancelado");
    return {
      total: validos.length,
      pecas: validos.reduce((acc, p) => acc + (p.itens?.reduce((s, i) => s + i.quantidade, 0) || 0), 0),
      valor: validos.reduce((acc, p) => acc + Number(p.total), 0)
    };
  }, [pedidos]);

  const formatDate = (date: string) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Pedidos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe e gerencie as vendas realizadas na plataforma.
          </p>
        </div>
        <Link 
          to="/admin/pedidos" 
          className="flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-lg shadow-brand/25 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-brand/30 active:scale-95"
        >
          <ShoppingBag className="h-4 w-4" />
          Gerenciar Pedidos
        </Link>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-1">
        <div className="flex items-center gap-1">
          <Link 
            to="/admin" 
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border border-b-2 border-transparent transition-colors"
          >
            Produtos
          </Link>
          <Link 
            to="/admin/vendas" 
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border border-b-2 border-transparent transition-colors"
          >
            Vendas
          </Link>
          <Link 
            to="/admin/usuarios" 
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-border border-b-2 border-transparent transition-colors"
          >
            Usuários
          </Link>
        </div>

      </div>


      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total de Pedidos</p>
              <p className="font-display text-2xl font-bold">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-blue-500/10 text-blue-500">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total de Peças</p>
              <p className="font-display text-2xl font-bold">{stats.pecas}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-green-500/10 text-green-500">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Volume de Vendas</p>
              <p className="font-display text-2xl font-bold">{brl(stats.valor)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Filters Header */}
        <div className="border-b border-border bg-muted/30 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por cliente, WhatsApp ou ID..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full rounded-lg border border-input bg-background py-2 pl-10 pr-4 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <select 
                  value={periodo} 
                  onChange={(e) => setPeriodo(e.target.value as Periodo)}
                  className="bg-transparent text-sm outline-none w-full"
                >
                  <option value="todos">Todo o tempo</option>
                  <option value="dia">Último dia</option>
                  <option value="semana">Última semana</option>
                  <option value="mes">Último mês</option>
                  <option value="semestre">Último semestre</option>
                </select>
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <select 
                  value={atendenteId} 
                  onChange={(e) => setAtendenteId(e.target.value)}
                  className="bg-transparent text-sm outline-none w-full"
                >
                  <option value="todos">Todos Atendentes</option>
                  {atendentes.map(a => (
                    <option key={a.id} value={a.id}>{a.nome}</option>
                  ))}
                </select>
              </div>

              {isAdmin && (
                <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <select 
                    value={usuarioId} 
                    onChange={(e) => setUsuarioId(e.target.value)}
                    className="bg-transparent text-sm outline-none w-full"
                  >
                    <option value="todos">Todos Usuários</option>
                    {usuarios.map(u => (
                      <option key={u.id} value={u.id}>{u.email || u.id.slice(0, 8)}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <ExportMenu 
              disabled={filtered.length === 0}
              count={filtered.length}
              onExport={(format) => {
                const headers = ["ID", "Data", "Cliente", "WhatsApp", "Atendente", "Total", "Peças", "Status"];
                const dataToExport = filtered.map(p => ([
                  p.id,
                  formatDate(p.created_at),
                  p.cliente_nome,
                  p.cliente_whatsapp,
                  p.atendente?.nome || "—",
                  brl(p.total),
                  p.itens?.reduce((acc, i) => acc + i.quantidade, 0) || 0,
                  p.status
                ]));

                if (format === "csv") {
                  downloadTableCSV("pedidos", headers, dataToExport);
                } else if (format === "xlsx") {
                  downloadTableXLSX("pedidos", "Pedidos", headers, dataToExport);
                } else {
                  const columns = [
                    { label: "Data", width: 30 },
                    { label: "Cliente", width: 40 },
                    { label: "Atendente", width: 30 },
                    { label: "Total", width: 25 },
                    { label: "Peças", width: 15 },
                    { label: "Status", width: 20 },
                  ];
                  const pdfRows = filtered.map(p => [
                    formatDate(p.created_at),
                    p.cliente_nome,
                    p.atendente?.nome || "—",
                    brl(p.total),
                    String(p.itens?.reduce((acc, i) => acc + i.quantidade, 0) || 0),
                    p.status
                  ]);
                  downloadTablePDF("Relatório de Pedidos", "pedidos", columns, pdfRows);
                }
              }}
            />
          </div>
        </div>

        {/* Table - Mobile friendly scroll */}
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-border">
          <table className="w-full text-left text-sm min-w-[700px]">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Data / ID</th>
                <th className="px-4 py-3 font-semibold">Cliente</th>
                <th className="px-4 py-3 font-semibold">Atendente</th>
                <th className="px-4 py-3 font-semibold">Itens</th>
                <th className="px-4 py-3 font-semibold">Total</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-muted-foreground">Carregando pedidos...</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-20 text-center text-muted-foreground">
                    Nenhum pedido encontrado.
                  </td>
                </tr>
              ) : (
                filtered.map((pedido) => {
                  const pecasCount = pedido.itens?.reduce((acc, item) => acc + item.quantidade, 0) || 0;
                  return (
                    <tr key={pedido.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <select 
                            value={pedido.status}
                            onChange={async (e) => {
                              const newStatus = e.target.value as "pendente" | "confirmado" | "entregue" | "cancelado";
                              const jaBaixado = pedido.status === "confirmado" || pedido.status === "entregue";
                              const confirmMsg =
                                newStatus === "confirmado" || newStatus === "entregue"
                                  ? jaBaixado
                                    ? `Deseja alterar o status para "${newStatus}"?`
                                    : "Ao confirmar este pedido, o estoque dos produtos será baixado automaticamente. Deseja continuar?"
                                  : jaBaixado
                                    ? `As peças deste pedido voltarão para o estoque. Deseja alterar o status para "${newStatus}"?`
                                    : `Deseja alterar o status para "${newStatus}"?`;

                              if (!window.confirm(confirmMsg)) return;

                              try {
                                await updateStatus({ data: { id: pedido.id, status: newStatus } });
                                qc.invalidateQueries({ queryKey: ["admin-pedidos"] });
                                qc.invalidateQueries({ queryKey: ["admin-produtos"] });
                                toast.success("Status atualizado.");
                              } catch (err) {
                                console.error("Erro ao atualizar status:", err);
                                toast.error("Não foi possível atualizar o status do pedido.");
                              }
                            }}
                            className="rounded border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <option value="pendente">Pendente</option>
                            <option value="confirmado">Confirmado (Baixa Estoque)</option>
                            <option value="entregue">Entregue</option>
                            <option value="cancelado">Cancelado</option>
                          </select>
                          <div className="flex flex-col">
                            <span className="font-medium">{formatDate(pedido.created_at)}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">{pedido.id.split("-")[0]}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium">{pedido.cliente_nome}</span>
                          <span className="text-xs text-muted-foreground">{pedido.cliente_whatsapp}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {pedido.atendente?.nome || (
                          <span className="text-muted-foreground italic text-xs">Não atribuído</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="group relative">
                          <div className="flex items-center gap-1 cursor-default">
                            <span className="font-semibold">{pecasCount}</span>
                            <span className="text-xs text-muted-foreground">peças</span>
                          </div>
                          
                          {/* Mini Sidebar Popup for Items */}
                          <div className="invisible absolute left-full top-0 z-50 ml-2 w-64 rounded-xl border border-border bg-card p-3 shadow-2xl transition-all group-hover:visible group-hover:opacity-100 opacity-0">
                            <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Itens do Pedido</h4>
                            <div className="space-y-2 max-h-60 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-border">
                              {pedido.itens?.map((item, idx) => (
                                <div key={idx} className="flex gap-2 rounded-lg bg-muted/50 p-2">
                                  <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-white border border-border flex items-center justify-center p-0.5">
                                    {item.imagem_url ? (
                                      <img src={item.imagem_url} alt="" className="h-full w-full object-contain" />
                                    ) : (
                                      <ShoppingBag className="h-4 w-4 text-muted-foreground/30" />
                                    )}
                                  </div>
                                  <div className="flex flex-1 flex-col justify-center min-w-0">
                                    <p className="truncate text-[10px] font-bold leading-tight">{item.nome_produto || item.detalhes?.nome}</p>
                                    <p className="text-[9px] text-muted-foreground leading-tight">
                                      {item.quantidade}x • {item.cor || item.detalhes?.cor} • {item.tamanho || item.detalhes?.tamanho}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums">
                        {brl(pedido.total)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={pedido.status} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pendente: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    confirmado: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    cancelado: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    entregue: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${styles[status] || "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}
