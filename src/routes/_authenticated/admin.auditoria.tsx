import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  History,
  Search,
  User as UserIcon,
  Plus,
  Pencil,
  Trash2,
  Check,
  X as XIcon,
  RotateCcw,
  MessageCircle,
  LogIn,
  Activity,
  BarChart3,
  LayoutList,
  PieChart as PieChartIcon,
} from "lucide-react";
import { downloadAuditCSV, downloadAuditPDF, downloadTableXLSX } from "@/lib/pdf";
import { ExportMenu } from "@/components/export-menu";
import { StockHistory } from "@/components/stock-history";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/admin/auditoria")({
  component: AuditoriaPage,
});

type LogRow = {
  id: string;
  user_id: string;
  user_email: string | null;
  acao: string;
  entidade: string;
  entidade_id: string | null;
  descricao: string | null;
  detalhes: Record<string, unknown> | null;
  criado_em: string;
};

async function listLogs(): Promise<LogRow[]> {
  const { data, error } = await supabase
    .from("admin_audit_log")
    .select("id, user_id, user_email, acao, entidade, entidade_id, descricao, detalhes, criado_em")
    .order("criado_em", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as unknown as LogRow[];
}

const ACAO_META: Record<string, { label: string; icon: typeof Plus; tone: string }> = {
  criar: { label: "Criou", icon: Plus, tone: "bg-success/10 text-success" },
  editar: { label: "Editou", icon: Pencil, tone: "bg-brand/10 text-brand" },
  excluir: { label: "Excluiu", icon: Trash2, tone: "bg-destructive/10 text-destructive" },
  marcar_atendida: { label: "Marcou atendida", icon: Check, tone: "bg-success/10 text-success" },
  cancelar: { label: "Cancelou", icon: XIcon, tone: "bg-muted text-muted-foreground" },
  reabrir: { label: "Reabriu", icon: RotateCcw, tone: "bg-brand/10 text-brand" },
  reenviar_whatsapp: {
    label: "Reenviou WhatsApp",
    icon: MessageCircle,
    tone: "bg-success/10 text-success",
  },
  avisar_reposicao: {
    label: "Avisou reposição",
    icon: MessageCircle,
    tone: "bg-success/10 text-success",
  },
  login: { label: "Entrou", icon: LogIn, tone: "bg-muted text-muted-foreground" },
  outro: { label: "Ação", icon: Activity, tone: "bg-muted text-muted-foreground" },
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function AuditoriaPage() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["admin-auditoria"],
    queryFn: listLogs,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["admin-products-minimal"],
    queryFn: async () => {
      const { data } = await supabase.from("produtos").select("id, categoria_id, categorias(nome)");
      return data ?? [];
    },
  });

  const [q, setQ] = useState("");
  const [acao, setAcao] = useState<string>("todas");
  const [entidade, setEntidade] = useState<string>("todas");
  const [viewMode, setViewMode] = useState<"lista" | "graficos">("lista");

  const acoes = useMemo(() => Array.from(new Set(logs.map((l) => l.acao))).sort(), [logs]);
  const entidades = useMemo(
    () => Array.from(new Set(logs.map((l) => l.entidade))).sort(),
    [logs],
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return logs.filter((l) => {
      if (acao !== "todas" && l.acao !== acao) return false;
      if (entidade !== "todas" && l.entidade !== entidade) return false;
      if (!query) return true;
      const bag = `${l.user_email ?? ""} ${l.acao} ${l.entidade} ${l.descricao ?? ""}`.toLowerCase();
      return bag.includes(query);
    });
  }, [logs, q, acao, entidade]);

  // Analytics Data
  const entityData = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach((l) => {
      counts[l.entidade] = (counts[l.entidade] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const userData = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach((l) => {
      const email = l.user_email ?? "Sistema";
      counts[email] = (counts[email] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filtered]);

  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach((l) => {
      if (l.entidade === "produtos" && l.entidade_id) {
        const product = products.find((p) => p.id === l.entidade_id);
        const catName = (product?.categorias as any)?.nome ?? "Sem Categoria";
        counts[catName] = (counts[catName] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered, products]);

  const COLORS = ["#FF5500", "#001F3F", "#4CAF50", "#2196F3", "#9C27B0", "#FFC107"];

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Painel
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Histórico e auditoria
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Registro imutável das ações realizadas por administradores.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-border bg-muted/30 p-1 self-start sm:self-center">
          <button
            onClick={() => setViewMode("lista")}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
              viewMode === "lista"
                ? "bg-background text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutList className="h-3.5 w-3.5" />
            Lista
          </button>
          <button
            onClick={() => setViewMode("graficos")}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
              viewMode === "graficos"
                ? "bg-background text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Gráficos
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar usuário, descrição…"
              className="w-full rounded-full border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-foreground"
            />
          </div>
          <select
            value={acao}
            onChange={(e) => setAcao(e.target.value)}
            className="rounded-full border border-input bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
          >
            <option value="todas">Todas as ações</option>
            {acoes.map((a) => (
              <option key={a} value={a}>
                {ACAO_META[a]?.label ?? a}
              </option>
            ))}
          </select>
          <select
            value={entidade}
            onChange={(e) => setEntidade(e.target.value)}
            className="rounded-full border border-input bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
          >
            <option value="todas">Todas as entidades</option>
            {entidades.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          <div className="ml-auto flex items-center gap-2">
            <p className="hidden text-xs text-muted-foreground sm:block">
              {filtered.length}/{logs.length}
            </p>
            <ExportMenu
              count={filtered.length}
              disabled={filtered.length === 0}
              onExport={(format) => {
                if (format === "csv") return downloadAuditCSV(filtered);
                if (format === "pdf") return downloadAuditPDF(filtered);
                const headers = ["Data/Hora", "Usuário", "Ação", "Entidade", "ID Entidade", "Descrição", "Detalhes"];
                const rows = filtered.map((r) => [
                  new Date(r.criado_em).toLocaleString("pt-BR"),
                  r.user_email ?? r.user_id,
                  ACAO_META[r.acao]?.label ?? r.acao,
                  r.entidade,
                  r.entidade_id ?? "",
                  r.descricao ?? "",
                  r.detalhes ? JSON.stringify(r.detalhes) : "",
                ]);
                downloadTableXLSX("auditoria", "Auditoria", headers, rows);
              }}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-14 rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-muted">
              <History className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold">Nenhum registro</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              As ações administrativas aparecerão aqui automaticamente.
            </p>
          </div>
        ) : viewMode === "graficos" ? (
          <div className="p-6 space-y-10">
            <div className="grid gap-8 lg:grid-cols-2">
              {/* Entidade Distribution */}
              <div className="rounded-xl bg-muted/20 p-6">
                <div className="mb-4 flex items-center gap-2">
                  <PieChartIcon className="h-4 w-4 text-primary" />
                  <h3 className="font-display text-sm font-semibold uppercase tracking-wider">
                    Distribuição por Entidade
                  </h3>
                </div>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={entityData}
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {entityData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                      />
                      <Legend verticalAlign="bottom" height={36}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* User Activity Ranking */}
              <div className="rounded-xl bg-muted/20 p-6">
                <div className="mb-4 flex items-center gap-2">
                  <UserIcon className="h-4 w-4 text-primary" />
                  <h3 className="font-display text-sm font-semibold uppercase tracking-wider">
                    Usuários Mais Ativos
                  </h3>
                </div>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={userData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(0,0,0,0.05)" />
                      <XAxis type="number" hide />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        width={100} 
                        tick={{ fontSize: 10, fill: '#666' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip 
                        cursor={{fill: 'transparent'}}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                      />
                      <Bar dataKey="value" fill="#FF5500" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Category Analysis for Products */}
            {categoryData.length > 0 && (
              <div className="rounded-xl bg-muted/20 p-6">
                <div className="mb-6 flex items-center gap-2">
                  <LayoutList className="h-4 w-4 text-primary" />
                  <h3 className="font-display text-sm font-semibold uppercase tracking-wider">
                    Atividade de Produtos por Categoria
                  </h3>
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: '#666' }} 
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: '#666' }}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                      />
                      <Bar dataKey="value" fill="#001F3F" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        ) : (
          <ol className="divide-y divide-border">
            {filtered.map((l) => {
              const meta = ACAO_META[l.acao] ?? ACAO_META.outro;
              const Icon = meta.icon;
              return (
                <li key={l.id} className="grid gap-3 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-start">
                  <div className={`grid h-10 w-10 place-items-center rounded-full ${meta.tone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{meta.label}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {l.entidade}
                      </span>
                    </div>
                    {l.descricao && (
                      <p className="mt-1 text-sm text-muted-foreground">{l.descricao}</p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <UserIcon className="h-3 w-3" />
                        {l.user_email ?? l.user_id.slice(0, 8)}
                      </span>
                      {l.entidade_id && (
                        <span className="font-mono">id: {l.entidade_id.slice(0, 8)}</span>
                      )}
                    </div>
                    {l.detalhes && Object.keys(l.detalhes).length > 0 && (
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          Detalhes
                        </summary>
                        <pre className="mt-1 overflow-x-auto rounded-md bg-muted/60 p-2 text-[11px] leading-relaxed">
                          {JSON.stringify(l.detalhes, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                  <time className="text-xs tabular-nums text-muted-foreground sm:text-right">
                    {formatDate(l.criado_em)}
                  </time>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <StockHistory />
    </div>
  );
}
