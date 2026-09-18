import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Plus,
  Trash2,
  User,
  Phone,
  Briefcase,
  X,
  Upload,
  Pencil,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  listAtendentes,
  createAtendente,
  updateAtendente,
  deleteAtendente,
  type AtendenteRow,
} from "@/lib/atendentes.functions";
import { BRAND } from "@/lib/config";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "atendentes-v1-private";
const PAGE_SIZE = 12;

export const Route = createFileRoute("/_authenticated/admin/atendentes")({
  head: () => ({
    meta: [
      { title: `Atendentes — ${BRAND}` },
      {
        name: "description",
        content: `Gerencie os atendentes do WhatsApp na ${BRAND}.`,
      },
    ],
  }),
  component: AtendentesPage,
});

const signedCache = new Map<string, string>();

function useSignedPhoto(path?: string | null) {
  const [url, setUrl] = useState<string>(() => (path ? signedCache.get(path) ?? "" : ""));

  useEffect(() => {
    let alive = true;
    if (!path) {
      setUrl("");
      return;
    }
    const cached = signedCache.get(path);
    if (cached) {
      setUrl(cached);
      return;
    }
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60 * 24)
      .then(({ data }) => {
        if (data?.signedUrl) {
          signedCache.set(path, data.signedUrl);
          if (alive) setUrl(data.signedUrl);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [path]);

  return url;
}

function AtendenteAvatar({
  path,
  nome,
  size = "h-12 w-12",
  iconSize = "h-6 w-6",
}: {
  path?: string | null;
  nome: string;
  size?: string;
  iconSize?: string;
}) {
  const url = useSignedPhoto(path);
  return (
    <div
      className={`relative grid ${size} shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10 text-primary`}
    >
      {url ? (
        <img
          src={url}
          alt={nome}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <User className={iconSize} />
      )}
    </div>
  );
}

type FormState = {
  id?: string;
  nome: string;
  whatsapp: string;
  cargo: string;
  foto_path: string | null;
  ativo: boolean;
};

const EMPTY_FORM: FormState = {
  nome: "",
  whatsapp: "",
  cargo: "Vendedor",
  foto_path: null,
  ativo: true,
};

function AtendentesPage() {
  const { roleKind } = useAuth();
  const fetchAtendentes = useServerFn(listAtendentes);
  const addAtendente = useServerFn(createAtendente);
  const editAtendente = useServerFn(updateAtendente);
  const removeAtendente = useServerFn(deleteAtendente);
  const qc = useQueryClient();

  const [form, setForm] = useState<FormState | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [page, setPage] = useState(0);

  const { data: atendentes, isLoading, error: queryError } = useQuery({
    queryKey: ["admin", "atendentes"],
    queryFn: () => fetchAtendentes(),
    enabled: !!roleKind && roleKind !== "cliente",
  });

  const list = useMemo(() => atendentes ?? [], [atendentes]);
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const visible = useMemo(
    () => list.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE),
    [list, currentPage],
  );

  const saveMutation = useMutation({
    mutationFn: async (data: FormState) => {
      const nome = data.nome.trim();
      const whatsapp = data.whatsapp.replace(/\D/g, "");
      const cargo = data.cargo.trim() || "Vendedor";
      if (nome.length < 2) throw new Error("Informe um nome válido.");
      if (whatsapp.length < 10)
        throw new Error("WhatsApp inválido. Use DDI+DDD+número, ex: 5587991547820.");
      if (data.id) {
        return editAtendente({
          data: { id: data.id, nome, whatsapp, cargo, foto_path: data.foto_path, ativo: data.ativo },
        });
      }
      return addAtendente({
        data: { nome, whatsapp, cargo, foto_path: data.foto_path, ativo: data.ativo },
      });
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "atendentes"] });
      qc.invalidateQueries({ queryKey: ["atendentes"] });
      setForm(null);
      toast.success(vars.id ? "Atendente atualizado!" : "Atendente adicionado!");
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao salvar atendente"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeAtendente({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "atendentes"] });
      qc.invalidateQueries({ queryKey: ["atendentes"] });
      toast.success("Atendente removido!");
    },
    onError: (err: any) => toast.error(err?.message || "Não foi possível excluir o atendente."),
  });

  const toggleMutation = useMutation({
    mutationFn: (args: { id: string; ativo: boolean }) =>
      editAtendente({ data: { id: args.id, ativo: args.ativo } }),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "atendentes"] });
      qc.invalidateQueries({ queryKey: ["atendentes"] });
      toast.success(vars.ativo ? "Atendente ativado." : "Atendente desativado.");
    },
    onError: (err: any) => toast.error(err?.message || "Não foi possível alterar o status."),
  });

  if (roleKind === "cliente") {
    return (
      <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
        Acesso restrito ao painel administrativo.
      </div>
    );
  }

  if (queryError) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-10 text-center text-sm text-destructive">
        Erro ao carregar atendentes. Por favor, tente novamente.
        <br />
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["admin", "atendentes"] })}
          className="mt-4 rounded-full bg-destructive px-4 py-2 text-white"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
            Atendentes WhatsApp
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie quem recebe os pedidos dos clientes no WhatsApp.
          </p>
        </div>
        <button
          onClick={() => setForm({ ...EMPTY_FORM })}
          className="btn-shine inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-95 active:scale-95"
        >
          <Plus className="h-4 w-4" />
          Novo atendente
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="mb-8 flex flex-col gap-4 border-b border-border pb-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          <Link
            to="/admin"
            className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            Produtos
          </Link>
          <Link
            to="/admin/vendas"
            className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            Vendas
          </Link>
          <Link
            to="/admin/usuarios"
            className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            Usuários
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="grid place-items-center rounded-2xl border border-border bg-card py-16">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando atendentes…
          </div>
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhum atendente cadastrado.
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((a: AtendenteRow) => (
              <div
                key={a.id}
                className={`relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm transition-all ${
                  !a.ativo ? "opacity-60" : "hover:border-primary/30 hover:shadow-md"
                }`}
              >
                <div className="flex items-start gap-4">
                  <AtendenteAvatar path={a.foto_path} nome={a.nome} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-display font-semibold text-foreground">
                      {a.nome}
                    </h3>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Briefcase className="h-3 w-3" />
                      {a.cargo}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      {a.whatsapp}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                  <button
                    onClick={() => toggleMutation.mutate({ id: a.id, ativo: !a.ativo })}
                    className={`text-xs font-semibold ${
                      a.ativo ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {a.ativo ? "Ativo" : "Inativo"}
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      aria-label={`Editar ${a.nome}`}
                      onClick={() =>
                        setForm({
                          id: a.id,
                          nome: a.nome,
                          whatsapp: a.whatsapp,
                          cargo: a.cargo || "Vendedor",
                          foto_path: a.foto_path,
                          ativo: a.ativo,
                        })
                      }
                      className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      aria-label={`Excluir ${a.nome}`}
                      onClick={() => {
                        if (confirm("Deseja realmente excluir este atendente?")) {
                          deleteMutation.mutate(a.id);
                        }
                      }}
                      className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="rounded-full border border-border p-2 disabled:opacity-40"
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-muted-foreground">
                Página {currentPage + 1} de {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage >= totalPages - 1}
                className="rounded-full border border-border p-2 disabled:opacity-40"
                aria-label="Próxima página"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}

      {form && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold">
                {form.id ? "Editar atendente" : "Novo atendente"}
              </h2>
              <button onClick={() => setForm(null)} className="rounded-full p-1.5 hover:bg-accent">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Nome
                </label>
                <input
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Ex: Gustavo"
                  className="input"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  WhatsApp (com DDD e 55)
                </label>
                <input
                  value={form.whatsapp}
                  onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                  placeholder="Ex: 5587991547820"
                  className="input"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Cargo
                </label>
                <input
                  value={form.cargo}
                  onChange={(e) => setForm({ ...form, cargo: e.target.value })}
                  placeholder="Ex: Vendedor"
                  className="input"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </label>
                <div className="flex gap-2">
                  {[true, false].map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => setForm({ ...form, ativo: v })}
                      className={`flex-1 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                        form.ativo === v
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {v ? "Ativo" : "Inativo"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Foto do Perfil
                </label>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <AtendenteAvatar
                      path={form.foto_path}
                      nome={form.nome || "Atendente"}
                      size="h-16 w-16"
                      iconSize="h-8 w-8"
                    />
                    {isUploading && (
                      <div className="absolute inset-0 grid place-items-center rounded-full bg-black/40">
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      </div>
                    )}
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold transition-colors hover:bg-accent">
                    <Upload className="h-3.5 w-3.5" />
                    {form.foto_path ? "Alterar foto" : "Upload foto"}
                    <input
                      type="file"
                      accept="image/*,.heic,.heif,.webp,.avif"
                      className="hidden"
                      onChange={async (e) => {
                        const original = e.target.files?.[0];
                        if (!original) return;
                        try {
                          setIsUploading(true);
                          const { processImageFile } = await import("@/lib/images");
                          const file = await processImageFile(original);
                          const fileExt = file.name.split(".").pop();
                          const filePath = `${crypto.randomUUID()}.${fileExt}`;

                          const { error: uploadError } = await supabase.storage
                            .from(BUCKET)
                            .upload(filePath, file, {
                              contentType: file.type,
                              cacheControl: "31536000",
                              upsert: true,
                            });

                          if (uploadError) {
                            if (
                              (uploadError as any).status === 403 ||
                              uploadError.message?.includes("row-level security")
                            ) {
                              throw new Error("Erro de permissão ao enviar a imagem.");
                            }
                            throw uploadError;
                          }

                          setForm((f) => (f ? { ...f, foto_path: filePath } : f));
                          toast.success("Foto carregada!");
                        } catch (err: any) {
                          toast.error(`Erro ao carregar imagem: ${err?.message || "Tente novamente"}`);
                        } finally {
                          setIsUploading(false);
                        }
                      }}
                    />
                  </label>
                  {form.foto_path && (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, foto_path: null })}
                      className="text-xs font-medium text-destructive hover:underline"
                    >
                      Remover
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-8 flex gap-3 pt-4">
                <button
                  onClick={() => setForm(null)}
                  className="flex-1 rounded-full border border-border py-2.5 text-sm font-semibold transition-colors hover:bg-accent"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => saveMutation.mutate(form)}
                  disabled={saveMutation.isPending || !form.nome || !form.whatsapp}
                  className="btn-shine flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {saveMutation.isPending ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
