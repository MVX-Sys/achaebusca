import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CartDrawer } from "@/components/cart-drawer";
import { getPromoInfo, isEsgotado, type Categoria, type ProductListItem, type VariacaoProduto } from "@/lib/products";
import { listCategoriasFn, getProdutoFn } from "@/lib/products.functions";
import { downloadImage, downloadImagesAsZip, getImageUrl } from "@/lib/storage";
import { brl } from "@/lib/format";
import { useCart, MIN_PECAS_PERSONALIZACAO } from "@/lib/cart";
import { getGruposPersonalizacao } from "@/lib/personalizacao";
import { Plus, Minus, ShoppingBag, ChevronLeft, Download, Images, FileText, Bell, X, Share2, Copy, Check, QrCode } from "lucide-react";
import React from "react";
const downloadProductPDF = async (p: any) => {
  const { downloadProductPDF: fn } = await import("@/lib/pdf");
  return fn(p);
};
import { WHATSAPP_NUMBER, BRAND } from "@/lib/config";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/produto/$id")({
  loader: async ({ params, context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: ["produto", params.id],
        queryFn: () => getProdutoFn({ data: params.id }),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["categorias"],
        queryFn: () => listCategoriasFn(),
      }),
    ]);
  },
  head: ({ params }) => ({
    meta: [
      { title: `Produto — ACHAEBUSCA` },
      { name: "description", content: `Detalhes do produto ${params.id} na ACHAEBUSCA.` },
    ],
  }),
  component: ProductPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-center text-sm text-muted-foreground">
      {error.message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-10 text-center">Produto não encontrado.</div>
  ),
});

