import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ShoppingBag, User, Search, LogOut } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { listCategorias } from "@/lib/products";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { hasAdminPanelAccess } from "@/lib/permissions";
import { BRAND } from "@/lib/config";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "@/components/theme-toggle";
import logoUrl from "@/assets/acha-busca-icon.png";

export function SiteHeader() {
  const { count, setOpen } = useCart();
  const { session, roleKind, permissions } = useAuth();
  const canSeePanel = hasAdminPanelAccess(roleKind, permissions);
  const { data: cats = [] } = useQuery({
    queryKey: ["categorias"],
    queryFn: listCategorias,
  });
  const [q, setQ] = useState("");
  const nav = useNavigate();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const currentSearch = useRouterState({ select: (r) => r.location.search }) as {
    cat?: string;
  };

  const doSearch = (e: React.FormEvent) => {
    e.preventDefault();
    nav({ to: "/produtos", search: { q } as never });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-primary text-primary-foreground shadow-[0_4px_20px_-8px_rgba(0,0,0,0.15)]">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2.5 sm:gap-4 sm:px-4 sm:py-3 md:gap-8">
        <Link to="/" className="group flex min-w-0 items-center gap-2">
          <img
            src={logoUrl}
            alt={BRAND}
            className="h-11 w-11 shrink-0 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.15)] transition-transform duration-300 group-hover:scale-105 sm:h-14 sm:w-14 md:h-16 md:w-16"
          />

          <div className="flex min-w-0 flex-col leading-none">
            <h1 className="truncate font-display text-lg font-extrabold tracking-tighter text-white sm:text-2xl md:text-3xl">
              acha<span className="mx-[1px] font-bold text-white/60">&amp;</span>busca
            </h1>
            <div className="mt-1 flex items-center gap-1.5 sm:mt-1.5 sm:gap-2">
              <span className="h-px w-4 bg-white/40 sm:w-5" />
              <span className="font-display text-[8px] font-bold uppercase tracking-[0.3em] text-white/90 sm:text-[10px] sm:tracking-[0.35em]">
                Atacado
              </span>
            </div>
          </div>
        </Link>


        <form
          onSubmit={doSearch}
          className="relative mx-auto hidden w-full max-w-xl flex-1 sm:block"
        >
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="O que você procura hoje?"
            className="w-full rounded-full border border-white/20 bg-white py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-white focus:ring-2 focus:ring-white/40"
          />
        </form>

        <div className="ml-auto flex shrink-0 items-center gap-0.5 text-sm sm:gap-2">
          {!session && (
            <Link
              to="/auth"
              className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-white hover:bg-white/15"
            >
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Entrar</span>
            </Link>
          )}
          {session && (
            <div className="flex items-center gap-1 sm:gap-2">
              <Link
                to="/perfil"
                className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-white hover:bg-white/15"
              >
                <User className="h-4 w-4" />
                <span className="hidden md:inline">Minha Conta</span>
              </Link>
              
              {canSeePanel && (
                <Link
                  to="/admin"
                  className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-white hover:bg-white/15"
                >
                  <span>Painel</span>
                </Link>
              )}

              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                }}
                className="rounded-full p-2 text-white/80 hover:bg-white/15 hover:text-white"
                aria-label="Sair"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
          <ThemeToggle />
          <button
            onClick={() => setOpen(true)}
            className="relative rounded-full p-2 text-white transition-colors hover:bg-white/15 sm:p-2.5"
            aria-label="Carrinho"
          >
            <ShoppingBag className="h-5 w-5" />
            {count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-[10px] font-bold text-primary">
                {count}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Mobile search row */}
      <form onSubmit={doSearch} className="border-t border-white/10 px-3 pb-2.5 pt-2 sm:hidden">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar produto…"
            className="w-full rounded-full border border-white/20 bg-white py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-white"
          />
        </div>
      </form>

      {cats.length > 0 && (
        <nav className="border-t border-white/10 bg-primary">
          <div className="mx-auto flex max-w-7xl justify-center px-3 sm:px-6">
            <div
              className="flex w-max max-w-full gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth py-3.5 text-sm sm:gap-8 sm:py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x" }}
            >
              <Link
                to="/produtos"
                search={{} as never}
                className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors sm:px-5 sm:text-xs sm:tracking-[0.18em] ${
                  currentPath === "/produtos" && !currentSearch?.cat && !currentSearch?.promo
                    ? "bg-white text-primary"
                    : "text-white/85 hover:bg-white/15 hover:text-white"
                }`}
              >
                Todos os produtos
              </Link>
              {cats.map((c) => {
                const active = currentSearch?.cat === c.slug;
                return (
                  <Link
                    key={c.id}
                    to="/produtos"
                    search={{ cat: c.slug } as never}
                    className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors sm:px-5 sm:text-xs sm:tracking-[0.18em] ${
                      active
                        ? "bg-white text-primary"
                        : "text-white/85 hover:bg-white/15 hover:text-white"
                    }`}
                  >
                    {c.nome}
                  </Link>
                );
              })}
              <Link
                to="/produtos"
                search={{ promo: true } as never}
                className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors sm:px-5 sm:text-xs sm:tracking-[0.18em] ${
                  currentSearch?.promo
                    ? "bg-white text-primary"
                    : "text-white/85 hover:bg-white/15 hover:text-white"
                }`}
              >
                Promoções
              </Link>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
