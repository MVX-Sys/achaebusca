import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, RefreshCw, Loader2 } from "lucide-react";
import { exportarGestaoClick, restaurarGestaoClick } from "@/lib/gestaoclick.functions";
import { logAudit } from "@/lib/audit";

function baixar(nome: string, conteudo: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export function BackupGestaoClick() {
  const exportar = useServerFn(exportarGestaoClick);
  const restaurar = useServerFn(restaurarGestaoClick);
  const [busy, setBusy] = useState<"" | "json" | "csv" | "rest">("");

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
    } finally {
      setBusy("");
    }
  }

  async function rest() {
    if (!confirm("Restaurar produtos a partir do Gestão Click? Nomes e preços (atacado) dos produtos vinculados serão atualizados e os novos entram inativos no site. Nada é apagado.")) return;
    setBusy("rest");
    try {
      const r = await restaurar();
      await logAudit({ acao: "editar", entidade: "produto", descricao: `Restauração do Gestão Click: ${r.atualizados} atualizados, ${r.vinculados} vinculados, ${r.importados} importados` });
      toast.success(`${r.atualizados} atualizados · ${r.vinculados} vinculados · ${r.importados} importados${r.erros ? ` · ${r.erros} erros` : ""}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao restaurar do Gestão Click");
    } finally {
      setBusy("");
    }
  }

  const btn = "inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60";
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <RefreshCw className="h-5 w-5 text-primary" />
        <h2 className="font-display text-lg font-semibold">Produtos do Gestão Click</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Exporte o catálogo do Gestão Click ou restaure os produtos do site a partir dele. Os preços usados são sempre os de <strong>Atacado</strong>.
      </p>
      <div className="flex flex-wrap gap-2">
        <button disabled={!!busy} onClick={() => exp("json")} className={`${btn} bg-foreground text-background`}>
          {busy === "json" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Exportar .json
        </button>
        <button disabled={!!busy} onClick={() => exp("csv")} className={`${btn} border border-border`}>
          {busy === "csv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Exportar .csv
        </button>
        <button disabled={!!busy} onClick={rest} className={`${btn} bg-primary text-primary-foreground`}>
          {busy === "rest" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Restaurar do Gestão Click
        </button>
      </div>
    </section>
  );
}