function ProductPage() {
  const { id } = Route.useParams();
  const { data: p } = useSuspenseQuery({
    queryKey: ["produto", id],
    queryFn: () => getProdutoFn({ data: id }),
    staleTime: 1000 * 30,
  });
  const { data: categorias = [] } = useSuspenseQuery({
    queryKey: ["categorias"],
    queryFn: () => listCategoriasFn(),
    staleTime: 1000 * 60 * 5,

  });
  const { add, items: cartItems } = useCart();

  const [imgs, setImgs] = useState<string[]>([]);
  const [mainIdx, setMainIdx] = useState(0);
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [restock, setRestock] = useState<{ cor: string; tam: string } | null>(null);
  const [restockNome, setRestockNome] = useState("");
  const [restockZap, setRestockZap] = useState("");
  const [restockObs, setRestockObs] = useState("");
  const [restockSending, setRestockSending] = useState(false);
  const [personalizado, setPersonalizado] = useState(false);
  const [persoSel, setPersoSel] = useState<string[]>([]);
  const togglePerso = (id: string) =>
    setPersoSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const categoriaAtual = useMemo(
    () => (p?.categoria_id ? (categorias as Categoria[]).find((c) => c.id === p.categoria_id) ?? null : null),
    [p, categorias],
  );

  const gruposPerso = useMemo(
    () =>
      getGruposPersonalizacao(
        p?.nome,
        categoriaAtual?.nome,
        (p as any)?.personalizacao_tipo ?? null,
      ),
    [p, categoriaAtual],
  );
  const opcoesPersoSelecionadas = useMemo(
    () =>
      gruposPerso
        .flatMap((g) => g.opcoes)
        .filter((o) => persoSel.includes(o.id)),
    [gruposPerso, persoSel],
  );
  const adicionalPerso = opcoesPersoSelecionadas.reduce((s, o) => s + o.preco, 0);

  const enviarSolicitacao = async () => {
    if (!p || !restock) return;
    const nome = restockNome.trim();
    const zap = restockZap.trim();
    if (nome.length < 2) return toast.error("Informe seu nome.");
    const digitos = zap.replace(/\D/g, "");
    if (digitos.length < 8) return toast.error("Informe um WhatsApp válido.");
    try {
      setRestockSending(true);
      const { error } = await supabase.from("solicitacoes_reposicao").insert({
        produto_id: p.id,
        cor: restock.cor,
        tamanho: restock.tam,
        cliente_nome: nome,
        cliente_whatsapp: digitos,
        observacao: restockObs.trim() || null,
      });
      if (error) throw error;
      const msg = `Olá! Meu nome é ${nome}. Gostaria de ser avisado(a) por WhatsApp quando o produto *${p.nome}* (cor ${restock.cor}, tamanho ${restock.tam}) da ${BRAND} for reposto.${
        restockObs.trim() ? `\n\nObservação: ${restockObs.trim()}` : ""
      }`;
      window.open(
        `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`,
        "_blank",
        "noopener,noreferrer",
      );
      toast.success("Solicitação registrada! Assim que houver reposição, avisaremos.");
      setRestock(null);
      setRestockNome("");
      setRestockZap("");
      setRestockObs("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar.");
    } finally {
      setRestockSending(false);
    }
  };

  const imgPaths = useMemo(() => {
    if (!p) return [] as string[];
    return [...p.imagens]
      .sort((a: any, b: any) => (b.principal ? 1 : 0) - (a.principal ? 1 : 0) || a.ordem - b.ordem)
      .map((i) => i.storage_path);
  }, [p]);

  useEffect(() => {
    if (imgPaths.length === 0) return;
    let alive = true;
    Promise.all(imgPaths.map((sp) => getImageUrl(sp, { width: 1000, quality: 80 }))).then((u) => {
      if (alive) setImgs(u);
    });
    return () => {
      alive = false;
    };
  }, [imgPaths]);


  const matriz = useMemo(() => {
    if (!p) return { cores: [], tamanhos: [] as string[] };
    const coresMap = new Map<string, { nome: string; hex: string }>();
    const tamanhos = new Set<string>();
    for (const v of (p?.variacoes || [])) {
      coresMap.set((v as VariacaoProduto).nome_cor, { nome: (v as VariacaoProduto).nome_cor, hex: (v as VariacaoProduto).hex_cor });
      tamanhos.add((v as VariacaoProduto).tamanho);
    }
    const catSlug = p.categoria_id ? (categorias as Categoria[]).find((c) => c.id === p.categoria_id)?.slug?.toLowerCase() || "" : "";
    const isFootwear = ["chinelos", "tenis", "botas"].some(slug => catSlug.includes(slug));
    const clothingOrder = ["PP", "P", "M", "G", "GG", "XG"];

    const tams = Array.from(tamanhos).sort((a, b) => {
      if (isFootwear) {
        const numA = parseInt(a);
        const numB = parseInt(b);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      }
      const idxA = clothingOrder.indexOf(a);
      const idxB = clothingOrder.indexOf(b);
      
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      
      return a.localeCompare(b);
    });
    return { cores: Array.from(coresMap.values()), tamanhos: tams };
  }, [p]);

  const getVar = (cor: string, tam: string) =>
    (p?.variacoes || []).find((v: any) => v.nome_cor === cor && v.tamanho === tam);

  // Quantidade já reservada no carrinho por variação
  const reservado = useMemo(() => {
    const m: Record<string, number> = {};
    for (const it of cartItems) {
      m[it.variacaoId] = (m[it.variacaoId] ?? 0) + it.quantidade;
    }
    return m;
  }, [cartItems]);

  const disponivelDe = (v: { id: string; quantidade_estoque: number } | undefined) =>
    v ? Math.max(0, v.quantidade_estoque - (reservado[v.id] ?? 0)) : 0;

  const setQ = (k: string, q: number) =>
    setQtys((prev) => ({ ...prev, [k]: Math.max(0, q) }));

  const promo = useMemo(() => (p ? getPromoInfo(p) : null), [p]);
  const precoEfetivo = promo?.ativa ? promo.precoFinal : p?.preco ?? 0;

  const subtotal = useMemo(() => {
    if (!p) return 0;
    return Object.entries(qtys).reduce((s, [, q]) => s + (q as number) * precoEfetivo, 0);
  }, [qtys, p, precoEfetivo]);

  const totalItens = Object.values(qtys).reduce((s, q) => s + q, 0);

  const addAoCarrinho = () => {
    if (!p || totalItens === 0) {
      toast.error("Selecione ao menos uma variação.");
      return;
    }
    for (const [key, q] of Object.entries(qtys)) {
      if (q <= 0) continue;
      const [cor, tam] = key.split("||");
      const v = getVar(cor, tam);
      if (!v) continue;
      const livre = disponivelDe(v);
      if (livre <= 0) {
        toast.error(`${cor} · Tam ${tam}: sem estoque disponível (já está no seu carrinho).`);
        continue;
      }
      if (q > livre) {
        toast.error(`${cor} · Tam ${tam}: restam apenas ${livre} peça(s) disponíveis.`);
        continue;
      }
      add(
        {
          variacaoId: v.id,
          produtoId: p.id,
          codigo: (p as any).hash_id ?? null,
          nome: p.nome,
          cor: cor,
          hexCor: v.hex_cor,
          tamanho: tam,
          preco: p.preco,
          precoPromocional: promo?.ativa ? promo.precoFinal : null,
          promocaoAte: promo?.ativa && promo.validoAte ? promo.validoAte.toISOString() : null,
          foto: p.imagens.find((i: any) => i.principal)?.storage_path || p.imagens[0]?.storage_path || null,
          categoriaId: p.categoria_id ?? null,
          categoriaNome: categoriaAtual?.nome ?? null,
          personalizado,
          personalizacoes: personalizado ? opcoesPersoSelecionadas : [],
          estoque: v.quantidade_estoque,
        },
        q,
      );
    }
    setQtys({});
    toast.success("Adicionado ao carrinho!");
  };

  const [downloading, setDownloading] = useState(false);
  const baixarAtual = async () => {
    if (!imgPaths[mainIdx] || !p) return;
    try {
      setDownloading(true);
      const original = await getImageUrl(imgPaths[mainIdx]);
      await downloadImage(original, `${p.nome}-${mainIdx + 1}`);
      toast.success("Imagem baixada!");
    } catch {
      toast.error("Não foi possível baixar a imagem.");
    } finally {
      setDownloading(false);
    }
  };
  const baixarTodas = async () => {
    if (imgPaths.length === 0 || !p) return;
    try {
      setDownloading(true);
      const originais = (await Promise.all(imgPaths.map((sp) => getImageUrl(sp)))).filter(Boolean);
      await downloadImagesAsZip(originais, p.nome);
      toast.success(
        originais.length === 1 ? "Imagem baixada!" : `${originais.length} imagens baixadas!`,
      );
    } catch {
      toast.error("Não foi possível baixar as imagens.");
    } finally {
      setDownloading(false);
    }
  };


  const [showQR, setShowQR] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Link copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareWhatsApp = () => {
    if (!p) return;
    const text = `Confira este produto na ${BRAND}: *${p.nome}*\n\n${shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const handleGenerateQR = async () => {
    try {
      const QRCode = (await import("qrcode")).default;
      const url = await QRCode.toDataURL(shareUrl, {
        width: 400,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      });
      setQrDataUrl(url);
      setShowQR(true);
    } catch (err) {
      toast.error("Erro ao gerar QR Code");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 md:py-10">
        <nav className="mb-6 flex items-center gap-2 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">Início</Link>
          <span>/</span>
          <span className="text-foreground">
            {p?.nome ?? "Produto"}
          </span>
        </nav>

        {!p ? (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <div className="skeleton aspect-square rounded-lg" />
            <div className="space-y-4">
              <div className="skeleton h-8 w-3/4 rounded" />
              <div className="skeleton h-4 w-full rounded" />
              <div className="skeleton h-10 w-1/3 rounded" />
              <div className="skeleton h-40 w-full rounded-lg" />
            </div>
          </div>
        ) : (
          <>
<Link
              to="/produtos"
              className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground lg:hidden"
            >
              <ChevronLeft className="h-4 w-4" /> Continuar comprando
            </Link>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_400px] md:gap-8">
              {/* Gallery (Thumbs + Main) */}
              <div className="flex flex-col gap-4">
                <div className="relative aspect-[3/4] overflow-hidden rounded-2xl">
                  {imgs[mainIdx] ? (
                    <img
                      src={imgs[mainIdx]}
                      alt={p.nome}
                      width={1000}
                      height={1333}
                      fetchPriority="high"
                      decoding="async"
                      sizes="(max-width: 768px) 100vw, 60vw"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="skeleton h-full w-full" />
                  )}


                  <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-1.5">
                    {p.novidade && (
                      <span className="rounded-full bg-background/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider shadow-sm backdrop-blur">
                        Novidade
                      </span>
                    )}
                    {promo?.ativa && (
                      <span className="rounded-full bg-brand px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-brand-foreground shadow-sm">
                        -{promo.percentual}% OFF
                      </span>
                    )}
                  </div>

                  {isEsgotado(p) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
                      <span className="rounded-full bg-foreground px-5 py-2 text-xs font-bold uppercase tracking-[0.2em] text-background">
                        Esgotado
                      </span>
                    </div>
                  )}
                </div>
                
                {/* Thumbnails */}
                <div className="flex flex-row flex-wrap gap-2">
                  {imgs.map((u, i) => (
                    <button
                      key={i}
                      onClick={() => setMainIdx(i)}
                      className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                        i === mainIdx
                          ? "border-foreground ring-2 ring-foreground/10"
                          : "border-transparent opacity-70 hover:opacity-100"
                      }`}
                    >
                      <img src={u} alt="" className="h-full w-full object-contain" />
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={baixarAtual}
                    disabled={downloading}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Baixar imagem
                  </button>
                  {imgs.length > 1 && (
                    <button
                      type="button"
                      onClick={baixarTodas}
                      disabled={downloading}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
                    >
                      <Images className="h-3.5 w-3.5" />
                      Baixar todas ({imgs.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        downloadProductPDF(p);
                        toast.success("PDF do produto baixado!");
                      } catch {
                        toast.error("Não foi possível gerar o PDF.");
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium transition-colors hover:bg-accent"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Baixar PDF
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium transition-colors hover:bg-accent"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        Compartilhar
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                      <DropdownMenuItem onClick={handleShareWhatsApp}>
                        <div className="flex w-full items-center gap-2">
                          <svg className="h-4 w-4 fill-[#25D366]" viewBox="0 0 24 24">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                          </svg>
                          WhatsApp
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleCopyLink}>
                        <div className="flex w-full items-center gap-2">
                          {copied ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                          Copiar link
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleGenerateQR}>
                        <div className="flex w-full items-center gap-2">
                          <QrCode className="h-4 w-4" />
                          QR Code
                        </div>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Descrição abaixo das fotos no desktop */}
                {p.descricao && (
                  <div className="mt-8 pt-8 border-t border-border hidden md:block">
                    <h2 className="font-display font-bold text-lg mb-4 text-foreground">Descrição do Produto</h2>
                    <div className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                      {p.descricao}
                    </div>
                  </div>
                )}
              </div>

              {/* Details + Variants */}
              <div className="space-y-8">
                <div>
                  <h1 className="mt-2 font-display text-2xl font-extrabold leading-tight tracking-tight text-foreground md:text-[32px]">
                    {p.nome}
                  </h1>
                  {promo?.ativa ? (
                    <div className="mt-5 space-y-1.5">
                      <div className="flex items-baseline gap-3">
                        <p className="font-display text-3xl font-extrabold tabular-nums text-primary md:text-4xl">
                          {brl(promo.precoFinal)}
                        </p>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                          -{promo.percentual}%
                        </span>
                        <span className="text-xs text-muted-foreground">/ peça</span>
                      </div>
                      <p className="text-sm font-medium tabular-nums text-muted-foreground line-through">
                        De {brl(promo.precoOriginal)}
                      </p>
                      {promo.validoAte && (
                        <p className="text-[11px] font-medium uppercase tracking-wider text-primary">
                          Promoção válida até{" "}
                          {promo.validoAte.toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="mt-5 flex items-baseline gap-3">
                        <p className="font-display text-3xl font-extrabold tabular-nums text-foreground md:text-4xl">
                          {brl(p.preco)}
                        </p>
                        <span className="text-xs text-muted-foreground">/ peça</span>
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        ou em até 3x sem juros no combinado
                      </p>
                    </>
                  )}
                </div>

                {matriz.cores.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-foreground">
                        Selecione as Variações
                      </p>
                      <p className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        {p.variacoes.length} combinações disponíveis
                      </p>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-border bg-card">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/60">
                          <tr>
                            <th className="p-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Cor
                            </th>
                            {matriz.tamanhos.map((t) => (
                              <th
                                key={t}
                                className="p-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                              >
                                {t}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {matriz.cores.map((c) => (
                            <tr key={c.nome} className="border-t border-border">
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  <div
                                    className="h-4 w-4 shrink-0 rounded-full border border-border/80 shadow-sm"
                                    style={{ backgroundColor: c.hex }}
                                    title={`Cor ${c.nome}`}
                                    aria-label={`Cor ${c.nome}`}
                                  />
                                  <span className="text-xs font-medium">{c.nome}</span>
                                </div>
                              </td>
                              {matriz.tamanhos.map((t) => {
                                const v = getVar(c.nome, t);
                                const key = `${c.nome}||${t}`;
                                const q = qtys[key] ?? 0;
                                 const livre = disponivelDe(v as any);
                                 const disponivel = v && livre > 0;
                                if (!v)
                                  return (
                                    <td key={t} className="bg-muted/30 p-3 text-center text-muted-foreground/50">
                                      —
                                    </td>
                                  );
                                 if (!disponivel)
                                   return (
                                     <td key={t} className="p-2 text-center">
                                       {v.quantidade_estoque > 0 ? (
                                         <span
                                           title="Todo o estoque já está no seu carrinho"
                                           className="mx-auto inline-flex items-center rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                                         >
                                           No carrinho
                                         </span>
                                       ) : (
                                         <button
                                           type="button"
                                           onClick={() => setRestock({ cor: c.nome, tam: t })}
                                           title="Avise-me por WhatsApp quando repor"
                                           className="mx-auto inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:border-brand hover:text-brand"
                                         >
                                           <Bell className="h-3 w-3" />
                                           Avise-me
                                         </button>
                                       )}
                                     </td>
                                   );
                                return (
                                  <td key={t} className="p-2">
                                    <div className="flex flex-col items-center gap-1">
                                      {q === 0 ? (
                                        <button
                                          onClick={() => setQ(key, 1)}
                                          className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg border border-border transition-all hover:border-foreground hover:bg-foreground hover:text-background"
                                          aria-label="Adicionar"
                                        >
                                          <Plus className="h-3.5 w-3.5" />
                                        </button>
                                      ) : (
                                        <div className="mx-auto flex items-center justify-center gap-0.5 rounded-lg bg-foreground p-0.5 text-background">
                                          <button
                                            onClick={() => setQ(key, q - 1)}
                                            className="grid h-7 w-6 place-items-center rounded-md hover:bg-background/10"
                                          >
                                            <Minus className="h-3 w-3" />
                                          </button>
                                          <span className="w-5 text-center text-xs font-semibold tabular-nums">
                                            {q}
                                          </span>
                                          <button
                                            onClick={() => setQ(key, Math.min(livre, q + 1))}
                                            disabled={q >= livre}
                                            className="grid h-7 w-6 place-items-center rounded-md hover:bg-background/10 disabled:opacity-40"
                                          >
                                            <Plus className="h-3 w-3" />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-border bg-card p-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={personalizado}
                      onChange={(e) => setPersonalizado(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-foreground">Personalizar Produto</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Pedido mínimo de {MIN_PECAS_PERSONALIZACAO} peças da categoria
                        {categoriaAtual?.nome ? ` ${categoriaAtual.nome}` : ""} para produtos personalizados.
                      </span>
                    </span>
                  </label>
                  {personalizado && gruposPerso.length > 0 && (
                    <div className="mt-4 space-y-4 border-t border-border pt-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Onde personalizar?
                      </p>
                      {gruposPerso.map((g) => (
                        <div key={g.titulo} className="space-y-2">
                          <p className="text-xs font-semibold text-foreground">{g.titulo}</p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {g.opcoes.map((o) => (
                              <label
                                key={o.id}
                                className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2 text-sm transition-colors hover:border-primary/50"
                              >
                                <span className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={persoSel.includes(o.id)}
                                    onChange={() => togglePerso(o.id)}
                                    className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                                  />
                                  <span className="text-foreground">{o.label}</span>
                                </span>
                                <span className="text-xs font-semibold tabular-nums text-primary">
                                  + {brl(o.preco)}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                      {adicionalPerso > 0 && (
                        <p className="text-xs font-medium text-muted-foreground">
                          Acréscimo por peça: <span className="text-primary">{brl(adicionalPerso)}</span>
                        </p>
                      )}
                    </div>
                  )}
                  {personalizado && totalItens > 0 && totalItens < MIN_PECAS_PERSONALIZACAO && (
                    <p className="mt-3 rounded-lg bg-primary/10 p-2.5 text-[11px] font-medium text-primary">
                      Faltam {MIN_PECAS_PERSONALIZACAO - totalItens} peça(s) desta categoria para atingir o mínimo de personalização.
                    </p>
                  )}
                </div>

                <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur-md sm:p-4">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      {totalItens} pç{totalItens === 1 ? "" : "s"} · subtotal
                    </p>
                    <p className="font-display text-lg font-bold tabular-nums sm:text-xl">
                      {brl(subtotal)}
                    </p>
                  </div>
                  <button
                    onClick={addAoCarrinho}
                    disabled={totalItens === 0}
                    className="btn-shine inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
                  >
                    <ShoppingBag className="h-4 w-4" />
                    Adicionar
                  </button>
                </div>

                {/* Descrição mobile (visível apenas quando MD é falso) */}
                {p.descricao && (
                  <div className="mt-8 pt-8 border-t border-border md:hidden">
                    <h2 className="font-display font-bold text-lg mb-4 text-foreground">Descrição do Produto</h2>
                    <div className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                      {p.descricao}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
      <SiteFooter />
      <CartDrawer continueSearch={categoriaAtual ? { cat: categoriaAtual.slug } : undefined} />

      {restock && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-2xl border border-border bg-card p-5 shadow-xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-brand">
                  Notificação de reposição
                </p>
                <h2 className="mt-1 font-display text-lg font-semibold">
                  Avise-me quando repor
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {p?.nome} · Cor <strong>{restock.cor}</strong> · Tam. <strong>{restock.tam}</strong>
                </p>
              </div>
              <button
                onClick={() => setRestock(null)}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-accent"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Seu nome</label>
                <input
                  value={restockNome}
                  onChange={(e) => setRestockNome(e.target.value)}
                  maxLength={120}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
                  placeholder="Como podemos te chamar?"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">WhatsApp</label>
                <input
                  value={restockZap}
                  onChange={(e) => setRestockZap(e.target.value)}
                  inputMode="tel"
                  maxLength={40}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
                  placeholder="(81) 99999-9999"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Observação (opcional)</label>
                <textarea
                  value={restockObs}
                  onChange={(e) => setRestockObs(e.target.value)}
                  maxLength={500}
                  rows={2}
                  className="mt-1 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
                  placeholder="Ex: quero 5 peças assim que chegar"
                />
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setRestock(null)}
                className="flex-1 rounded-full border border-border px-4 py-2.5 text-sm font-medium hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                onClick={enviarSolicitacao}
                disabled={restockSending}
                className="flex-[2] rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-50"
              >
                {restockSending ? "Enviando…" : "Enviar solicitação"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>QR Code do Produto</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center space-y-4 py-6">
            <div className="overflow-hidden rounded-xl border border-border bg-white p-2">
              <img src={qrDataUrl} alt="QR Code" className="h-64 w-64" />
            </div>
            
            <div className="w-full space-y-2 text-center">
              <p className="text-sm text-muted-foreground">
                Aponte a câmera do celular para abrir este produto
              </p>
              
              <div className="mx-auto flex max-w-[280px] items-center gap-2 rounded-lg border border-border bg-muted/30 p-2">
                <code className="flex-1 truncate text-[10px] font-mono text-muted-foreground">
                  ID: {p.hash_id || p.id}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(p.hash_id || p.id);
                    toast.success("ID copiado!");
                  }}
                  className="rounded-md p-1.5 hover:bg-accent"
                  title="Copiar ID"
                >
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                const link = document.createElement("a");
                link.download = `qrcode-${p?.nome}.png`;
                link.href = qrDataUrl;
                link.click();
              }}
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-all hover:opacity-90"
            >
              <Download className="h-4 w-4" />
              Baixar QR Code
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
