import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Flame, Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listProdutos, type ProductListItem } from "@/lib/products";
import { logAudit } from "@/lib/audit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/admin/destaques")({
  head: () => ({ meta: [{ title: "Destaques da página inicial — Painel" }] }),
  component: DestaquesPage,
});

const MAX = 8;

function DestaquesPage() {
  const qc = useQueryClient();
  const { data: produtos = [], isLoading } = useQuery({ queryKey: ["admin-produtos-destaques"], queryFn: listProdutos });
  const [novidades, setNovidades] = useState<string[]>([]);
  const [ofertas, setOfertas] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("site_config")
      .select("destaques_novidades, destaques_ofertas")
      .eq("id", "current")
      .maybeSingle()
      .then(({ data }) => {
        setNovidades(((data as any)?.destaques_novidades as string[]) ?? []);
        setOfertas(((data as any)?.destaques_ofertas as string[]) ?? []);
      });
  }, []);

  async function salvar() {
    setSaving(true);
    const { error } = await supabase
      .from("site_config")
      .update({ destaques_novidades: novidades, destaques_ofertas: ofertas } as never)
      .eq("id", "current");
    setSaving(false);
    if (error) return toast.error("Não foi possível salvar: " + error.message);
    await logAudit({ acao: "editar", entidade: "configuracao_site", descricao: "Atualizou destaques da página inicial" });
    qc.invalidateQueries({ queryKey: ["site-config"] });
    toast.success("Destaques salvos");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold">Destaques da página inicial</h1>
          <p className="text-sm text-muted-foreground">
            Escolha até {MAX} produtos para cada seção. Sem nenhuma escolha, o site mostra automaticamente.
          </p>
        </div>
        <Button className="ml-auto" onClick={salvar} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar
        </Button>
      </div>
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Selecao
            titulo="Novidades"
            icon={<Sparkles className="h-4 w-4 text-primary" />}
            produtos={produtos}
            sel={novidades}
            setSel={setNovidades}
          />
          <Selecao
            titulo="Melhores Ofertas"
            icon={<Flame className="h-4 w-4 text-primary" />}
            produtos={produtos}
            sel={ofertas}
            setSel={setOfertas}
          />
        </div>
      )}
    </div>
  );
}

function Selecao({
  titulo, icon, produtos, sel, setSel,
}: {
  titulo: string;
  icon: React.ReactNode;
  produtos: ProductListItem[];
  sel: string[];
  setSel: (v: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return produtos.filter((p) => {
      const cod = String((p as any).codigo_base ?? "").toLowerCase();
      return !t || p.nome.toLowerCase().includes(t) || cod.includes(t);
    });
  }, [produtos, q]);

  function toggle(id: string) {
    if (sel.includes(id)) setSel(sel.filter((x) => x !== id));
    else if (sel.length >= MAX) toast.error(`Máximo de ${MAX} produtos`);
    else setSel([...sel, id]);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">{icon}{titulo}</CardTitle>
        <CardDescription>{sel.length}/{MAX} escolhidos — aparecem nesta ordem.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {sel.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {sel.map((id, i) => (
              <span key={id} className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs">
                {i + 1}. {byId.get(id)?.nome ?? "Produto removido"}
                <button onClick={() => toggle(id)} aria-label="Remover"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
        <Input placeholder="Buscar por nome ou código" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-96 space-y-1 overflow-y-auto">
          {filtrados.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent">
              <Checkbox checked={sel.includes(p.id)} onCheckedChange={() => toggle(p.id)} />
              <span className="flex-1 truncate text-sm">
                {(p as any).codigo_base ? <span className="mr-2 text-muted-foreground">{(p as any).codigo_base}</span> : null}
                {p.nome}
              </span>
              {!p.ativo && <span className="text-xs text-muted-foreground">inativo</span>}
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
