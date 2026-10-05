import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { validarSenha } from "@/lib/password";
import { BRAND } from "@/lib/config";

export const Route = createFileRoute("/recuperar-senha")({
  head: () => ({
    meta: [
      { title: `Recuperar senha — ${BRAND}` },
      { name: "description", content: "Receba um código por e-mail e crie uma nova senha." },
      { property: "og:title", content: `Recuperar senha — ${BRAND}` },
      { property: "og:description", content: "Receba um código por e-mail e crie uma nova senha." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecuperarSenha,
});

const VALIDADE_MS = 10 * 60 * 1000;
const input =
  "w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm outline-none transition-colors focus:border-foreground";

function RecuperarSenha() {
  const nav = useNavigate();
  const [etapa, setEtapa] = useState<"email" | "codigo" | "senha">("email");
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [enviadoEm, setEnviadoEm] = useState(0);
  const [agora, setAgora] = useState(Date.now());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const restante = Math.max(0, enviadoEm + VALIDADE_MS - agora);
  const expirado = etapa === "codigo" && restante === 0;
  const check = validarSenha(senha, { email });

  async function enviar() {
    const e = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) return toast.error("Digite um e-mail válido.");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(e);
    setLoading(false);
    if (error) return toast.error(error.message.includes("rate") ? "Aguarde um pouco antes de pedir outro código." : "Não foi possível enviar o código.");
    setEmail(e);
    setCodigo("");
    setEnviadoEm(Date.now());
    setEtapa("codigo");
    toast.success("Se o e-mail estiver cadastrado, você receberá um código de 6 números.");
  }

  async function verificar() {
    if (expirado) return toast.error("O código expirou. Peça um novo.");
    if (!/^\d{6}$/.test(codigo)) return toast.error("O código tem 6 números.");
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: codigo, type: "recovery" });
    setLoading(false);
    if (error) return toast.error("Código incorreto ou expirado.");
    setEtapa("senha");
  }

  async function salvar() {
    if (!check.ok) return toast.error(check.errors[0]);
    if (senha !== senha2) return toast.error("As senhas não são iguais.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setLoading(false);
    if (error) return toast.error("Não foi possível alterar a senha: " + error.message);
    toast.success("Senha alterada com sucesso!");
    nav({ to: "/" });
  }

  const mm = String(Math.floor(restante / 60000)).padStart(2, "0");
  const ss = String(Math.floor((restante % 60000) / 1000)).padStart(2, "0");

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <Link to="/auth" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar ao login
        </Link>
        <div className="space-y-2">
          <KeyRound className="h-8 w-8" />
          <h1 className="font-display text-2xl font-bold">Recuperar senha</h1>
          <p className="text-sm text-muted-foreground">
            {etapa === "email" && "Digite seu e-mail para receber um código de 6 números."}
            {etapa === "codigo" && `Enviamos um código para ${email}. Ele vale por 10 minutos.`}
            {etapa === "senha" && "Crie sua nova senha."}
          </p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (etapa === "email") enviar();
            else if (etapa === "codigo") verificar();
            else salvar();
          }}
        >
          {etapa === "email" && (
            <input type="email" required placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
          )}

          {etapa === "codigo" && (
            <>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className={`${input} text-center text-2xl tracking-[0.5em] tabular-nums`}
              />
              <p className={`text-center text-xs ${expirado ? "text-destructive" : "text-muted-foreground"}`}>
                {expirado ? "Código expirado." : `Expira em ${mm}:${ss}`}
              </p>
            </>
          )}

          {etapa === "senha" && (
            <>
              <input type="password" placeholder="Nova senha" value={senha} onChange={(e) => setSenha(e.target.value)} className={input} />
              <input type="password" placeholder="Repita a nova senha" value={senha2} onChange={(e) => setSenha2(e.target.value)} className={input} />
              {senha && !check.ok && <p className="text-xs text-destructive">{check.errors[0]}</p>}
              {senha2 && senha !== senha2 && <p className="text-xs text-destructive">As senhas não são iguais.</p>}
            </>
          )}

          <button
            type="submit"
            disabled={loading || expirado}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-foreground px-4 py-3 text-sm font-semibold text-background disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {etapa === "email" ? "Enviar código" : etapa === "codigo" ? "Confirmar código" : "Salvar nova senha"}
          </button>

          {etapa === "codigo" && (
            <button type="button" disabled={loading} onClick={enviar} className="w-full text-center text-xs text-muted-foreground underline">
              Enviar novo código
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
