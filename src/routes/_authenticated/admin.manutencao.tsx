import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wrench, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getManutencao, manutencaoEmAndamento } from "@/lib/manutencao";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/admin/manutencao")({
  head: () => ({ meta: [{ title: "Manutenção — Painel" }] }),
  component: ManutencaoPage,
});

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

function ManutencaoPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["manutencao"], queryFn: getManutencao });
  const [ativa, setAtiva] = useState(false);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setAtiva(data.manutencao_ativa);
    setInicio(toLocalInput(data.manutencao_inicio));
    setFim(toLocalInput(data.manutencao_fim));
    setMsg(data.manutencao_mensagem ?? "");
  }, [data]);

  async function salvar(override?: Partial<{ ativa: boolean; inicio: string; fim: string }>) {
    const a = override?.ativa ?? ativa;
    const i = override?.inicio ?? inicio;
    const f = override?.fim ?? fim;
    if (i && f && new Date(f) <= new Date(i)) {
      toast.error("O fim precisa ser depois do início.");
      return;
    }
    setSaving(true);
    const payload = {
      manutencao_ativa: a,
      manutencao_inicio: fromLocalInput(i),
      manutencao_fim: fromLocalInput(f),
      manutencao_mensagem: msg.trim() || null,
    };
    const { error } = await supabase.from("site_config").update(payload).eq("id", "current");
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    await logAudit({ acao: "editar", entidade: "configuracao_site", descricao: `Atualizou manutenção (ativa: ${a ? "sim" : "não"})` });
    toast.success("Manutenção salva.");
    qc.invalidateQueries({ queryKey: ["manutencao"] });
  }

  if (isLoading) return <Loader2 className="mx-auto h-6 w-6 animate-spin" />;

  const emAndamento = manutencaoEmAndamento(data ?? null);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Wrench className="h-6 w-6" />
        <h1 className="font-display text-2xl font-bold">Manutenção</h1>
      </div>

      <div className={`rounded-xl border p-4 text-sm ${emAndamento ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-background"}`}>
        {emAndamento
          ? "O site está EM MANUTENÇÃO agora. Clientes veem a tela de manutenção; funcionários e administradores navegam normalmente."
          : "O site está no ar normalmente para os clientes."}
      </div>

      <section className="space-y-4 rounded-xl border border-border bg-background p-5">
        <h2 className="font-semibold">Pausa imediata</h2>
        <div className="flex flex-wrap gap-2">
          {ativa ? (
            <button disabled={saving} onClick={() => { setAtiva(false); salvar({ ativa: false }); }}
              className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              Encerrar manutenção agora
            </button>
          ) : (
            <button disabled={saving} onClick={() => { setAtiva(true); salvar({ ativa: true }); }}
              className="rounded-full bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-50">
              Pausar o site agora
            </button>
          )}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-background p-5">
        <h2 className="font-semibold">Programar pausa</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            Início
            <input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2" />
          </label>
          <label className="text-sm">
            Fim (opcional)
            <input type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2" />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          No horário de início o site entra em manutenção sozinho e volta no horário de fim. O fim também encerra uma pausa imediata.
        </p>
        <label className="block text-sm">
          Mensagem para os clientes
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={300} rows={3}
            placeholder="Estamos fazendo melhorias. Voltamos em breve!"
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2" />
        </label>
        <div className="flex flex-wrap gap-2">
          <button disabled={saving} onClick={() => salvar()}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50">
            {saving ? "Salvando…" : "Salvar programação"}
          </button>
          <button disabled={saving} onClick={() => { setInicio(""); setFim(""); salvar({ inicio: "", fim: "" }); }}
            className="rounded-full border border-border px-4 py-2 text-sm disabled:opacity-50">
            Limpar programação
          </button>
        </div>
      </section>
    </div>
  );
}
