import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getImageUrl, downloadOrderImagesZip } from "@/lib/storage";
import { useCart, itemPrecoEfetivo, validarPersonalizacao, formatPersonalizacoes } from "@/lib/cart";
import { brl } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { BRAND, VALOR_MINIMO_COMPRA } from "@/lib/config";
import { ChevronLeft, MessageCircle, FileText, X, User, Ticket, Loader2, ShoppingBag, Phone } from "lucide-react";
import { downloadOrderPDF } from "@/lib/pdf";
import { toast } from "sonner";
import { createOrder } from "@/lib/orders.functions";
import { listAtendentes } from "@/lib/atendentes.functions";
import { validateCupon } from "@/lib/coupons.functions";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Atendente = { id: string; nome: string; whatsapp: string; foto_path: string | null; cargo?: string };

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: `Finalizar pedido — ${BRAND}` },
      {
        name: "description",
        content: `Preencha seus dados para finalizar o pedido pelo WhatsApp na ${BRAND}.`,
      },
    ],
  }),
  component: CheckoutPage,
});

type FormaEnvio = "ENTREGA" | "RETIRADA";
type FormaEntrega = "TRANSPORTADORA A COMBINAR";
type FormaPagamento = "PIX";

function CheckoutPage() {
  const { items, total, clear } = useCart();
  const nav = useNavigate();
  const { session } = useAuth();

  const [formaEnvio, setFormaEnvio] = useState<FormaEnvio>("ENTREGA");
  const [formaPagamento] = useState<FormaPagamento>("PIX");
  const [observacoes, setObservacoes] = useState("");
  const [showAtendentes, setShowAtendentes] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
  const [whatsapp, setWhatsapp] = useState(
    () => (session?.user?.user_metadata?.whatsapp as string) || "",
  );

  const { discountAmount, itemsWithDiscount } = useMemo(() => {
    if (!appliedCoupon) return { discountAmount: 0, itemsWithDiscount: new Set<string>() };

    let totalEligible = 0;
    const eligibleItemKeys = new Set<string>();

    const allowedProductIds = (appliedCoupon.produtos_ids as string[])?.map((id: string) => id.toLowerCase()) || [];
    const allowedCategoryIds = (appliedCoupon.categorias_ids as string[])?.map((id: string) => id.toLowerCase()) || [];

    items.forEach(item => {
      const pId = item.produtoId.toLowerCase();
      const cId = (item.categoriaId || "").toLowerCase();

      const isProductAllowed = allowedProductIds.length === 0 ||
        allowedProductIds.includes(pId);

      const isCategoryAllowed = allowedCategoryIds.length === 0 ||
        (!!cId && allowedCategoryIds.includes(cId));

      if (isProductAllowed && isCategoryAllowed) {
        totalEligible += itemPrecoEfetivo(item) * item.quantidade;
        eligibleItemKeys.add(item.key);
      }
    });


    if (totalEligible === 0) return { discountAmount: 0, itemsWithDiscount: new Set<string>() };

    let discount = 0;
    if (appliedCoupon.tipo_desconto === "fixo") {
      discount = appliedCoupon.valor_desconto;
    } else {
      discount = (totalEligible * appliedCoupon.valor_desconto) / 100;
    }

    return { discountAmount: discount, itemsWithDiscount: eligibleItemKeys };
  }, [items, appliedCoupon]);

  const valorFinal = total - discountAmount;
  const minAtingido = useMemo(
    () => VALOR_MINIMO_COMPRA <= 0 || total >= VALOR_MINIMO_COMPRA,
    [total],
  );

  const finalizar = () => {
    if (items.length === 0) {
      toast.error("Seu carrinho está vazio.");
      return;
    }
    if (!minAtingido) {
      toast.error(`Valor mínimo para compra: ${brl(VALOR_MINIMO_COMPRA)}`);
      return;
    }
    const wppDigits = whatsapp.replace(/\D/g, "");
    if (wppDigits.length < 10 || wppDigits.length > 13) {
      toast.error("Informe seu WhatsApp com DDD (ex.: 31 99999-9999).");
      return;
    }
    const erroPerso = validarPersonalizacao(items as any);
    if (erroPerso) {
      toast.error(erroPerso);
      return;
    }
    setShowAtendentes(true);
  };

  const fnCreateOrder = useServerFn(createOrder);
  const fetchAtendentes = useServerFn(listAtendentes);
  const fnValidateCoupon = useServerFn(validateCupon);

  const { data: dbAtendentes, isLoading: loadingAtendentes } = useQuery({
    queryKey: ["atendentes"],
    queryFn: () => fetchAtendentes(),
  });

  const atendentes = dbAtendentes || [];

  const [enviando, setEnviando] = useState(false);

  const enviarParaAtendente = async (atendente: Atendente) => {
    if (enviando) return;
    setEnviando(true);
    try {
      if (!session) {
        toast.error("Você precisa estar logado para finalizar o pedido.");
        nav({ to: "/auth" });
        return;
      }

      await fnCreateOrder({
        data: {
          total: valorFinal,
          forma_envio: formaEnvio,
          atendente_id: atendente.id,
          cliente_nome: session?.user.user_metadata?.nome || session?.user.email?.split("@")[0] || "Cliente",
          cliente_whatsapp: whatsapp.replace(/\D/g, ""),
          forma_pagamento: formaPagamento,
          observacoes: observacoes,
          cupom_codigo: appliedCoupon?.codigo,
          desconto_cupom: discountAmount,
          endereco: formaEnvio === "ENTREGA" ? {
            formaEntrega: "TRANSPORTADORA A COMBINAR"
          } : undefined,
          itens: items.map(i => {
            const vId = i.variacaoId || (i as any).variacao_id;
            return {
              produto_id: i.produtoId,
              variacao_id: vId,
              quantidade: i.quantidade,
              preco_unitario: itemPrecoEfetivo(i),
              nome: i.nome,
              cor: i.cor,
              tamanho: i.tamanho,
              personalizacoes: (i.personalizacoes ?? []).map((o) => o.id)
            };
          })

        }
      });

      // Salva o WhatsApp na conta para os próximos pedidos sairem preenchidos.
      supabase.auth.updateUser({ data: { whatsapp: whatsapp.replace(/\D/g, "") } }).catch(() => {});

      const DIV = "━━━━━━━━━━━━━━━";

      const linhas = items.flatMap((i, idx) => {
        const perso = formatPersonalizacoes(i);
        const preco = itemPrecoEfetivo(i);
        const codigo = (i as any).codigo ? ` (${(i as any).codigo})` : "";
        return [
          `*${idx + 1}. ${i.nome}*${codigo}`,
          `   • Cor: ${i.cor}`,
          `   • Tamanho: ${i.tamanho}`,
          ...(perso ? [`   • Personalização: ${perso}`] : []),
          `   • Quantidade: ${i.quantidade}x ${brl(preco)}`,
          `   • Subtotal: ${brl(preco * i.quantidade)}`,
          "",
        ];
      });

      const totalPecas = items.reduce((s, i) => s + i.quantidade, 0);

      const msgContent = [
        `Olá, ${atendente.nome}! Gostaria de fazer o seguinte pedido:`,
        "",
        DIV,
        `*🛍️ ITENS DO PEDIDO* (${items.length})`,
        DIV,
        "",
        ...linhas,
        DIV,
        "*💰 RESUMO*",
        DIV,
        `Total de peças: ${totalPecas}`,
        appliedCoupon ? `Cupom aplicado: ${appliedCoupon.codigo}` : "",
        appliedCoupon ? `Desconto: -${brl(discountAmount)}` : "",
        `*Total final: ${brl(valorFinal)}*`,
        "",
        DIV,
        "*🚚 ENTREGA E PAGAMENTO*",
        DIV,
        `Forma de envio: ${formaEnvio === "ENTREGA" ? "Entrega (transportadora a combinar)" : "Retirada no local"}`,
        `Forma de pagamento: ${formaPagamento}`,
        observacoes ? "" : "",
        observacoes ? DIV : "",
        observacoes ? "*📝 OBSERVAÇÕES*" : "",
        observacoes ? DIV : "",
        observacoes ? observacoes : "",
      ]
        .filter((l) => l !== "" || true)
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      const encodedMsg = encodeURIComponent(msgContent);
      const whatsappUrl = `https://wa.me/${atendente.whatsapp.replace(/\D/g, "")}?text=${encodedMsg}`;

      // Downloads (PDF/zip) só no desktop e sem bloquear o redirecionamento
      const isMobile =
        typeof navigator !== "undefined" &&
        /android|iphone|ipad|ipod/i.test(navigator.userAgent);
      if (!isMobile) {
        try {
          await downloadOrderPDF({
            items,
            total: valorFinal,
            formaEnvio,
            formaEntrega: formaEnvio === "ENTREGA" ? "TRANSPORTADORA A COMBINAR" : undefined,
            formaPagamento,
            endereco: formaEnvio === "ENTREGA" ? {} : undefined,
            observacoes,
            cliente: {
              nome: (session?.user?.user_metadata?.nome as string) || session?.user?.email?.split("@")[0] || "",
              email: session?.user?.email || "",
              whatsapp,
            },
            cupom: appliedCoupon
              ? { codigo: appliedCoupon.codigo, desconto: discountAmount }
              : undefined,
          }, true);

          await downloadOrderImagesZip(items, "imagens-pedido");
        } catch (e) {
          console.error("Erro ao gerar anexos do pedido:", e);
        }
      }

      toast.success(`Pedido salvo! Redirecionando para o WhatsApp…`);
      setShowAtendentes(false);
      clear();
      window.location.href = whatsappUrl;
    } catch (err: any) {
      console.error("Erro ao salvar pedido:", err);
      const errorMsg = err?.message || (typeof err === 'string' ? err : "");
      toast.error(`Erro ao processar pedido: ${errorMsg || "Tente novamente."}`);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 pb-44 pt-6 lg:pb-12 lg:pt-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Continuar comprando
        </Link>

        <div className="mt-3 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight lg:text-3xl">
              Finalizar pedido
            </h1>
            <p className="mt-1 text-xs text-muted-foreground lg:text-sm">
              Preencha os dados e finalize pelo WhatsApp.
            </p>
          </div>
          <span className="hidden shrink-0 rounded-md bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-primary lg:block">
            Atacado
          </span>
        </div>

        <div className="mt-5 space-y-2.5">
          <div className="flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary/5 px-3.5 py-3">
            <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">Este pedido ainda não é uma compra confirmada.</span>{" "}
              Ao finalizar, você fala com um atendente no WhatsApp — valores, frete e pagamento são confirmados por lá antes de qualquer cobrança.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
              <span className="text-muted-foreground">Pedido mínimo</span>
              <span className={minAtingido ? "text-success" : "text-primary"}>
                {brl(VALOR_MINIMO_COMPRA)}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border">
              <div
                className={`h-full rounded-full transition-all ${minAtingido ? "bg-success" : "bg-primary"}`}
                style={{ width: `${VALOR_MINIMO_COMPRA > 0 ? Math.min(100, (total / VALOR_MINIMO_COMPRA) * 100) : 100}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {minAtingido ? (
                <>Pedido mínimo atingido — pode finalizar.</>
              ) : (
                <>Faltam <span className="font-bold text-foreground">{brl(VALOR_MINIMO_COMPRA - total)}</span> para atingir o mínimo.</>
              )}
            </p>
          </div>
        </div>

        <section className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Itens — compactos no mobile */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-bold uppercase tracking-widest">
                Itens do pedido ({items.length})
              </h2>
              <Link
                to="/produtos"
                className="text-[10px] font-bold uppercase tracking-tight text-primary underline underline-offset-2"
              >
                Editar
              </Link>
            </div>
            <div className="mt-3 max-h-[26rem] space-y-2 overflow-y-auto pr-1">
              {items.map((item) => (
                <CheckoutItemRow key={item.key} item={item} itemsWithDiscount={itemsWithDiscount} appliedCoupon={appliedCoupon} items={items} />
              ))}
              {items.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Seu carrinho está vazio.
                </div>
              )}
            </div>
          </div>

          {/* Resumo */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-3 lg:p-6">
            <h2 className="text-[11px] font-bold uppercase tracking-widest">Resumo do pedido</h2>

            <div className="mt-4 space-y-4">
              <Field label="Seu WhatsApp:" required>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="31 99999-9999"
                    className="input pl-11"
                  />
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Forma de Envio:" required>
                  <div className="flex rounded-xl border border-border bg-background p-1">
                    {(["ENTREGA", "RETIRADA"] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFormaEnvio(f)}
                        className={`flex-1 rounded-lg py-2 text-[9px] font-bold uppercase tracking-wider transition-colors ${
                          formaEnvio === f
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {f === "ENTREGA" ? "Entrega" : "Retirada"}
                      </button>
                    ))}
                  </div>
                  {formaEnvio === "ENTREGA" && (
                    <p className="mt-1.5 text-[9px] leading-snug text-muted-foreground">
                      Transportadora a combinar
                    </p>
                  )}
                </Field>

                <Field label="Forma de Pagamento:">
                  <div className="flex h-[42px] items-center justify-center gap-2 rounded-xl border border-success/25 bg-success/10">
                    <span className="text-xs font-black uppercase tracking-wider text-success">PIX</span>
                    <span className="rounded bg-success px-1.5 py-0.5 text-[7px] font-black uppercase leading-none text-background">
                      Única forma
                    </span>
                  </div>
                </Field>
              </div>

              <Field label="Cupom de Desconto:">
                <div className="relative">
                  <Ticket className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="DIGITE O CÓDIGO"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    disabled={!!appliedCoupon || isValidatingCoupon}
                    className="input pl-10 pr-24 font-mono text-xs uppercase"
                  />
                  {appliedCoupon ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAppliedCoupon(null);
                        setCouponCode("");
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-destructive/10 px-3 py-1.5 text-[10px] font-bold text-destructive transition-colors hover:bg-destructive/20"
                    >
                      Remover
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!couponCode || isValidatingCoupon}
                      onClick={async () => {
                        setIsValidatingCoupon(true);
                        try {
                          const res = await fnValidateCoupon({ data: { codigo: couponCode } });
                          if (res.valid && res.cupom) {
                            if (res.cupom.preco_minimo_pedido && total < res.cupom.preco_minimo_pedido) {
                              toast.error(`Pedido mínimo: ${brl(res.cupom.preco_minimo_pedido)}`);
                              return;
                            }
                            const totalItens = items.reduce((s, i) => s + i.quantidade, 0);
                            if (totalItens < res.cupom.quantidade_minima_itens) {
                              toast.error(`Mínimo de ${res.cupom.quantidade_minima_itens} itens.`);
                              return;
                            }

                            const allowedIds = (res.cupom.produtos_ids || []).map((id: string) => id.toLowerCase());
                            const allowedCats = (res.cupom.categorias_ids || []).map((id: string) => id.toLowerCase());
                            if (allowedIds.length > 0 || allowedCats.length > 0) {
                              const hasAllowed = items.some(item => {
                                const okP = allowedIds.length === 0 || allowedIds.includes(item.produtoId.toLowerCase());
                                const okC = allowedCats.length === 0 || allowedCats.includes((item.categoriaId || "").toLowerCase());
                                return okP && okC;
                              });
                              if (!hasAllowed) {
                                toast.error("Cupom não aplicável a estes produtos.");
                                return;
                              }
                            }

                            setAppliedCoupon(res.cupom);
                            toast.success("Cupom aplicado!");
                          } else {
                            toast.error(res.message || "Inválido.");
                          }
                        } catch (err) {
                          toast.error("Erro ao validar.");
                        } finally {
                          setIsValidatingCoupon(false);
                        }
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-primary px-3.5 py-1.5 text-[10px] font-bold text-primary-foreground shadow-sm transition-all hover:opacity-90 disabled:opacity-40"
                    >
                      {isValidatingCoupon ? <Loader2 className="h-4 w-4 animate-spin" /> : "APLICAR"}
                    </button>
                  )}
                </div>
              </Field>

              <Field label="Observações:">
                <textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Ex: Entrega no período da tarde"
                  className="input min-h-[72px] resize-none text-xs"
                />
              </Field>
            </div>

            <div className="mt-5 space-y-2 border-t border-border pt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{brl(total)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Desconto cupom</span>
                <span className={discountAmount > 0 ? "font-bold text-success" : "text-muted-foreground"}>
                  {discountAmount > 0 ? `- ${brl(discountAmount)}` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Desconto base</span>
                <span className="text-muted-foreground">
                  {brl(items.reduce((acc, i) => acc + (i.preco - itemPrecoEfetivo(i)) * i.quantidade, 0))}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="font-display text-sm font-semibold">Valor Total</span>
                <span className="font-display text-xl font-black text-primary">{brl(valorFinal)}</span>
              </div>
            </div>

            <div className="mt-6 hidden flex-col gap-2 lg:flex">
              <button
                type="button"
                onClick={finalizar}
                disabled={items.length === 0 || !minAtingido}
                className="btn-shine inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:opacity-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <MessageCircle className="h-5 w-5" />
                Finalizar no WhatsApp
              </button>
              <button
                type="button"
                onClick={baixarPDF}
                disabled={items.length === 0}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background py-3 text-xs font-semibold transition-colors hover:bg-accent disabled:opacity-40"
              >
                <FileText className="h-4 w-4" />
                Baixar Resumo em PDF
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Barra fixa de finalização — mobile */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pt-3 backdrop-blur lg:hidden"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total do pedido</span>
            <span className="font-display text-xl font-black text-primary">{brl(valorFinal)}</span>
          </div>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={finalizar}
              disabled={items.length === 0 || !minAtingido}
              className="btn-shine inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <MessageCircle className="h-4 w-4" />
              Finalizar no WhatsApp
            </button>
            <button
              type="button"
              aria-label="Baixar Resumo em PDF"
              onClick={baixarPDF}
              disabled={items.length === 0}
              className="inline-flex w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              <FileText className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <SiteFooter />

      {showAtendentes && (
        <div
          role="dialog"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setShowAtendentes(false)}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-premium"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowAtendentes(false)}
              className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent"
            >
              <X className="h-4 w-4" />
            </button>
            <h2 className="font-display text-xl font-semibold tracking-tight">Escolha um atendente</h2>
            <p className="mt-1 text-sm text-muted-foreground">Toque no atendente para finalizar no WhatsApp.</p>

            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {atendentes.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  disabled={enviando}
                  onClick={() => enviarParaAtendente(a as any)}
                  className="group flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-all hover:border-primary/50 disabled:opacity-60"
                >
                  <AtendenteAvatar path={a.foto_path} nome={a.nome} />
                  <div className="text-center">
                    <p className="font-display text-xs font-semibold">{a.nome}</p>
                    <p className="text-[9px] text-muted-foreground uppercase">{a.cargo || "Vendedor"}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, required, className = "", children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-bold text-foreground uppercase tracking-tight">
        {label}{required && <span className="ml-0.5 text-destructive">*</span>}
      </span>
      {children}
    </label>
  );
}

function ReadonlyInput({ value, strong }: { value: string; strong?: boolean }) {
  return (
    <input
      readOnly
      value={value}
      className={`input cursor-default bg-muted/50 text-xs py-2 h-9 ${strong ? "font-bold text-primary" : ""}`}
    />
  );
}

function CheckoutItemRow({ item, itemsWithDiscount, appliedCoupon, items }: { item: any, itemsWithDiscount: Set<string>, appliedCoupon: any, items: any[] }) {
  const [img, setImg] = useState<string>("");
  const isDiscounted = itemsWithDiscount.has(item.key);

  useEffect(() => {
    if (item.foto && item.foto.includes("/")) {
      getImageUrl(item.foto, { width: 150 }).then(setImg);
    } else if (item.foto) {
      setImg(item.foto);
    }
  }, [item.foto]);

  return (
    <div 
      className={`flex gap-3 rounded-xl border p-3 transition-colors ${
        isDiscounted 
          ? 'border-primary/50 bg-primary/5 shadow-sm ring-1 ring-primary/10' 
          : 'border-border bg-muted/30 hover:bg-muted/50'
      }`}
    >
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-white flex items-center justify-center p-0.5">
        {img ? (
          <img
            src={img}
            alt={item.nome}
            className="h-full w-full object-contain"
          />
        ) : (
          <ShoppingBag className="h-6 w-6 text-muted-foreground/20" />
        )}
        {isDiscounted && (
          <div className="absolute -top-1 -right-1 rounded-full bg-primary p-1 shadow-sm">
            <Ticket className="h-2.5 w-2.5 text-white" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-center min-w-0">
        <h3 className="text-xs font-bold text-foreground line-clamp-1">{item.nome}</h3>
        <p className="mt-0.5 text-[10px] text-muted-foreground uppercase tracking-wider">
          {item.cor} • {item.tamanho}
        </p>
        {item.personalizado && (
          <span className="mt-1 w-fit rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
            Personalizado
          </span>
        )}
        {(item.personalizacoes?.length ?? 0) > 0 && (
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {formatPersonalizacoes(item)}
          </p>
        )}
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[10px] font-medium text-muted-foreground">{item.quantidade}x</span>
          <div className="flex flex-col items-end">
            <div className="flex flex-col items-end gap-0.5">
              {isDiscounted && (
                <span className="text-[10px] text-muted-foreground line-through decoration-muted-foreground/50">
                  {brl(itemPrecoEfetivo(item) * item.quantidade)}
                </span>
              )}
              <span className={`text-xs font-bold ${isDiscounted ? 'text-primary' : 'text-foreground'}`}>
                {brl((isDiscounted ? (appliedCoupon?.tipo_desconto === 'fixo' ? (itemPrecoEfetivo(item) * item.quantidade - (appliedCoupon.valor_desconto / items.filter((it: any) => itemsWithDiscount.has(it.key)).length)) : (itemPrecoEfetivo(item) * item.quantidade * (1 - appliedCoupon.valor_desconto / 100))) : itemPrecoEfetivo(item) * item.quantidade))}
              </span>
            </div>
            {isDiscounted && (
              <span className="text-[8px] font-bold text-primary uppercase tracking-tighter">Cupom aplicado</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AtendenteAvatar({ path, nome }: { path?: string | null; nome: string }) {
  const [url, setUrl] = useState<string>("");

  useEffect(() => {
    let alive = true;
    if (!path) {
      setUrl("");
      return;
    }
    supabase.storage
      .from("atendentes-v1-private")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (alive && data?.signedUrl) setUrl(data.signedUrl);
      });
    return () => {
      alive = false;
    };
  }, [path]);

  return (
    <div className="relative h-16 w-16 overflow-hidden rounded-full border-2 border-border group-hover:border-primary/30">
      {url ? (
        <img src={url} alt={nome} className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center bg-primary/10 text-primary">
          <User className="h-8 w-8" />
        </div>
      )}
    </div>
  );
}
