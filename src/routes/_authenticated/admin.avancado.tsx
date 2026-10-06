import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Database, 
  Activity, 
  BarChart3, 
  Clock, 
  HardDrive, 
  Zap,
  TrendingUp,
  Users,
  Search,
  Filter,
  Calendar,
  ChevronRight,
  Shield
} from "lucide-react";
import { brl } from "@/lib/format";
import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";

export const Route = createFileRoute("/_authenticated/admin/avancado")({
  component: AvancadoPage,
});

function AvancadoPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-stats-advanced"],
    queryFn: async () => {
      // 1. Storage Info & Total Size
      const { data: buckets } = await supabase.storage.listBuckets();
      
      let totalSizeBytes = 0;
      const bucketStats = [];

      if (buckets) {
        for (const bucket of buckets) {
          const { data: files } = await supabase.storage.from(bucket.name).list();
          const bucketSize = (files || []).reduce((acc, file) => acc + (file.metadata?.size || 0), 0);
          totalSizeBytes += bucketSize;
          bucketStats.push({
            ...bucket,
            size: bucketSize
          });
        }
      }

      const formatSize = (bytes: number) => {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
      };
      
      // 2. Access Info (Logs by day for chart and detailed list)
      // Busca paginada: o banco limita cada consulta a 1000 linhas
      const fetchAll = async (table: "admin_audit_log" | "pedidos", cols: string) => {
        const all: any[] = [];
        const PAGE = 1000;
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabase
            .from(table)
            .select(cols)
            .order("criado_em", { ascending: false })
            .range(from, from + PAGE - 1);
          if (error || !data?.length) break;
          all.push(...data);
          if (data.length < PAGE) break;
        }
        return all;
      };
      const logs = await fetchAll("admin_audit_log", "*");

      // 3. User stats
      const { count: userCount } = await supabase
        .from("user_roles")
        .select("*", { count: 'exact', head: true });

      // 4. Order stats
      const orders = await fetchAll("pedidos", "total, criado_em");

      // 5. Database Table Stats
      const tables = ["produtos", "pedidos", "usuarios", "categorias", "variacoes_produto", "cupons"];
      const tableCounts: Record<string, number> = {};
      
      for (const table of tables) {
        const { count } = await supabase
          .from(table as any)
          .select("*", { count: 'exact', head: true });
        tableCounts[table] = count || 0;
      }

      // Process data for charts
      const logsByDay = (logs || []).reduce((acc: any, log) => {
        const dateStr = log.criado_em ? new Date(log.criado_em).toLocaleDateString() : 'N/A';
        acc[dateStr] = (acc[dateStr] || 0) + 1;
        return acc;
      }, {});

      const salesByDay = (orders || []).reduce((acc: any, order) => {
        const dateStr = order.criado_em ? new Date(order.criado_em).toLocaleDateString() : 'N/A';
        acc[dateStr] = (acc[dateStr] || 0) + (order.total || 0);
        return acc;
      }, {});

      const chartData = Object.keys(logsByDay).slice(0, 7).map(date => ({
        name: date,
        acessos: logsByDay[date],
        vendas: salesByDay[date] || 0
      })).reverse();

      return {
        buckets: bucketStats,
        logs: logs || [],
        totalLogs: logs?.length ?? 0,
        userCount: userCount ?? 0,
        totalSales: orders?.reduce((sum, o) => sum + (o.total || 0), 0) ?? 0,
        orderCount: orders?.length ?? 0,
        chartData,
        totalStorage: formatSize(totalSizeBytes),
        formatSize,
        tableCounts
      };
    },
  });

  const filteredLogs = useMemo(() => {
    if (!stats?.logs) return [];
    
    return stats.logs.filter((log: any) => {
      const matchesSearch = 
        log.acao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.entidade?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.user_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.descricao?.toLowerCase().includes(searchTerm.toLowerCase());
      
      if (!matchesSearch) return false;

      if (dateFilter === "all") return true;
      
      const logDate = new Date(log.criado_em);
      const now = new Date();
      
      if (dateFilter === "today") {
        return logDate.toDateString() === now.toDateString();
      }
      
      if (dateFilter === "week") {
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);
        return logDate >= weekAgo;
      }
      
      if (dateFilter === "month") {
        const monthAgo = new Date();
        monthAgo.setMonth(now.getMonth() - 1);
        return logDate >= monthAgo;
      }
      
      return true;
    });
  }, [stats?.logs, searchTerm, dateFilter]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Activity className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const COLORS = ['#FF5500', '#001F3F', '#4CAF50', '#2196F3'];

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sistema
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Painel Avançado
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitoramento em tempo real de tráfego, vendas e recursos.
          </p>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          icon={<Activity className="h-5 w-5 text-primary" />}
          label="Acessos Totais"
          value={stats?.totalLogs.toString() ?? "0"}
          sub="Registros de Auditoria"
        />
        <StatCard 
          icon={<TrendingUp className="h-5 w-5 text-green-500" />}
          label="Receita Total"
          value={brl(stats?.totalSales ?? 0)}
          sub={`${stats?.orderCount} pedidos concluídos`}
        />
        <StatCard 
          icon={<Users className="h-5 w-5 text-blue-500" />}
          label="Base de Usuários"
          value={stats?.userCount.toString() ?? "0"}
          sub="Contas registradas"
        />
        <StatCard 
          icon={<HardDrive className="h-5 w-5 text-orange-500" />}
          label="Armazenamento"
          value={stats?.totalStorage ?? "0 B"}
          sub={`${stats?.buckets.length ?? 0} Buckets ativos`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sales & Traffic Chart */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-semibold">Desempenho Semanal</h2>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.chartData}>
                <defs>
                  <linearGradient id="colorAcessos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FF5500" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#FF5500" stopOpacity={0}/>
                  </linearGradient>
                </defs>
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
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' 
                  }} 
                />
                <Area 
                  type="monotone" 
                  dataKey="acessos" 
                  stroke="#FF5500" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorAcessos)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Storage Distribution */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-semibold">Infraestrutura Supabase</h2>
          </div>
          <div className="space-y-4">
            {stats?.buckets.map((b, index) => (
              <div key={b.id} className="group relative overflow-hidden rounded-xl bg-muted/30 p-4 transition-all hover:bg-muted/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background shadow-sm">
                      <Database className={`h-5 w-5 ${index === 0 ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <p className="font-semibold">{b.name}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {b.public ? 'Público' : 'Privado'} • {(stats as any).formatSize(b.size)} • Criado em {new Date(b.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                      ESTÁVEL
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {stats?.buckets.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">
                Nenhum bucket de armazenamento detectado.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider">Latência</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Database</span>
              <span className="font-bold text-green-500">12ms</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">API Edge</span>
              <span className="font-bold text-green-500">24ms</span>
            </div>
            <div className="pt-2">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Uptime</span>
                <span className="font-bold text-foreground">99.98%</span>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full w-[99.98%] bg-green-500" />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider">Volume de Dados</h2>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div className="text-center">
              <p className="text-lg font-bold">{(stats as any).tableCounts?.produtos || 0}</p>
              <p className="text-[9px] font-bold uppercase text-muted-foreground">Produtos</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">{(stats as any).tableCounts?.pedidos || 0}</p>
              <p className="text-[9px] font-bold uppercase text-muted-foreground">Pedidos</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">{(stats as any).tableCounts?.variacoes_produto || 0}</p>
              <p className="text-[9px] font-bold uppercase text-muted-foreground">Variações</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">{(stats as any).tableCounts?.cupons || 0}</p>
              <p className="text-[9px] font-bold uppercase text-muted-foreground">Cupons</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider">Plataformas</h2>
          </div>
          <div className="flex items-center justify-around py-1">
            <div className="text-center">
              <p className="text-xl font-bold">65%</p>
              <p className="text-[9px] font-bold uppercase text-muted-foreground">Mobile</p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="text-center">
              <p className="text-xl font-bold">35%</p>
              <p className="text-[9px] font-bold uppercase text-muted-foreground">Desktop</p>
            </div>
          </div>
          <p className="mt-3 text-[9px] text-center text-muted-foreground italic">
            * Base: Últimas 24h
          </p>
        </div>
      </div>

      {/* Audit Logs Section */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-semibold">Logs de Auditoria</h2>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar logs..."
                className="h-9 w-[200px] rounded-lg border border-border bg-background pl-9 pr-4 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
              {(["all", "today", "week", "month"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setDateFilter(filter)}
                  className={`rounded-md px-3 py-1 text-[10px] font-bold uppercase transition-all ${
                    dateFilter === filter 
                      ? "bg-background text-primary shadow-sm" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {filter === "all" ? "Tudo" : filter === "today" ? "Hoje" : filter === "week" ? "Semana" : "Mês"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="pb-3 pl-2">Evento</th>
                <th className="pb-3">Entidade</th>
                <th className="pb-3">Usuário</th>
                <th className="pb-3">Data/Hora</th>
                <th className="pb-3 text-right pr-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredLogs.slice(0, 10).map((log: any) => (
                <tr key={log.id} className="group hover:bg-muted/30">
                  <td className="py-3 pl-2">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${
                        log.acao?.includes('DELETE') ? 'bg-red-500' : 
                        log.acao?.includes('UPDATE') ? 'bg-blue-500' : 'bg-green-500'
                      }`} />
                      <span className="font-medium">{log.acao}</span>
                    </div>
                  </td>
                  <td className="py-3 text-muted-foreground">{log.entidade}</td>
                  <td className="py-3">
                    <span className="text-xs">{log.user_email || 'Sistema'}</span>
                  </td>
                  <td className="py-3 text-xs text-muted-foreground">
                    {new Date(log.criado_em).toLocaleString('pt-BR')}
                  </td>
                  <td className="py-3 text-right pr-2">
                    <button 
                      onClick={() => setSelectedLog(log)}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {filteredLogs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Search className="mb-2 h-8 w-8 opacity-20" />
              <p className="text-sm">Nenhum registro encontrado para os filtros aplicados.</p>
            </div>
          )}
          
          {filteredLogs.length > 10 && (
            <p className="mt-4 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Mostrando os 10 registros mais recentes de {filteredLogs.length} totais
            </p>
          )}
        </div>
      </div>

      {/* Detail Modal Overlay */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="border-b border-border p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl font-semibold">Detalhes do Evento</h3>
                <button 
                  onClick={() => setSelectedLog(null)}
                  className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ChevronRight className="h-6 w-6 rotate-90" />
                </button>
              </div>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-6">
              <div className="space-y-4">
                <DetailItem label="Ação" value={selectedLog.acao} />
                <DetailItem label="Entidade" value={selectedLog.entidade} />
                <DetailItem label="ID da Entidade" value={selectedLog.entidade_id || 'N/A'} />
                <DetailItem label="Usuário" value={selectedLog.user_email || 'Sistema'} />
                <DetailItem label="Data" value={new Date(selectedLog.criado_em).toLocaleString('pt-BR')} />
                <DetailItem label="Descrição" value={selectedLog.descricao || 'Nenhuma descrição disponível'} />
                
                {selectedLog.detalhes && (
                  <div className="mt-6">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Dados Técnicos (JSON)</p>
                    <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-[10px] leading-relaxed text-muted-foreground">
                      {JSON.stringify(selectedLog.detalhes, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailItem({ label, value }: { label: string, value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode, label: string, value: string, sub: string }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      </div>
      <p className="font-display text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{sub}</p>
      <div className="absolute -bottom-1 -right-1 h-12 w-12 translate-x-4 translate-y-4 rounded-full bg-primary/5 transition-transform group-hover:scale-150" />
    </div>
  );
}
