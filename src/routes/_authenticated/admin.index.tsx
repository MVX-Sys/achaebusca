import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listProdutos, listCategorias, isEsgotado } from "@/lib/products";
import { getImageUrl } from "@/lib/storage";
import { brl } from "@/lib/format";
import { Pencil, Trash2, Plus, Package, PackageX, PackageCheck, Search, X, SlidersHorizontal, Eye, QrCode, Loader2, ShoppingBag, Settings, Video, Image as ImageIcon, Type, Copy, CheckSquare, Square, MoreHorizontal, EyeOff, Ticket, Play, Tags, ChevronUp, ChevronDown } from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/library";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { downloadProductsCSV, downloadProductsPDF, downloadProductsXLSX } from "@/lib/pdf";
import { ExportMenu } from "@/components/export-menu";
import { getSiteConfig, updateHeroSlide, createHeroSlide, deleteHeroSlide } from "@/lib/config-site";
import { uploadImage } from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminProductsList,
});

type StatusFilter = "todos" | "ativos" | "inativos" | "esgotados" | "em-estoque";
type SortKey =
  | "ordem"
  | "recentes"
  | "antigos"
  | "nome-asc"
  | "nome-desc"
  | "menor-preco"
  | "maior-preco"
  | "menor-estoque"
  | "maior-estoque";

