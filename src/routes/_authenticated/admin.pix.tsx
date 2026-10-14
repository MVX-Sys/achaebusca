import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QrCode, Plus, Trash2, Star, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin/pix")({
  head: () => ({ meta: [{ title: "PIX — Painel" }] }),
  component: PixPage,
});

type Tipo = "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";
type Chave = {
  id: string; tipo: Tipo; chave: string; nome_recebedor: string;
  cidade: string | null; banco: string | null; principal: boolean; ativo: boolean;
};

const TIPOS: Record<Tipo, string> = {
  cpf: "CPF", cnpj: "CNPJ", email: "E-mail", telefone: "Telefone", aleatoria: "Chave aleatória",
};

function validar(tipo: Tipo, v: string): string | null {
  const d = v.replace(/\D/g, "");
  if (tipo === "cpf" && d.length !== 11) return "CPF deve ter 11 números";
  if (tipo === "cnpj" && d.length !== 14) return "CNPJ deve ter 14 números";
  if (tipo === "telefone" && (d.length < 10 || d.length > 13)) return "Telefone inválido";
  if (tipo === "email" && !/^\S+@\S+\.\S+$/.test(v)) return "E-mail inválido";
  if (tipo === "aleatoria" && !/^[0-9a-f-]{32,36}$/i.test(v.trim())) return "Chave aleatória inválida";
  return null;
}

function normalizar(tipo: Tipo, v: string) {
  if (tipo === "cpf" || tipo === "cnpj") return v.replace(/\D/g, "");
  if (tipo === "telefone") {
    const d = v.replace(/\D/g, "");
    return "+" + (d.startsWith("55") ? d : "55" + d);
  }
  return v.trim().toLowerCase();
}

function PixPage() {
  const [lista, setLista] = useState<Chave[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tipo, setTipo] = useState<Tipo>("cnpj");
  const [chave, setChave] = useState("");
  const [nome, setNome] = useState("");
  const [cidade, setCidade] = useState("");
  const [banco, setBanco] = useState("");

  async function carregar() {
    const { data, error } = await supabase.from("pix_chaves").select("*").order("criado_em");
    if (error) toast.error(error.message);
    setLista((data as Chave[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { carregar(); }, []);

  async function adicionar() {
    const erro = validar(tipo, chave);
    if (erro) return toast.error(erro);
    if (!nome.trim()) return toast.error("Informe o nome do recebedor");
    setSaving(true);
    const valor = normalizar(tipo, chave);
    const { error } = await supabase.from("pix_chaves").insert({
      tipo, chave: valor, nome_recebedor: nome.trim(),
      cidade: cidade.trim() || null, banco: banco.trim() || null,
      principal: lista.length === 0,
    });
    setSaving(false);
    if (error) return toast.error(error.code === "23505" ? "Essa chave já está cadastrada" : error.message);
    await logAudit({ acao: "criar", entidade: "configuracao_site", descricao: `Cadastrou chave PIX (${TIPOS[tipo]})` });
    setChave(""); setNome(""); setCidade(""); setBanco("");
    toast.success("Chave PIX cadastrada");
    carregar();
  }

  async function tornarPrincipal(id: string) {
    await supabase.from("pix_chaves").update({ principal: false }).neq("id", id);
    await supabase.from("pix_chaves").update({ principal: true }).eq("id", id);
    carregar();
  }

  async function alternarAtivo(c: Chave) {
    await supabase.from("pix_chaves").update({ ativo: !c.ativo }).eq("id", c.id);
    carregar();
  }

  async function excluir(c: Chave) {
    if (!confirm(`Excluir a chave ${c.chave}?`)) return;
    const { error } = await supabase.from("pix_chaves").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    await logAudit({ acao: "excluir", entidade: "configuracao_site", descricao: `Excluiu chave PIX (${TIPOS[c.tipo]})` });
    carregar();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary">
          <QrCode className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-xl font-semibold">PIX</h1>
          <p className="text-sm text-muted-foreground">Cadastre as chaves PIX da loja.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova chave PIX</CardTitle>
          <CardDescription>A primeira chave cadastrada vira a principal.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Select value={tipo} onValueChange={(v) => setTipo(v as Tipo)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(TIPOS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Chave" value={chave} onChange={(e) => setChave(e.target.value)} />
          <Input placeholder="Nome do recebedor" value={nome} onChange={(e) => setNome(e.target.value)} />
          <Input placeholder="Cidade (opcional)" value={cidade} onChange={(e) => setCidade(e.target.value)} />
          <Input placeholder="Banco (opcional)" value={banco} onChange={(e) => setBanco(e.target.value)} />
          <Button onClick={adicionar} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Cadastrar chave
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Chaves cadastradas</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : lista.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma chave cadastrada ainda.</p>
          ) : lista.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{TIPOS[c.tipo]}</Badge>
                  {c.principal && <Badge>Principal</Badge>}
                  {!c.ativo && <Badge variant="outline">Inativa</Badge>}
                </div>
                <p className="mt-1 truncate font-mono text-sm">{c.chave}</p>
                <p className="text-xs text-muted-foreground">
                  {c.nome_recebedor}{c.cidade ? ` · ${c.cidade}` : ""}{c.banco ? ` · ${c.banco}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={c.ativo} onCheckedChange={() => alternarAtivo(c)} aria-label="Ativa" />
                {!c.principal && (
                  <Button size="sm" variant="ghost" onClick={() => tornarPrincipal(c.id)}>
                    <Star className="mr-1 h-4 w-4" />Principal
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => excluir(c)} aria-label="Excluir">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
