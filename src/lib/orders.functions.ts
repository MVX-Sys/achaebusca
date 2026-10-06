import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { parsePersonalizacoes } from "@/lib/personalizacao";

function precoPromocionalValido(
  preco: number,
  promo: number | null,
  ate: string | null,
): number {
  if (promo == null || promo < 0 || promo >= preco) return preco;
  if (ate) {
    const t = new Date(ate).getTime();
    if (!Number.isFinite(t) || t <= Date.now()) return preco;
  }
  return promo;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      itens: z.array(
        z.object({
          produto_id: z.string(),
          variacao_id: z.string(),
          quantidade: z.number().int().positive(),
          preco_unitario: z.number(),
          nome: z.string(),
          cor: z.string(),
          tamanho: z.string(),
          personalizacoes: z.array(z.string()).optional(),
        })
      ),
      total: z.number(),
      forma_envio: z.string(),
      forma_pagamento: z.string(),
      endereco: z.any().optional(),
      observacoes: z.string().optional(),
      atendente_id: z.string().optional(),
      cliente_nome: z.string().optional(),
      cliente_whatsapp: z.string().optional(),
      cupom_codigo: z.string().optional(),
      desconto_cupom: z.number().optional(),
    })

  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    if (data.itens.length === 0) throw new Error("Carrinho vazio.");

    // 1. Recalcular preços no servidor (nunca confiar no navegador)
    const variacaoIds = data.itens.map((i) => i.variacao_id);
    const { data: variacoes, error: varErr } = await supabase
      .from("variacoes_produto")
      .select(
        "id, produto_id, nome_cor, tamanho, quantidade_estoque, produtos(id, nome, ativo, preco, preco_promocional, promocao_ate, categoria_id, personalizacoes)",
      )
      .in("id", variacaoIds);

    if (varErr) throw new Error("Não foi possível validar os itens do pedido.");

    const porId = new Map<string, any>((variacoes || []).map((v: any) => [v.id, v]));

    let subtotal = 0;
    const itensCalculados = data.itens.map((item) => {
      const v = porId.get(item.variacao_id);
      if (!v) throw new Error(`Produto indisponível: ${item.nome}`);
      const p = v.produtos;
      if (!p || p.ativo === false) throw new Error(`Produto indisponível: ${item.nome}`);
      if (v.quantidade_estoque < item.quantidade) {
        throw new Error(
          `Estoque insuficiente para ${p.nome} (${v.nome_cor}, ${v.tamanho}). Disponível: ${v.quantidade_estoque}`,
        );
      }

      const base = precoPromocionalValido(
        Number(p.preco),
        p.preco_promocional == null ? null : Number(p.preco_promocional),
        p.promocao_ate ?? null,
      );
      const opcoes = parsePersonalizacoes(p.personalizacoes);
      const precos = new Map(opcoes.map((o) => [o.id, o.preco]));
      const extras = (item.personalizacoes ?? []).reduce(
        (s, id) => s + (precos.get(id) ?? 0),
        0,
      );
      const preco_unitario = round2(base + extras);
      subtotal += preco_unitario * item.quantidade;

      const personalizacoesEscolhidas = (item.personalizacoes ?? [])
        .map((id) => opcoes.find((o) => o.id === id))
        .filter((o): o is NonNullable<typeof o> => !!o)
        .map((o) => ({ id: o.id, label: o.label, preco: o.preco }));

      return {
        ...item,
        preco_unitario,
        categoria_id: p.categoria_id as string | null,
        nome: p.nome as string,
        cor: v.nome_cor as string,
        tamanho: v.tamanho as string,
        personalizacoesDetalhes: personalizacoesEscolhidas,
      };
    });
    subtotal = round2(subtotal);

    // 2. Revalidar o cupom e recalcular o desconto no servidor
    let descontoCupom = 0;
    let cupomCodigo: string | null = null;
    if (data.cupom_codigo) {
      const { data: cupom } = await supabase
        .from("cupons")
        .select("*")
        .eq("codigo", data.cupom_codigo.toUpperCase())
        .eq("ativo", true)
        .maybeSingle();

      const valido =
        !!cupom && (!cupom.validade || new Date(cupom.validade).getTime() > Date.now());

      if (valido && cupom) {
        const totalItens = itensCalculados.reduce((s, i) => s + i.quantidade, 0);
        const produtosOk = (cupom.produtos_ids ?? []).map((x: string) => x.toLowerCase());
        const categoriasOk = (cupom.categorias_ids ?? []).map((x: string) => x.toLowerCase());

        const elegiveis = itensCalculados.filter((i) => {
          const okProduto =
            produtosOk.length === 0 || produtosOk.includes(i.produto_id.toLowerCase());
          const okCategoria =
            categoriasOk.length === 0 ||
            (i.categoria_id ? categoriasOk.includes(i.categoria_id.toLowerCase()) : false);
          return okProduto && okCategoria;
        });
        const totalElegivel = round2(
          elegiveis.reduce((s, i) => s + i.preco_unitario * i.quantidade, 0),
        );

        const atendeMinimos =
          totalItens >= (cupom.quantidade_minima_itens ?? 0) &&
          subtotal >= Number(cupom.preco_minimo_pedido ?? 0);

        if (atendeMinimos && totalElegivel > 0) {
          descontoCupom =
            cupom.tipo_desconto === "fixo"
              ? Math.min(Number(cupom.valor_desconto), totalElegivel)
              : round2((totalElegivel * Number(cupom.valor_desconto)) / 100);
          cupomCodigo = cupom.codigo;
        }
      }
    }

    const totalFinal = round2(Math.max(0, subtotal - descontoCupom));

    // 3. Baixa de estoque atômica (evita venda dupla da última peça)
    const baixados: { id: string; qtd: number }[] = [];
    const devolver = async () => {
      for (const b of baixados) {
        await supabase.rpc("decrement_stock", { var_id: b.id, amount: -b.qtd });
      }
    };

    for (const item of itensCalculados) {
      const { error: stockErr } = await supabase.rpc("decrement_stock", {
        var_id: item.variacao_id,
        amount: item.quantidade,
      });
      if (stockErr) {
        await devolver();
        throw new Error(
          `Estoque insuficiente para ${item.nome} (${item.cor}, ${item.tamanho}).`,
        );
      }
      baixados.push({ id: item.variacao_id, qtd: item.quantidade });
    }

    // 4. Criar o pedido
    const { data: order, error: orderErr } = await supabase
      .from("pedidos")
      .insert({
        user_id: userId,
        total: totalFinal,
        status: "pendente",
        forma_envio: data.forma_envio,
        forma_pagamento: data.forma_pagamento,
        endereco: data.endereco,
        observacoes: data.observacoes,
        atendente_id: data.atendente_id as any,
        cliente_nome: data.cliente_nome as any,
        cliente_whatsapp: data.cliente_whatsapp as any,
        cupom_codigo: cupomCodigo as any,
        desconto_cupom: descontoCupom as any,
      })
      .select()
      .single();

    if (orderErr) {
      await devolver();
      throw orderErr;
    }

    const orderItems = itensCalculados.map((item) => ({
      pedido_id: order.id,
      produto_id: item.produto_id,
      variacao_id: item.variacao_id,
      quantidade: item.quantidade,
      preco_unitario: item.preco_unitario,
      detalhes: {
        cor: item.cor,
        tamanho: item.tamanho,
        nome: item.nome,
        personalizacoes: item.personalizacoesDetalhes,
      },
    }));

    const { error: itemsErr } = await supabase.from("pedidos_itens").insert(orderItems);
    if (itemsErr) {
      await supabase.from("pedidos").delete().eq("id", order.id);
      await devolver();
      throw itemsErr;
    }

    return { ...order, total: totalFinal, desconto_cupom: descontoCupom };
  });

export const listUserOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("pedidos")
      .select(`
        *,
        itens:pedidos_itens(*)
      `)
      .eq("user_id", userId)
      .order("criado_em", { ascending: false });

    if (error) throw error;

    // Aumentar os itens com URLs de imagem assinadas
    const results = await Promise.all((data || []).map(async (pedido) => {
      const itensWithImages = await Promise.all((pedido.itens || []).map(async (item: any) => {
        let imagemUrl = null;
        if (item.produto_id) {
          const { data: imgData } = await supabase
            .from("imagens_produto")
            .select("storage_path")
            .eq("produto_id", item.produto_id)
            .eq("principal", true)
            .maybeSingle();
          
          if (imgData?.storage_path) {
            const { data: signed } = await supabase.storage
              .from("product-images")
              .createSignedUrl(imgData.storage_path, 3600);
            imagemUrl = signed?.signedUrl;
          }
        }
        return { ...item, imagem_url: imagemUrl };
      }));
      return { ...pedido, itens: itensWithImages };
    }));

    return results;
  });