function AdminProductsList() {
  const qc = useQueryClient();
  const { data: produtos = [], isLoading } = useQuery({
    queryKey: ["admin-produtos"],
    queryFn: listProdutos,
  });
  const { data: categorias = [] } = useQuery({
    queryKey: ["categorias"],
    queryFn: listCategorias,
  });
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [categoriaId, setCategoriaId] = useState<string>("todas");
  
  const [cor, setCor] = useState<string>("todas");
  const [tamanho, setTamanho] = useState<string>("todos");
  const [status, setStatus] = useState<StatusFilter>("todos");
  const [novidade, setNovidade] = useState<boolean>(false);
  const [promocao, setPromocao] = useState<boolean>(false);
  const [precoMin, setPrecoMin] = useState<string>("");
  const [precoMax, setPrecoMax] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("ordem");
  const [showFilters, setShowFilters] = useState(true);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [qrToView, setQrToView] = useState<{ id: string; nome: string; hash_id?: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [showConfig, setShowConfig] = useState(false);
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [couponSearch, setCouponSearch] = useState("");
  const { data: allCupons = [] } = useQuery({
    queryKey: ["admin", "cupons-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cupons").select("id, codigo, ativo, produtos_ids");
      if (error) throw error;
      return data;
    },
    enabled: showCouponModal,
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { data: config, refetch: refetchConfig } = useQuery({
    queryKey: ["site-config"],
    queryFn: getSiteConfig,
  });
  const nav = useNavigate();

  useEffect(() => {
    if (qrToView) {
      import("qrcode").then(async (QRCode) => {
        const content = typeof window !== "undefined" 
          ? `${window.location.origin}/produto/${qrToView.id}` 
          : qrToView.id;
        const url = await QRCode.default.toDataURL(content, {
          margin: 2,
          width: 300,
          color: { dark: "#111827", light: "#FFFFFF" },
        });
        setQrDataUrl(url);
      });
    } else {
      setQrDataUrl("");
    }
  }, [qrToView]);

  useEffect(() => {
    let controls: any = null;
    if (showQRScanner) {
      const codeReader = new BrowserMultiFormatReader();
      codeReader
        .decodeFromVideoDevice(null, "video", (result, err) => {
          if (result) {
            const text = result.getText();
            try {
              // Now the QR content is directly the URL or ID
              if (text.includes("/produto/")) {
                const parts = text.split("/");
                const id = parts[parts.length - 1];
                nav({ to: "/admin/produtos/$id", params: { id } });
                setShowQRScanner(false);
                toast.success("Produto localizado via QR Code!");
              } else if (text.length > 20) { // Likely a UUID
                nav({ to: "/admin/produtos/$id", params: { id: text } });
                setShowQRScanner(false);
                toast.success("Produto localizado via ID!");
              } else {
                setQ(text);
                setShowQRScanner(false);
                toast.success("Busca preenchida via QR Code!");
              }
            } catch {
              setQ(text);
              setShowQRScanner(false);
            }
          }
        })
        .then((ctrl) => {
          controls = ctrl;
        })
        .catch((err) => {
          console.error(err);
          toast.error("Erro ao acessar a câmera.");
          setShowQRScanner(false);
        });
    }
    return () => {
      if (controls) controls.stop();
    };
  }, [showQRScanner]);

  useEffect(() => {
    produtos.forEach((p) => {
      const img = p.imagens.find((i) => i.principal) ?? p.imagens[0];
      if (img && !thumbs[p.id])
        getImageUrl(img.storage_path, { width: 160, quality: 70 }).then((u) =>
          setThumbs((prev) => ({ ...prev, [p.id]: u })),
        );
    });
  }, [produtos, thumbs]);


  const cores = useMemo(() => {
    const s = new Set<string>();
    produtos.forEach((p) => p.variacoes.forEach((v) => v.nome_cor && s.add(v.nome_cor)));
    return Array.from(s).sort();
  }, [produtos]);

  const tamanhos = useMemo(() => {
    const s = new Set<string>();
    produtos.forEach((p) => p.variacoes.forEach((v) => v.tamanho && s.add(v.tamanho)));
    return Array.from(s).sort();
  }, [produtos]);

  const stats = useMemo(() => {
    const total = produtos.length;
    const ativos = produtos.filter((p) => p.ativo && !isEsgotado(p)).length;
    const esgotados = produtos.filter((p) => isEsgotado(p)).length;
    const estoque = produtos.reduce(
      (s, p) => s + p.variacoes.reduce((a, v) => a + v.quantidade_estoque, 0),
      0,
    );
    return { total, ativos, esgotados, estoque };
  }, [produtos]);

  const activeCount =
    (q ? 1 : 0) +
    (categoriaId !== "todas" ? 1 : 0) +
    (cor !== "todas" ? 1 : 0) +
    (tamanho !== "todos" ? 1 : 0) +
    (status !== "todos" ? 1 : 0) +
    (novidade ? 1 : 0) +
    (promocao ? 1 : 0) +
    (precoMin ? 1 : 0) +
    (precoMax ? 1 : 0);

  const resetFilters = () => {
    setQ("");
    setCategoriaId("todas");
    setCor("todas");
    setTamanho("todos");
    setStatus("todos");
    setNovidade(false);
    setPromocao(false);
    setPrecoMin("");
    setPrecoMax("");
    setSort("ordem");
  };

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const min = precoMin ? Number(precoMin) : null;
    const max = precoMax ? Number(precoMax) : null;
    const list = produtos.filter((p) => {
      if (query && !p.nome.toLowerCase().includes(query)) return false;
      if (categoriaId !== "todas" && p.categoria_id !== categoriaId) return false;
      if (cor !== "todas" && !p.variacoes.some((v) => v.nome_cor === cor)) return false;
      if (tamanho !== "todos" && !p.variacoes.some((v) => v.tamanho === tamanho)) return false;
      if (min !== null && p.preco < min) return false;
      if (max !== null && p.preco > max) return false;
      const esg = isEsgotado(p);
      if (status === "ativos" && (!p.ativo || esg)) return false;
      if (status === "inativos" && p.ativo) return false;
      if (status === "esgotados" && !esg) return false;
      if (status === "em-estoque" && esg) return false;
      if (novidade && !p.novidade) return false;
      if (promocao && !p.promocao) return false;
      return true;
    });
    const totalEstoque = (p: (typeof produtos)[number]) =>
      p.variacoes.reduce((a, v) => a + v.quantidade_estoque, 0);
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case "nome-asc": return a.nome.localeCompare(b.nome);
        case "nome-desc": return b.nome.localeCompare(a.nome);
        case "menor-preco": return a.preco - b.preco;
        case "maior-preco": return b.preco - a.preco;
        case "menor-estoque": return totalEstoque(a) - totalEstoque(b);
        case "maior-estoque": return totalEstoque(b) - totalEstoque(a);
        case "ordem": return (a.ordem ?? 0) - (b.ordem ?? 0);
        case "antigos": return 0; // already sorted desc; reverse below
        default: return 0;
      }
    });
    if (sort === "antigos") sorted.reverse();
    return sorted;
  }, [produtos, q, categoriaId, cor, tamanho, status, novidade, promocao, precoMin, precoMax, sort]);

  const [reordering, setReordering] = useState(false);

  const moverProduto = async (id: string, dir: -1 | 1) => {
    if (sort !== "ordem" || reordering) return;
    const idx = filtered.findIndex((p) => p.id === id);
    const alvoIdx = idx + dir;
    if (idx < 0 || alvoIdx < 0 || alvoIdx >= filtered.length) return;
    setReordering(true);
    try {
      // Ordem completa do catálogo (não só da lista filtrada)
      const base = [...produtos].sort(
        (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0),
      );
      const item = filtered[idx];
      const alvo = filtered[alvoIdx];
      const from = base.findIndex((p) => p.id === item.id);
      const to = base.findIndex((p) => p.id === alvo.id);
      if (from < 0 || to < 0) return;
      base.splice(from, 1);
      base.splice(to, 0, item);
      const ids = base.map((p) => p.id);

      const { error } = await supabase.rpc("set_produtos_ordem", { _ids: ids });
      if (error) throw error;

      // Atualização otimista imediata
      qc.setQueryData<typeof produtos>(["admin-produtos"], (old) =>
        (old ?? []).map((p) => {
          const i = ids.indexOf(p.id);
          return i >= 0 ? { ...p, ordem: i + 1 } : p;
        }),
      );

      void logAudit({
        acao: "editar",
        entidade: "produto",
        entidade_id: id,
        descricao: `Alterou a ordem de exibição do produto "${item.nome}"`,
      });
      qc.invalidateQueries({ queryKey: ["admin-produtos"] });
      qc.invalidateQueries({ queryKey: ["produtos"] });
      toast.success("Ordem atualizada.");
    } catch (e) {
      toast.error("Não foi possível alterar a ordem.");
    } finally {
      setReordering(false);
    }
  };

  const del = async (id: string) => {
    const alvo = produtos.find((p) => p.id === id);
    if (!confirm("Excluir este produto? Esta ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("produtos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Produto excluído.");
    await logAudit({
      acao: "excluir",
      entidade: "produto",
      entidade_id: id,
      descricao: `Excluiu produto ${alvo?.nome ?? id}`,
      detalhes: alvo ? { nome: alvo.nome, preco: alvo.preco } : undefined,
    });
    qc.invalidateQueries({ queryKey: ["admin-produtos"] });
    qc.invalidateQueries({ queryKey: ["produtos"] });
  };

  const bulkAction = async (action: 'ativar' | 'desativar' | 'excluir') => {
    const ids = Array.from(selectedIds);
    // Note: selectedIds contains hash_id or id. We need internal UUIDs for DB ops.
    const internalIds = produtos
      .filter(p => selectedIds.has(p.hash_id || p.id))
      .map(p => p.id);

    if (internalIds.length === 0) return;

    if (action === 'excluir') {
      if (!confirm(`Excluir ${internalIds.length} produtos permanentemente?`)) return;
      const { error } = await supabase.from("produtos").delete().in("id", internalIds);
      if (error) return toast.error(error.message);
      toast.success(`${internalIds.length} produtos excluídos.`);
    } else {
      const active = action === 'ativar';
      const { error } = await supabase
        .from("produtos")
        .update({ ativo: active })
        .in("id", internalIds);
      if (error) return toast.error(error.message);
      toast.success(`${internalIds.length} produtos ${active ? 'ativados' : 'desativados'}.`);
    }

    await logAudit({
      acao: action === 'excluir' ? 'excluir' : 'editar',
      entidade: "produto",
      entidade_id: "bulk",
      descricao: `${action === 'excluir' ? 'Excluiu' : 'Alterou status de'} ${internalIds.length} produtos em massa`,
    });

    setSelectedIds(new Set());
    qc.invalidateQueries({ queryKey: ["admin-produtos"] });
    qc.invalidateQueries({ queryKey: ["produtos"] });
  };

  const associateCoupon = async (couponId: string) => {
    const coupon = allCupons.find(c => c.id === couponId);
    if (!coupon) return;

    const idsToAdd = Array.from(selectedIds);
    const currentIds = coupon.produtos_ids || [];
    const newIds = Array.from(new Set([...currentIds, ...idsToAdd]));

    const { error } = await supabase
      .from("cupons")
      .update({ produtos_ids: newIds })
      .eq("id", couponId);

    if (error) return toast.error(error.message);
    
    toast.success(`Produtos associados ao cupom ${coupon.codigo}!`);
    setSelectedIds(new Set());
    setShowCouponModal(false);
    qc.invalidateQueries({ queryKey: ["admin", "cupons-list"] });
    qc.invalidateQueries({ queryKey: ["admin", "cupons"] });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Produtos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie o catálogo, estoque e variações da loja.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 self-start sm:self-end">
          <Link 
            to="/admin/pedidos" 
            className="flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-lg shadow-brand/25 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-brand/30 active:scale-95"
          >
            <ShoppingBag className="h-4 w-4" />
            Gerenciar Pedidos
          </Link>
          <Link
            to="/admin/produtos/novo"
            className="btn-shine group inline-flex items-center gap-2.5 rounded-full bg-primary px-6 py-3 text-sm font-bold uppercase tracking-wide text-primary-foreground shadow-lg shadow-primary/25 ring-2 ring-primary/20 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/30"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-primary-foreground/20">
              <Plus className="h-4 w-4" />
            </span>
            Adicionar novo produto
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Total", value: stats.total, icon: Package, tone: "bg-muted text-foreground" },
          { label: "Ativos", value: stats.ativos, icon: PackageCheck, tone: "bg-success/10 text-success" },
          { label: "Esgotados", value: stats.esgotados, icon: PackageX, tone: "bg-destructive/10 text-destructive" },
          { label: "Peças em estoque", value: stats.estoque, icon: Package, tone: "bg-brand/10 text-brand" },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div
            key={label}
            className="rounded-xl border border-border bg-card p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {label}
              </span>
              <div className={`grid h-8 w-8 place-items-center rounded-full ${tone}`}>
                <Icon className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 font-display text-xl font-bold tabular-nums sm:text-2xl">
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-1">
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setShowConfig(true)}
            className="px-4 py-2 text-sm font-medium border-b-2 border-primary text-primary transition-colors flex items-center gap-2"
          >
            <Settings className="h-4 w-4" />
            Configurações da Tela Inicial
          </button>
        </div>
      </div>


      {/* Table - Responsive optimized */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nome…"
                className="w-full rounded-full border border-input bg-background py-2 pl-9 pr-10 text-sm outline-none focus:border-foreground"
              />
              <button
                onClick={() => setShowQRScanner(true)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                title="Escanear QR Code"
              >
                <QrCode className="h-4 w-4" />
              </button>
            </div>
            {showQRScanner && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
                <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-background shadow-2xl">
                  <div className="flex items-center justify-between border-b border-border p-4">
                    <h3 className="font-display font-semibold">Escanear Produto</h3>
                    <button
                      onClick={() => setShowQRScanner(false)}
                      className="rounded-full p-1 hover:bg-accent"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="aspect-square w-full bg-black">
                    <video id="video" className="h-full w-full object-cover" />
                  </div>
                  <div className="p-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      Aponte a câmera para o QR Code do produto.
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-full border border-input bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
              >
                <option value="ordem">Ordem de exibição (manual)</option>
                <option value="recentes">Mais recentes</option>
                <option value="antigos">Mais antigos</option>
                <option value="nome-asc">Nome (A–Z)</option>
                <option value="nome-desc">Nome (Z–A)</option>
                <option value="menor-preco">Menor preço</option>
                <option value="maior-preco">Maior preço</option>
                <option value="maior-estoque">Maior estoque</option>
                <option value="menor-estoque">Menor estoque</option>
              </select>
              <button
                onClick={() => setShowFilters((v) => !v)}
                className="inline-flex items-center gap-2 rounded-full border border-input bg-background px-3 py-2 text-sm hover:bg-accent"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filtros
                {activeCount > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-foreground px-1.5 text-[10px] font-bold text-background">
                    {activeCount}
                  </span>
                )}
              </button>
              <ExportMenu
                disabled={filtered.length === 0}
                count={filtered.length}
                onExport={(format) => {
                  const rows = filtered.map((p) => ({
                    ...p,
                    categoriaNome: categorias.find((c) => c.id === p.categoria_id)?.nome,
                  }));
                  if (format === "csv") downloadProductsCSV(rows);
                  else if (format === "xlsx") downloadProductsXLSX(rows);
                  else downloadProductsPDF(rows);
                }}
              />
              <p className="hidden text-xs text-muted-foreground sm:block">
                {filtered.length}/{produtos.length}
              </p>
            </div>
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between bg-primary/5 px-4 py-2 border-t border-primary/10 animate-in fade-in slide-in-from-top-1">
              <span className="text-xs font-medium text-primary">
                {selectedIds.size} {selectedIds.size === 1 ? 'produto selecionado' : 'produtos selecionados'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const ids = Array.from(selectedIds).join(', ');
                    navigator.clipboard.writeText(ids);
                    toast.success(`${selectedIds.size} IDs copiados!`);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
                >
                  <Copy className="h-3.5 w-3.5" />
                  IDs
                </button>
                
                <div className="h-4 w-px bg-primary/20 mx-1" />

                <button
                  onClick={() => bulkAction('ativar')}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-background px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/5 transition-colors"
                  title="Ativar selecionados"
                >
                  <Play className="h-3.5 w-3.5" />
                  Ativar
                </button>

                <button
                  onClick={() => bulkAction('desativar')}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-background px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/5 transition-colors"
                  title="Desativar selecionados"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  Inativar
                </button>

                <Link
                  to="/admin/cupons"
                  search={{ ids: Array.from(selectedIds).join(',') }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-background px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/5 transition-colors"
                  title="Criar cupom para selecionados"
                >
                  <Ticket className="h-3.5 w-3.5" />
                  Cupom
                </Link>
                
                <button
                  onClick={() => setShowCouponModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-background px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/5 transition-colors"
                  title="Associar a cupom existente"
                >
                  <Tags className="h-3.5 w-3.5" />
                  + Cupom
                </button>

                <button
                  onClick={() => bulkAction('excluir')}
                  className="inline-flex items-center gap-1.5 rounded-full border border-destructive/20 bg-background px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-destructive hover:bg-destructive/5 transition-colors"
                  title="Excluir selecionados"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir
                </button>

                <div className="h-4 w-px bg-primary/20 mx-1" />

                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors px-2"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {showConfig && config && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
              <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-background shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <h3 className="font-display font-semibold flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Configurar Banners da Home
                  </h3>
                  <button onClick={() => setShowConfig(false)} className="rounded-full p-1 hover:bg-accent">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Gerencie as imagens e textos que aparecem no topo do site.</p>
                    <button
                      onClick={async () => {
                        try {
                          await createHeroSlide({
                            titulo: "Novo Banner",
                            subtitulo: "Descrição do banner",
                            tipo: 'gradient',
                            media_url: null,
                            ordem: config.hero_slides.length,
                            ativo: true
                          });
                          toast.success("Banner adicionado!");
                          refetchConfig();
                        } catch (err: any) {
                          toast.error(err.message);
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:opacity-90"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Adicionar Slide
                    </button>
                  </div>

                  <div className="space-y-4">
                    {config.hero_slides.map((slide, index) => (
                      <div key={slide.id} className="group relative rounded-2xl border border-border bg-card p-5 space-y-4 transition-all hover:border-primary/50">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-4">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Título</label>
                                <input
                                  type="text"
                                  defaultValue={slide.titulo}
                                  onBlur={(e) => updateHeroSlide(slide.id, { titulo: e.target.value }).then(() => {
                                    toast.success("Título atualizado");
                                    refetchConfig();
                                  })}
                                  className="w-full rounded-lg border border-input bg-background p-2 text-sm focus:border-primary outline-none"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Subtítulo</label>
                                <input
                                  type="text"
                                  defaultValue={slide.subtitulo || ""}
                                  onBlur={(e) => updateHeroSlide(slide.id, { subtitulo: e.target.value }).then(() => {
                                    toast.success("Subtítulo atualizado");
                                    refetchConfig();
                                  })}
                                  className="w-full rounded-lg border border-input bg-background p-2 text-sm focus:border-primary outline-none"
                                />
                              </div>
                            </div>

                            <div className="space-y-3">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tipo de Fundo</label>
                              <div className="flex flex-wrap gap-2">
                                {[
                                  { id: 'gradient', label: 'Gradiente', icon: SlidersHorizontal },
                                  { id: 'image', label: 'Imagem', icon: ImageIcon },
                                  { id: 'video', label: 'Vídeo', icon: Video },
                                ].map((t) => (
                                  <button
                                    key={t.id}
                                    onClick={() => updateHeroSlide(slide.id, { tipo: t.id as any }).then(() => {
                                      toast.success(`Modo ${t.label} ativado`);
                                      refetchConfig();
                                    })}
                                    className={`flex items-center gap-2 rounded-full border px-4 py-1.5 transition-all text-[10px] font-bold uppercase tracking-wider ${slide.tipo === t.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent'}`}
                                  >
                                    <t.icon className="h-3 w-3" />
                                    {t.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {slide.tipo !== 'gradient' && (
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                  Mídia ({slide.tipo === 'video' ? 'Vídeo' : 'Imagem'})
                                </label>
                                <div className="flex items-center gap-3">
                                  {slide.media_url && (
                                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                                      {slide.tipo === 'video' ? (
                                        <div className="flex h-full w-full items-center justify-center bg-navy/20">
                                          <Video className="h-4 w-4 text-primary" />
                                        </div>
                                      ) : (
                                        <img src={slide.media_url} alt="" className="h-full w-full object-cover" />
                                      )}
                                    </div>
                                  )}
                                  <input
                                    type="file"
                                    accept={slide.tipo === 'video' ? "video/*" : ".jpg,.jpeg,.png,.webp,.heic,.heif,.avif,.jxl"}
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      const loadingToast = toast.loading("Enviando mídia...");
                                      try {
                                        let fileToUpload = file;
                                        if (slide.tipo === 'image') {
                                          const { processImageFile } = await import("@/lib/images");
                                          fileToUpload = await processImageFile(file);
                                        }
                                        
                                        const path = await uploadImage(fileToUpload);
                                        await updateHeroSlide(slide.id, { media_url: path });
                                        toast.success("Mídia atualizada!", { id: loadingToast });
                                        refetchConfig();
                                      } catch (err: any) {
                                        toast.error(err.message, { id: loadingToast });
                                      }
                                    }}
                                    className="flex-1 text-[10px] file:mr-3 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-[10px] file:font-bold file:bg-muted file:text-foreground hover:file:bg-muted/80 cursor-pointer"
                                  />
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col gap-2">
                            <div className="flex flex-col rounded-lg border border-border bg-muted/30 p-1">
                              <button
                                disabled={index === 0}
                                onClick={() => {
                                  const prev = config.hero_slides[index - 1];
                                  Promise.all([
                                    updateHeroSlide(slide.id, { ordem: index - 1 }),
                                    updateHeroSlide(prev.id, { ordem: index })
                                  ]).then(() => refetchConfig());
                                }}
                                className="p-1.5 hover:bg-background rounded-md transition-colors disabled:opacity-30"
                              >
                                <ChevronUp className="h-4 w-4" />
                              </button>
                              <button
                                disabled={index === config.hero_slides.length - 1}
                                onClick={() => {
                                  const next = config.hero_slides[index + 1];
                                  Promise.all([
                                    updateHeroSlide(slide.id, { ordem: index + 1 }),
                                    updateHeroSlide(next.id, { ordem: index })
                                  ]).then(() => refetchConfig());
                                }}
                                className="p-1.5 hover:bg-background rounded-md transition-colors disabled:opacity-30"
                              >
                                <ChevronDown className="h-4 w-4" />
                              </button>
                            </div>
                            <button
                              onClick={() => {
                                if (confirm("Excluir este banner?")) {
                                  deleteHeroSlide(slide.id).then(() => {
                                    toast.success("Banner excluído");
                                    refetchConfig();
                                  });
                                }
                              }}
                              className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                              title="Excluir slide"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                    {config.hero_slides.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 text-center opacity-50">
                        <ImageIcon className="h-12 w-12 mb-4" />
                        <p className="text-sm font-medium">Nenhum banner configurado.</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-4 border-t border-border flex justify-end bg-muted/30">
                  <button onClick={() => setShowConfig(false)} className="rounded-full bg-foreground text-background px-8 py-2.5 text-xs font-bold uppercase tracking-wider hover:opacity-90">
                    Concluir
                  </button>
                </div>
              </div>
            </div>
          )}

          {showFilters && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <select
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
              >
                <option value="todas">Todas categorias</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
              <select
                value={cor}
                onChange={(e) => setCor(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
              >
                <option value="todas">Todas cores</option>
                {cores.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select
                value={tamanho}
                onChange={(e) => setTamanho(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
              >
                <option value="todos">Todos tamanhos</option>
                {tamanhos.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFilter)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
              >
                <option value="todos">Qualquer status</option>
                <option value="ativos">Ativos</option>
                <option value="inativos">Inativos</option>
                <option value="em-estoque">Em estoque</option>
                <option value="esgotados">Esgotados</option>
              </select>
              <div className="flex items-center gap-3 rounded-lg border border-input bg-background px-3 py-2 text-sm">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground/80 hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={novidade}
                    onChange={(e) => setNovidade(e.target.checked)}
                    className="h-4 w-4 accent-foreground"
                  />
                  Novidade
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground/80 hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={promocao}
                    onChange={(e) => setPromocao(e.target.checked)}
                    className="h-4 w-4 accent-foreground"
                  />
                  Promoção
                </label>
              </div>
              <div className="col-span-2 flex items-center gap-2 sm:col-span-3 lg:col-span-2">
                <div className="flex flex-1 items-center rounded-lg border border-input bg-background px-2">
                  <span className="text-xs text-muted-foreground">R$</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="decimal"
                    placeholder="Mín"
                    value={precoMin}
                    onChange={(e) => setPrecoMin(e.target.value)}
                    className="w-full bg-transparent px-1.5 py-1.5 text-sm outline-none"
                  />
                </div>
                <span className="text-muted-foreground">—</span>
                <div className="flex flex-1 items-center rounded-lg border border-input bg-background px-2">
                  <span className="text-xs text-muted-foreground">R$</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="decimal"
                    placeholder="Máx"
                    value={precoMax}
                    onChange={(e) => setPrecoMax(e.target.value)}
                    className="w-full bg-transparent px-1.5 py-1.5 text-sm outline-none"
                  />
                </div>
              </div>
              {activeCount > 0 && (
                <button
                  onClick={resetFilters}
                  className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg border border-input bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground sm:col-span-3 lg:col-span-1"
                >
                  <X className="h-4 w-4" /> Limpar filtros
                </button>
              )}
            </div>
          )}
        </div>


        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-14 rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-muted">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold">
              {q ? "Nenhum resultado" : "Nenhum produto cadastrado"}
            </h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {q ? "Tente buscar por outro termo." : "Comece adicionando seu primeiro produto ao catálogo."}
            </p>
            {!q && (
              <Link
                to="/admin/produtos/novo"
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> Adicionar produto
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-border">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-muted/40 text-left">
                <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="p-4 w-10">
                    <button 
                      onClick={() => {
                        if (selectedIds.size === filtered.length) {
                          setSelectedIds(new Set());
                        } else {
                          setSelectedIds(new Set(filtered.map(p => p.hash_id || p.id)));
                        }
                      }}
                      className="rounded hover:bg-muted p-1 transition-colors"
                      title={selectedIds.size === filtered.length ? "Desmarcar todos" : "Selecionar todos da lista"}
                    >
                      {selectedIds.size > 0 && selectedIds.size === filtered.length ? (
                        <CheckSquare className="h-4 w-4 text-primary" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="p-4 font-semibold">Produto</th>
                  <th className="p-4 font-semibold">ID</th>
                  <th className="p-4 font-semibold">Preço</th>
                  <th className="p-4 font-semibold">Estoque</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, idx) => {
                  const total = p.variacoes.reduce(
                    (s, v) => s + v.quantidade_estoque,
                    0,
                  );
                  const esg = isEsgotado(p);
                  return (
                    <tr
                      key={p.id}
                      className={`border-t border-border transition-colors hover:bg-muted/40 ${selectedIds.has(p.hash_id || p.id) ? 'bg-primary/5' : ''}`}
                    >
                      <td className="p-4">
                        <button 
                          onClick={() => {
                            const next = new Set(selectedIds);
                            const id = p.hash_id || p.id;
                            if (next.has(id)) next.delete(id);
                            else next.add(id);
                            setSelectedIds(next);
                          }}
                          className="rounded hover:bg-muted p-1 transition-colors"
                        >
                          {selectedIds.has(p.hash_id || p.id) ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <Square className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                            {thumbs[p.id] ? (
                              <img
                                src={thumbs[p.id]}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="skeleton h-full w-full" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{p.nome}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono font-bold tracking-widest text-muted-foreground" title={p.hash_id}>
                          {p.hash_id || '---'}
                        </code>
                      </td>
                      <td className="p-4 tabular-nums">{brl(p.preco)}</td>
                      <td className="p-4">
                        <span className="tabular-nums">{total}</span>
                        <span className="ml-1 text-xs text-muted-foreground">pç</span>
                      </td>
                      <td className="p-4">
                        {!p.ativo ? (
                          <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                            Inativo
                          </span>
                        ) : esg ? (
                          <span className="inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-semibold text-destructive">
                            Esgotado
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">
                            Ativo
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          {sort === "ordem" && (
                            <div className="mr-1 flex items-center">
                              <button
                                onClick={() => moverProduto(p.id, -1)}
                                disabled={reordering || idx === 0}
                                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
                                title="Mover para cima"
                                aria-label="Mover para cima"
                              >
                                <ChevronUp className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => moverProduto(p.id, 1)}
                                disabled={reordering || idx === filtered.length - 1}
                                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
                                title="Mover para baixo"
                                aria-label="Mover para baixo"
                              >
                                <ChevronDown className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                          <button
                            onClick={() => setQrToView({ id: p.id, nome: p.nome, hash_id: p.hash_id })}
                            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            title="Ver QR Code"
                          >
                            <QrCode className="h-4 w-4" />
                          </button>
                          <Link
                            to="/produto/$id"
                            params={{ id: p.id }}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            aria-label="Visualizar"
                            title="Visualizar produto"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          <Link
                            to="/admin/produtos/$id"
                            params={{ id: p.id }}
                            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            aria-label="Editar"
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>
                          <button
                            onClick={() => del(p.id)}
                            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            aria-label="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {qrToView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <h3 className="font-display font-semibold">QR Code do Produto</h3>
                <p className="text-xs text-muted-foreground">{qrToView.nome} • {qrToView.id.substring(0, 8)}</p>
              </div>
              <button
                onClick={() => setQrToView(null)}
                className="rounded-full p-1 hover:bg-accent"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-col items-center justify-center gap-5 p-8 text-center">
              <div className="aspect-square w-full max-w-[200px] overflow-hidden rounded-xl border border-border bg-white p-2">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR Code" className="h-full w-full" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>

              <div className="w-full space-y-2">
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-2">
                  <code className="flex-1 truncate text-left text-[10px] font-mono text-muted-foreground">
                    ID: {qrToView.hash_id || qrToView.id}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(qrToView.hash_id || qrToView.id);
                      toast.success("ID copiado!");
                    }}
                    className="rounded-md p-1.5 hover:bg-accent"
                    title="Copiar ID"
                  >
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>
              <a
                href={qrDataUrl}
                download={`qr-${qrToView.nome.toLowerCase().replace(/\s+/g, "-")}.png`}
                className="w-full rounded-full bg-foreground py-2 text-center text-sm font-semibold text-background transition-opacity hover:opacity-90"
              >
                Baixar QR Code
              </a>
            </div>
          </div>
        </div>
      )}

      {showCouponModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-background shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h3 className="font-display font-semibold">Associar a Cupom Existente</h3>
              <button
                onClick={() => setShowCouponModal(false)}
                className="rounded-full p-1 hover:bg-accent"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              <div className="relative mb-4">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={couponSearch}
                  onChange={(e) => setCouponSearch(e.target.value)}
                  placeholder="Buscar cupom por código..."
                  className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-4 text-sm outline-none focus:border-primary"
                  autoFocus
                />
              </div>
              
              <div className="max-h-[300px] overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                {allCupons
                  .filter(c => c.codigo.toLowerCase().includes(couponSearch.toLowerCase()))
                  .map(cupom => (
                    <button
                      key={cupom.id}
                      onClick={() => associateCoupon(cupom.id)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left transition-colors hover:bg-muted group border border-transparent hover:border-border"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-full grid place-items-center ${cupom.ativo ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                          <Ticket className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-mono text-sm font-bold uppercase">{cupom.codigo}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {cupom.produtos_ids?.length || 0} produtos já associados
                          </p>
                        </div>
                      </div>
                      {!cupom.ativo && (
                        <span className="text-[10px] font-bold uppercase text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
                          Inativo
                        </span>
                      )}
                    </button>
                  ))}
                
                {allCupons.filter(c => c.codigo.toLowerCase().includes(couponSearch.toLowerCase())).length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum cupom encontrado.
                  </div>
                )}
              </div>
            </div>
            <div className="border-t border-border bg-muted/30 p-4 flex justify-between items-center">
              <p className="text-[10px] text-muted-foreground italic">
                {selectedIds.size} produtos serão adicionados ao cupom escolhido.
              </p>
              <button
                onClick={() => setShowCouponModal(false)}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
