import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { GestaoClickPanel } from "@/components/gestaoclick-panel";
import { GestaoClickConferencia } from "@/components/gestaoclick-conferencia";

export const Route = createFileRoute("/_authenticated/admin/gestaoclick")({
  head: () => ({ meta: [{ title: "Gestão Click — Painel" }] }),
  component: GestaoClickPage,
});

function GestaoClickPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <RefreshCw className="h-6 w-6 text-primary" />
        <h1 className="font-display text-2xl font-semibold">Gestão Click</h1>
      </div>
      <GestaoClickPanel />
      <GestaoClickConferencia />
    </div>
  );
}
