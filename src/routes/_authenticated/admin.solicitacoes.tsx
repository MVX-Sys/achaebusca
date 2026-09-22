import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/config";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import {
  Bell,
  Search,
  MessageCircle,
  Check,
  X,
  Trash2,
  RotateCcw,
  ExternalLink,
  Package,
} from "lucide-react";
import { downloadTableCSV, downloadTablePDF, downloadTableXLSX } from "@/lib/pdf";
import { ExportMenu } from "@/components/export-menu";

export const Route = createFileRoute("/_authenticated/admin/solicitacoes")({
  component: SolicitacoesPage,
});

type Status = "pendente" | "atendida" | "cancelada";

type Solicitacao = {
  id: string;
  produto_id: string;
  cor: string;
  tamanho: string;
  cliente_nome: string;
  cliente_whatsapp: string;
  observacao: string | null;
  status: Status;
  criado_em: string;
  atualizado_em: string;
  produtos: { id: string; nome: string; marca: string | null } | null;
};

async function listSolicitacoes(): Promise<Solicitacao[]> {
  const { data, error } = await supabase
    .from("solicitacoes_reposicao")
    .select(
      "id, produto_id, cor, tamanho, cliente_nome, cliente_whatsapp, observacao, status, criado_em, atualizado_em, produtos:produto_id (id, nome, marca)",
    )
    .order("criado_em", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Solicitacao[];
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function normalizeWhatsapp(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function buildMessage(s: Solicitacao, reposta: boolean) {
  const produto = s.produtos?.nome ?? "produto";
  if (reposta) {
    return `Olá ${s.cliente_nome}! Boa notícia 🎉 O produto *${produto}* (cor ${s.cor}, tamanho ${s.tamanho}) da ${BRAND} acabou de ser reposto. Corre pra garantir o seu!`;
  }
  return `Olá ${s.cliente_nome}! Aqui é da ${BRAND}. Recebemos sua solicitação de aviso de reposição do produto *${produto}* (cor ${s.cor}, tamanho ${s.tamanho}). Já já teremos novidades!`;
}

function SolicitacoesPage() {
  const qc = useQueryClient();
  const { data: itens = [], isLoading } = useQuery({
    queryKey: ["admin-solicitacoes"],
    queryFn: listSolicitacoes,
  });

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"todas" | Status>("todas");
  const [produtoId, setProdutoId] = useState<string>("todos");
  const [sort, setSort] = useState<"recentes" | "antigos" | "status" | "cliente-asc" | "cliente-desc">("recentes");

  const produtosOptions = useMemo(() => {
    const map = new Map<string, string>();
    itens.forEach((s) => {
      if (s.produtos) map.set(s.produtos.id, s.produtos.nome);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [itens]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = itens.filter((s) => {
      if (status !== "todas" && s.status !== status) return false;
      if (produtoId !== "todos" && s.produto_id !== produtoId) return false;
      if (!query) return true;
      const bag = `${s.cliente_nome} ${s.cliente_whatsapp} ${s.cor} ${s.tamanho} ${s.produtos?.nome ?? ""}`.toLowerCase();
      return bag.includes(query);
    });
    const statusOrder: Record<Status, number> = { pendente: 0, atendida: 1, cancelada: 2 };
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case "antigos": return a.criado_em.localeCompare(b.criado_em);
        case "status": return statusOrder[a.status] - statusOrder[b.status];
        case "cliente-asc": return a.cliente_nome.localeCompare(b.cliente_nome);
        case "cliente-desc": return b.cliente_nome.localeCompare(a.cliente_nome);
        default: return b.criado_em.localeCompare(a.criado_em);
      }
    });
    return sorted;
  }, [itens, q, status, produtoId, sort]);

  const stats = useMemo(() => {
    const total = itens.length;
    const pendentes = itens.filter((s) => s.status === "pendente").length;
    const atendidas = itens.filter((s) => s.status === "atendida").length;
    return { total, pendentes, atendidas };
  }, [itens]);

  const updateStatus = async (s: Solicitacao, novo: Status) => {
    const { error } = await supabase
      .from("solicitacoes_reposicao")
      .update({ status: novo })
      .eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Status atualizado.");
    const acao =
      novo === "atendida" ? "marcar_atendida" : novo === "cancelada" ? "cancelar" : "reabrir";
    await logAudit({
      acao,
      entidade: "solicitacao_reposicao",
      entidade_id: s.id,
      descricao: `Status → ${novo} · ${s.produtos?.nome ?? "produto"} (${s.cor}/${s.tamanho})`,
      detalhes: { cliente: s.cliente_nome, whatsapp: s.cliente_whatsapp, status_anterior: s.status },
    });
    qc.invalidateQueries({ queryKey: ["admin-solicitacoes"] });
  };

  const remove = async (s: Solicitacao) => {
    if (!confirm("Excluir esta solicitação?")) return;
    const { error } = await supabase.from("solicitacoes_reposicao").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Solicitação excluída.");
    await logAudit({
      acao: "excluir",
      entidade: "solicitacao_reposicao",
      entidade_id: s.id,
      descricao: `Excluída · ${s.produtos?.nome ?? "produto"} (${s.cor}/${s.tamanho})`,
      detalhes: { cliente: s.cliente_nome, whatsapp: s.cliente_whatsapp },
    });
    qc.invalidateQueries({ queryKey: ["admin-solicitacoes"] });
  };

  const abrirWhatsApp = (s: Solicitacao, reposta: boolean) => {
    const numero = normalizeWhatsapp(s.cliente_whatsapp);
    if (!numero) return toast.error("WhatsApp inválido.");
    const msg = buildMessage(s, reposta);
    window.open(
      `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`,
      "_blank",
      "noopener,noreferrer",
    );
    void logAudit({
      acao: reposta ? "avisar_reposicao" : "reenviar_whatsapp",
      entidade: "solicitacao_reposicao",
      entidade_id: s.id,
      descricao: reposta
        ? `Avisou reposição · ${s.produtos?.nome ?? "produto"} (${s.cor}/${s.tamanho})`
        : `Reenviou WhatsApp · ${s.produtos?.nome ?? "produto"} (${s.cor}/${s.tamanho})`,
      detalhes: { cliente: s.cliente_nome, whatsapp: s.cliente_whatsapp },
    });
  };

  // ---- Janela de seleção de destinatários ----
  const [avisoBase, setAvisoBase] = useState<Solicitacao | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [numeroExtra, setNumeroExtra] = useState("");

  const candidatos = useMemo(() => {
    if (!avisoBase) return [] as Solicitacao[];
    return itens.filter(
      (s) => s.produto_id === avisoBase.produto_id && s.status !== "cancelada",
    );
  }, [itens, avisoBase]);

  const abrirJanelaAviso = (s: Solicitacao) => {
    setAvisoBase(s);
    setSelecionados([s.id]);
    setNumeroExtra("");
  };

  const toggleSelecionado = (id: string) =>
    setSelecionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const enviarAvisos = () => {
    if (!avisoBase) return;
    const alvos = candidatos.filter((c) => selecionados.includes(c.id));
    const extra = normalizeWhatsapp(numeroExtra);
    if (alvos.length === 0 && !extra) {
      return toast.error("Selecione ao menos um destinatário.");
    }
    alvos.forEach((c) => abrirWhatsApp(c, true));
    if (extra) {
      const msg = buildMessage(avisoBase, true);
      window.open(
        `https://wa.me/${extra}?text=${encodeURIComponent(msg)}`,
        "_blank",
        "noopener,noreferrer",
      );
    }
    toast.success(`Mensagem aberta para ${alvos.length + (extra ? 1 : 0)} contato(s).`);
    setAvisoBase(null);
  };


  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Painel
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Solicitações de reposição
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Contate clientes assim que houver reposição de estoque.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total", value: stats.total, tone: "bg-muted text-foreground" },
          { label: "Pendentes", value: stats.pendentes, tone: "bg-brand/10 text-brand" },
          { label: "Atendidas", value: stats.atendidas, tone: "bg-success/10 text-success" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {s.label}
              </span>
              <div className={`grid h-8 w-8 place-items-center rounded-full ${s.tone}`}>
                <Bell className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 font-display text-xl font-bold tabular-nums sm:text-2xl">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar cliente, produto, cor…"
              className="w-full rounded-full border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-foreground"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status | "todas")}
            className="rounded-full border border-input bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
          >
            <option value="todas">Todos os status</option>
            <option value="pendente">Pendentes</option>
            <option value="atendida">Atendidas</option>
            <option value="cancelada">Canceladas</option>
          </select>
          <select
            value={produtoId}
            onChange={(e) => setProdutoId(e.target.value)}
            className="rounded-full border border-input bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
          >
            <option value="todos">Todos os produtos</option>
            {produtosOptions.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="rounded-full border border-input bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
          >
            <option value="recentes">Mais recentes</option>
            <option value="antigos">Mais antigos</option>
            <option value="status">Por status</option>
            <option value="cliente-asc">Cliente (A–Z)</option>
            <option value="cliente-desc">Cliente (Z–A)</option>
          </select>
          <div className="ml-auto flex items-center gap-2">
            <p className="hidden text-xs text-muted-foreground sm:block">
              {filtered.length}/{itens.length}
            </p>
            <ExportMenu
              disabled={filtered.length === 0}
              count={filtered.length}
              onExport={(format) => {
                const headers = ["Data", "Status", "Produto", "Cor", "Tamanho", "Cliente", "WhatsApp", "Observação"];
                const rows = filtered.map((s) => [
                  formatDate(s.criado_em),
                  s.status,
                  s.produtos?.nome ?? "—",
                  s.cor,
                  s.tamanho,
                  s.cliente_nome,
                  s.cliente_whatsapp,
                  s.observacao ?? "",
                ]);
                if (format === "csv") downloadTableCSV("reposicoes", headers, rows);
                else if (format === "xlsx") downloadTableXLSX("reposicoes", "Reposições", headers, rows);
                else {
                  const cols = [
                    { label: "Data", width: 26 },
                    { label: "Status", width: 20 },
                    { label: "Produto", width: 55 },
                    { label: "Cor", width: 22 },
                    { label: "Tam.", width: 14 },
                    { label: "Cliente", width: 40 },
                    { label: "WhatsApp", width: 30 },
                    { label: "Obs.", width: 45 },
                  ];
                  downloadTablePDF("Solicitações de reposição", "reposicoes", cols, rows);
                }
              }}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-muted">
              <Bell className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold">Nenhuma solicitação</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              As solicitações de reposição feitas pelos clientes aparecerão aqui.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((s) => (
              <li key={s.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                        s.status === "pendente"
                          ? "bg-brand/10 text-brand"
                          : s.status === "atendida"
                            ? "bg-success/10 text-success"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {s.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(s.criado_em)}
                    </span>
                  </div>

                  <div className="flex items-start gap-2">
                    <Package className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      {s.produtos ? (
                        <Link
                          to="/admin/produtos/$id"
                          params={{ id: s.produto_id }}
                          className="truncate font-medium underline-offset-2 hover:underline"
                        >
                          {s.produtos.nome}
                        </Link>
                      ) : (
                        <span className="italic text-muted-foreground">Produto removido</span>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Cor <strong className="text-foreground">{s.cor}</strong> · Tam.{" "}
                        <strong className="text-foreground">{s.tamanho}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="text-sm">
                    <p className="font-medium">{s.cliente_nome}</p>
                    <p className="text-xs text-muted-foreground">
                      WhatsApp: {s.cliente_whatsapp}
                    </p>
                    {s.observacao && (
                      <p className="mt-1 rounded-md bg-muted/60 px-2 py-1.5 text-xs italic text-muted-foreground">
                        “{s.observacao}”
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <button
                    onClick={() => abrirJanelaAviso(s)}
                    title="Avisar que foi reposto"
                    className="inline-flex items-center gap-1.5 rounded-full bg-success px-3 py-2 text-xs font-semibold text-success-foreground hover:opacity-90"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Avisar reposição
                  </button>
                  <button
                    onClick={() => abrirWhatsApp(s, false)}
                    title="Reenviar mensagem"
                    className="rounded-full border border-border p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  {s.produtos && (
                    <Link
                      to="/produto/$id"
                      params={{ id: s.produto_id }}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-border p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="Ver produto"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  )}
                  {s.status !== "atendida" && (
                    <button
                      onClick={() => updateStatus(s, "atendida")}
                      title="Marcar como atendida"
                      className="rounded-full border border-border p-2 text-muted-foreground hover:bg-success/10 hover:text-success"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                  {s.status !== "cancelada" && (
                    <button
                      onClick={() => updateStatus(s, "cancelada")}
                      title="Cancelar"
                      className="rounded-full border border-border p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  {s.status !== "pendente" && (
                    <button
                      onClick={() => updateStatus(s, "pendente")}
                      title="Reabrir"
                      className="rounded-full border border-border p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Bell className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => remove(s)}
                    title="Excluir"
                    className="rounded-full border border-border p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
