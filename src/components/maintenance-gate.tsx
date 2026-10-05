import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TriangleAlert, Wrench } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getManutencao, manutencaoEmAndamento } from "@/lib/manutencao";

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { roleKind, loading } = useAuth();
  const { pathname } = useLocation();
  const [now, setNow] = useState(() => Date.now());
  const { data } = useQuery({
    queryKey: ["manutencao"],
    queryFn: getManutencao,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const staff = roleKind === "admin" || roleKind === "funcionario";
  const livre = pathname.startsWith("/auth") || pathname.startsWith("/admin");
  const emManutencao = manutencaoEmAndamento(data ?? null, now);

  if (loading || staff || livre || !emManutencao) {
    return (
      <>
        {staff && emManutencao && !livre && (
          <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-amber-950">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            O site está em manutenção para os clientes. Você está vendo porque faz parte da equipe.
          </div>
        )}
        {children}
      </>
    );
  }

  const fim = data?.manutencao_fim ? new Date(data.manutencao_fim) : null;
  return (
    <div className="grid min-h-screen place-items-center bg-background px-6">
      <div className="max-w-md text-center">
        <Wrench className="mx-auto h-12 w-12 text-primary" />
        <h1 className="mt-6 font-display text-2xl font-bold">Site em manutenção</h1>
        <p className="mt-3 text-muted-foreground">
          {data?.manutencao_mensagem || "Estamos fazendo melhorias. Voltamos em breve!"}
        </p>
        {fim && (
          <p className="mt-4 text-sm text-muted-foreground">
            Previsão de retorno: {fim.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </p>
        )}
        <Link
          to="/auth"
          className="mt-8 inline-block text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Acesso da equipe
        </Link>
      </div>
    </div>
  );
}
