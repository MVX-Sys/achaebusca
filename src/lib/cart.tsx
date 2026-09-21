import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type CartItem = {
  key: string; // variacaoId|cor|tamanho
  variacaoId: string;
  produtoId: string;
  codigo?: string | null;
  nome: string;
  cor: string;
  hexCor: string;
  tamanho: string;
  preco: number; // preço base (sem promoção)
  precoPromocional?: number | null; // preço promocional definido, se houver
  promocaoAte?: string | null; // ISO expiry
  quantidade: number;
  foto?: string | null;
  categoriaId?: string | null;
  categoriaNome?: string | null;
  personalizado?: boolean;
  personalizacoes?: { id: string; label: string; preco: number }[];
  estoque?: number | null;
};

// Limita a quantidade ao estoque conhecido da variação (quando informado)
export function maxQtd(i: Pick<CartItem, "estoque">): number {
  return typeof i.estoque === "number" && i.estoque >= 0 ? i.estoque : Infinity;
}

// Pedidos personalizados exigem no mínimo 10 peças da mesma categoria
export const MIN_PECAS_PERSONALIZACAO = 10;

export function validarPersonalizacao(items: CartItem[]): string | null {
  const categoriasPersonalizadas = new Map<string, string>();
  for (const i of items) {
    if (i.personalizado) {
      const cat = i.categoriaId || "sem-categoria";
      categoriasPersonalizadas.set(cat, i.categoriaNome || "esta categoria");
    }
  }
  for (const [catId, catNome] of categoriasPersonalizadas) {
    const totalCat = items
      .filter((i) => (i.categoriaId || "sem-categoria") === catId)
      .reduce((s, i) => s + i.quantidade, 0);
    if (totalCat < MIN_PECAS_PERSONALIZACAO) {
      return `Produtos personalizados exigem no mínimo ${MIN_PECAS_PERSONALIZACAO} peças de ${catNome}. Você tem ${totalCat}.`;
    }
  }
  return null;
}

export function itemAdicionalPersonalizacao(
  i: Pick<CartItem, "personalizacoes">,
): number {
  return (i.personalizacoes ?? []).reduce((s, o) => s + (o.preco || 0), 0);
}

export function formatPersonalizacoes(
  i: Pick<CartItem, "personalizado" | "personalizacoes">,
): string {
  const opts = i.personalizacoes ?? [];
  if (!opts.length) return i.personalizado ? "Personalizado" : "";
  return opts
    .map((o) => `${o.label} (+${o.preco.toFixed(2).replace(".", ",")})`)
    .join(", ");
}

export function itemPrecoBase(
  i: Pick<CartItem, "preco" | "personalizacoes">,
): number {
  return i.preco + itemAdicionalPersonalizacao(i);
}

export function itemPrecoEfetivo(
  i: Pick<CartItem, "preco" | "precoPromocional" | "promocaoAte" | "personalizacoes">,
): number {
  const extras = itemAdicionalPersonalizacao(i);
  const promo = i.precoPromocional;
  if (promo == null || promo < 0 || promo >= i.preco) return i.preco + extras;
  if (i.promocaoAte) {
    const ate = new Date(i.promocaoAte).getTime();
    if (!Number.isFinite(ate) || ate <= Date.now()) return i.preco + extras;
  }
  return promo + extras;
}

type CartCtx = {
  items: CartItem[];
  open: boolean;
  setOpen: (v: boolean) => void;
  add: (item: Omit<CartItem, "key" | "quantidade">, qty?: number) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  total: number;
  count: number;
};

const Ctx = createContext<CartCtx | null>(null);
const STORAGE_KEY = "achaebusca_cart_v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [, setTick] = useState(0);

  // Re-render periodicamente para expirar promoções em tempo real
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }, [items, hydrated]);

  const add: CartCtx["add"] = (item, qty = 1) => {
    const cartItem = item as CartItem;
    const perso = (cartItem.personalizacoes ?? []).map((o) => o.id).sort().join(",");
    const key = `${cartItem.variacaoId}|${item.cor}|${item.tamanho}${cartItem.personalizado ? `|perso:${perso}` : ""}`;
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.key === key);
      const limite = maxQtd(cartItem);
      const outros = prev
        .filter((x) => x.variacaoId === cartItem.variacaoId && x.key !== key)
        .reduce((s, x) => s + x.quantidade, 0);
      const atual = idx >= 0 ? prev[idx].quantidade : 0;
      const permitido = Math.max(0, Math.min(atual + qty, limite - outros));
      if (permitido <= 0) return prev;
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantidade: permitido, estoque: cartItem.estoque };
        return copy;
      }
      return [...prev, { ...cartItem, key, quantidade: permitido }];
    });
  };

  const setQty: CartCtx["setQty"] = (key, qty) => {
    setItems((prev) =>
      prev
        .map((x) => {
          if (x.key !== key) return x;
          const outros = prev
            .filter((o) => o.variacaoId === x.variacaoId && o.key !== key)
            .reduce((s, o) => s + o.quantidade, 0);
          const limite = maxQtd(x) - outros;
          return { ...x, quantidade: Math.max(0, Math.min(qty, limite)) };
        })
        .filter((x) => x.quantidade > 0),
    );
  };

  const remove: CartCtx["remove"] = (key) =>
    setItems((prev) => prev.filter((x) => x.key !== key));

  const clear = () => setItems([]);

  const total = items.reduce((s, i) => s + itemPrecoEfetivo(i) * i.quantidade, 0);
  const count = items.reduce((s, i) => s + i.quantidade, 0);

  return (
    <Ctx.Provider value={{ items, open, setOpen, add, setQty, remove, clear, total, count }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCart() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
