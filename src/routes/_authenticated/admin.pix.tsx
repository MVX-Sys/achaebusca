import { createFileRoute } from "@tanstack/react-router";
import { QrCode, Wrench } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin/pix")({
  head: () => ({ meta: [{ title: "PIX — Painel" }] }),
  component: PixPage,
});

function PixPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary">
          <QrCode className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-xl font-semibold">PIX</h1>
          <p className="text-sm text-muted-foreground">
            Configurações de pagamento via PIX.
          </p>
        </div>
        <Badge variant="secondary" className="ml-auto">
          Em breve
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            Em construção
          </CardTitle>
          <CardDescription>
            Esta aba ainda não faz nada. Ela foi reservada para receber as
            futuras configurações de PIX, como chave, nome do recebedor e
            geração de cobranças.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Nada em produtos, pedidos ou no checkout foi alterado.
        </CardContent>
      </Card>
    </div>
  );
}
