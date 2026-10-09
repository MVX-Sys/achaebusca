import { BRAND, WHATSAPP_DISPLAY, WHATSAPP_NUMBER } from "@/lib/config";
import { MessageCircle, Instagram } from "lucide-react";
import logoUrl from "@/assets/acha-busca-icon.png";

const MVX_INSTAGRAM = "https://www.instagram.com/mvx_sistemas/";
const MVX_WHATSAPP_1 = { display: "(87) 99168-6116", link: "5587991686116" };
const MVX_WHATSAPP_2 = { display: "(81) 99748-0691", link: "5581997480691" };

export function SiteFooter() {
  return (
    <footer className="mt-12 bg-primary text-primary-foreground sm:mt-16">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <img
              src={logoUrl}
              alt=""
              className="h-8 w-8 shrink-0 opacity-90"
            />
            <div className="min-w-0">
              <span className="font-display text-lg font-extrabold tracking-tight">
                acha&amp;busca
              </span>
              <p className="mt-0.5 text-xs text-white/80">
                Fabricação própria · Envio para todo o Brasil · Mínimo 10 peças
              </p>
            </div>
          </div>

          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-bold hover:opacity-90"
          >
            <MessageCircle className="h-4 w-4" />
            {WHATSAPP_DISPLAY}
          </a>
        </div>
      </div>

      <div className="border-t border-white/15">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-3 text-[11px] text-white/75 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {BRAND}. Todos os direitos reservados.</p>

          <div className="flex flex-col sm:items-end">
            <span>Desenvolvido pela MVX Sistemas</span>
            <a
              href={MVX_INSTAGRAM}
              target="_blank"
              rel="noreferrer"
              aria-label="Instagram MVX Sistemas"
              className="inline-flex items-center gap-1 hover:text-white"
            >
              <Instagram className="h-3 w-3" />
              @mvx_sistemas
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
