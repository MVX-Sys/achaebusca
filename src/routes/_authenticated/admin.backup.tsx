import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { BackupGestaoClick } from "@/components/backup-gestaoclick";
import {
  Download,
  Upload,
  Database,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  FileSearch,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/backup")({
  component: BackupPage,
});

type BackupPayload = {
  versao: number;
  gerado_em: string;
  categorias: any[];
  produtos: any[];
  variacoes: any[];
  imagens: any[];
};

type Issue = { level: "error" | "warning"; msg: string };

type DryRunReport = {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  conflicts: {
    categorias: number;
    produtos: number;
    variacoes: number;
    imagens: number;
  };
  novos: {
    categorias: number;
    produtos: number;
    variacoes: number;
    imagens: number;
  };
  imagensOrfas: number;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function BackupPage() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);
  const [preview, setPreview] = useState<BackupPayload | null>(null);
  const [report, setReport] = useState<DryRunReport | null>(null);
  const [replaceMode, setReplaceMode] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setExporting(true);
    setFeedback(null);
    try {
      const [cats, prods, vars, imgs] = await Promise.all([
        supabase.from("categorias").select("*"),
        supabase.from("produtos").select("*"),
        supabase.from("variacoes_produto").select("*"),
        supabase.from("imagens_produto").select("*"),
      ]);
      if (cats.error || prods.error || vars.error || imgs.error) {
        throw new Error("Falha ao buscar dados");
      }
      const payload: BackupPayload = {
        versao: 1,
        gerado_em: new Date().toISOString(),
        categorias: cats.data ?? [],
        produtos: prods.data ?? [],
        variacoes: vars.data ?? [],
        imagens: imgs.data ?? [],
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.href = url;
      a.download = `backup-produtos-${ts}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await logAudit({
        acao: "backup_export",
        entidade: "produto",
        descricao: `Backup exportado (${payload.produtos.length} produtos, ${payload.variacoes.length} variações, ${payload.imagens.length} imagens)`,
        detalhes: {
          produtos: payload.produtos.length,
          variacoes: payload.variacoes.length,
          imagens: payload.imagens.length,
          categorias: payload.categorias.length,
        },
      });
      setFeedback({
        type: "success",
        msg: `Backup gerado com ${payload.produtos.length} produtos.`,
      });
    } catch (e: any) {
      setFeedback({ type: "error", msg: e?.message ?? "Erro ao exportar" });
    } finally {
      setExporting(false);
    }
  }

  function validateShape(p: any): Issue[] {
    const errs: Issue[] = [];
    if (!p || typeof p !== "object")
      return [{ level: "error", msg: "JSON raiz inválido" }];
    if (typeof p.versao !== "number")
      errs.push({ level: "error", msg: "Campo 'versao' ausente ou inválido" });
    for (const key of ["categorias", "produtos", "variacoes", "imagens"]) {
      if (!Array.isArray(p[key]))
        errs.push({ level: "error", msg: `Campo '${key}' deve ser um array` });
    }
    return errs;
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setReport(null);
    setPreview(null);
    setFeedback(null);
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupPayload;
      const shapeErrs = validateShape(parsed);
      if (shapeErrs.length) {
        setFeedback({
          type: "error",
          msg: shapeErrs.map((e) => e.msg).join(" · "),
        });
        return;
      }
      setPreview(parsed);
    } catch (err: any) {
      setFeedback({
        type: "error",
        msg: "Arquivo inválido: " + (err?.message ?? ""),
      });
    }
  }

  async function runDryRun() {
    if (!preview) return;
    setValidating(true);
    setReport(null);
    try {
      const errors: Issue[] = [];
      const warnings: Issue[] = [];

      // ---- Structural checks per row ----
      const catIds = new Set<string>();
      const catSlugs = new Map<string, string>();
      preview.categorias.forEach((c, i) => {
        if (!c.id || !UUID_RE.test(c.id))
          errors.push({ level: "error", msg: `categoria[${i}]: id inválido` });
        else if (catIds.has(c.id))
          errors.push({
            level: "error",
            msg: `categoria[${i}]: id duplicado (${c.id})`,
          });
        else catIds.add(c.id);
        if (!c.nome || typeof c.nome !== "string")
          errors.push({ level: "error", msg: `categoria[${i}]: nome ausente` });
        if (!c.slug || typeof c.slug !== "string")
          errors.push({ level: "error", msg: `categoria[${i}]: slug ausente` });
        else if (catSlugs.has(c.slug))
          errors.push({
            level: "error",
            msg: `categoria[${i}]: slug duplicado ('${c.slug}')`,
          });
        else catSlugs.set(c.slug, c.id);
      });

      const prodIds = new Set<string>();
      preview.produtos.forEach((p, i) => {
        if (!p.id || !UUID_RE.test(p.id))
          errors.push({ level: "error", msg: `produto[${i}]: id inválido` });
        else if (prodIds.has(p.id))
          errors.push({
            level: "error",
            msg: `produto[${i}]: id duplicado (${p.id})`,
          });
        else prodIds.add(p.id);
        if (!p.nome) errors.push({ level: "error", msg: `produto[${i}]: nome ausente` });
        if (typeof p.preco !== "number" || p.preco < 0)
          errors.push({
            level: "error",
            msg: `produto[${i}] (${p.nome ?? "?"}): preço inválido`,
          });
        if (p.categoria_id && !catIds.has(p.categoria_id))
          warnings.push({
            level: "warning",
            msg: `produto '${p.nome ?? p.id}': categoria_id não existe no backup (ficará como sem categoria se substituir)`,
          });
      });

      const varKeys = new Set<string>();
      preview.variacoes.forEach((v, i) => {
        if (!v.id || !UUID_RE.test(v.id))
          errors.push({ level: "error", msg: `variacao[${i}]: id inválido` });
        if (!v.produto_id || !prodIds.has(v.produto_id))
          errors.push({
            level: "error",
            msg: `variacao[${i}]: produto_id não encontrado no backup`,
          });
        if (typeof v.quantidade_estoque !== "number" || v.quantidade_estoque < 0)
          errors.push({
            level: "error",
            msg: `variacao[${i}]: estoque inválido`,
          });
        const k = `${v.produto_id}|${v.nome_cor}|${v.tamanho}`;
        if (varKeys.has(k))
          errors.push({
            level: "error",
            msg: `variacao[${i}]: duplicada (${v.nome_cor}/${v.tamanho})`,
          });
        else varKeys.add(k);
      });

      let imagensOrfas = 0;
      preview.imagens.forEach((im, i) => {
        if (!im.id || !UUID_RE.test(im.id))
          errors.push({ level: "error", msg: `imagem[${i}]: id inválido` });
        if (!im.produto_id || !prodIds.has(im.produto_id)) {
          imagensOrfas++;
          warnings.push({
            level: "warning",
            msg: `imagem[${i}]: produto_id não encontrado no backup`,
          });
        }
        if (!im.storage_path)
          errors.push({
            level: "error",
            msg: `imagem[${i}]: storage_path ausente`,
          });
      });

      // ---- Conflict detection against DB (existing IDs = upsert overwrite) ----
      const [dbCats, dbProds, dbVars, dbImgs] = await Promise.all([
        supabase.from("categorias").select("id"),
        supabase.from("produtos").select("id"),
        supabase.from("variacoes_produto").select("id"),
        supabase.from("imagens_produto").select("id"),
      ]);
      const existing = {
        cat: new Set((dbCats.data ?? []).map((r: any) => r.id)),
        prod: new Set((dbProds.data ?? []).map((r: any) => r.id)),
        var: new Set((dbVars.data ?? []).map((r: any) => r.id)),
        img: new Set((dbImgs.data ?? []).map((r: any) => r.id)),
      };

      const conflicts = {
        categorias: preview.categorias.filter((c) => existing.cat.has(c.id)).length,
        produtos: preview.produtos.filter((p) => existing.prod.has(p.id)).length,
        variacoes: preview.variacoes.filter((v) => existing.var.has(v.id)).length,
        imagens: preview.imagens.filter((im) => existing.img.has(im.id)).length,
      };
      const novos = {
        categorias: preview.categorias.length - conflicts.categorias,
        produtos: preview.produtos.length - conflicts.produtos,
        variacoes: preview.variacoes.length - conflicts.variacoes,
        imagens: preview.imagens.length - conflicts.imagens,
      };

      setReport({
        ok: errors.length === 0,
        errors,
        warnings,
        conflicts,
        novos,
        imagensOrfas,
      });
    } catch (e: any) {
      setFeedback({
        type: "error",
        msg: "Erro na validação: " + (e?.message ?? ""),
      });
    } finally {
      setValidating(false);
    }
  }

  async function handleImport() {
    if (!preview || !report?.ok) return;
    if (
      !confirm(
        replaceMode
          ? "SUBSTITUIR: isso apagará TODOS os produtos, variações, imagens e categorias atuais antes de restaurar. Confirmar?"
          : "Restaurar (mesclar) os itens do backup? Registros com o mesmo ID serão sobrescritos.",
      )
    )
      return;
    setImporting(true);
    setFeedback(null);
    try {
      if (replaceMode) {
        await supabase.from("imagens_produto").delete().not("id", "is", null);
        await supabase.from("variacoes_produto").delete().not("id", "is", null);
        await supabase.from("produtos").delete().not("id", "is", null);
        await supabase.from("categorias").delete().not("id", "is", null);
      }

      const chunks = <T,>(arr: T[], n = 200) =>
        Array.from({ length: Math.ceil(arr.length / n) }, (_, i) =>
          arr.slice(i * n, i * n + n),
        );

      for (const c of chunks(preview.categorias))
        if (c.length) {
          const { error } = await supabase
            .from("categorias")
            .upsert(c as never, { onConflict: "id" });
          if (error) throw error;
        }
      for (const c of chunks(preview.produtos))
        if (c.length) {
          const { error } = await supabase
            .from("produtos")
            .upsert(c as never, { onConflict: "id" });
          if (error) throw error;
        }
      for (const c of chunks(preview.variacoes))
        if (c.length) {
          const { error } = await supabase
            .from("variacoes_produto")
            .upsert(c as never, { onConflict: "id" });
          if (error) throw error;
        }
      for (const c of chunks(preview.imagens))
        if (c.length) {
          const { error } = await supabase
            .from("imagens_produto")
            .upsert(c as never, { onConflict: "id" });
          if (error) throw error;
        }

      await logAudit({
        acao: "backup_import",
        entidade: "produto",
        descricao: `Backup restaurado (${preview.produtos.length} produtos)${replaceMode ? " — modo SUBSTITUIR" : " — modo mesclar"}`,
        detalhes: {
          modo: replaceMode ? "substituir" : "mesclar",
          produtos: preview.produtos.length,
          variacoes: preview.variacoes.length,
          imagens: preview.imagens.length,
          categorias: preview.categorias.length,
          gerado_em: preview.gerado_em,
          conflitos: report.conflicts,
          novos: report.novos,
        },
      });
      setFeedback({
        type: "success",
        msg: `Restauração concluída: ${preview.produtos.length} produtos.`,
      });
      setPreview(null);
      setReport(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e: any) {
      setFeedback({
        type: "error",
        msg: "Erro ao restaurar: " + (e?.message ?? ""),
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">
          Backup de produtos
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Exporte um snapshot completo (produtos, variações, imagens e
          categorias) ou restaure a partir de um arquivo <code>.json</code>{" "}
          — com verificação prévia (dry-run) antes de qualquer alteração.
        </p>
      </div>

      {feedback && (
        <div
          className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
            feedback.type === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4" />
          )}
          <span>{feedback.msg}</span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-semibold">Exportar</h2>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Gera um arquivo JSON com todo o catálogo atual. Guarde em local
            seguro. As imagens permanecem no storage — o backup inclui os
            caminhos.
          </p>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Database className="h-4 w-4" />
            )}
            Baixar backup .json
          </button>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-semibold">Restaurar</h2>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            1) Selecione o arquivo · 2) Rode a verificação · 3) Confirme a
            restauração.
          </p>

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent/70"
          />

          {preview && (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl bg-muted/60 p-3 text-xs">
                <p className="font-medium">Arquivo carregado</p>
                <p className="mt-1 text-muted-foreground">
                  Gerado em:{" "}
                  {new Date(preview.gerado_em).toLocaleString("pt-BR")}
                </p>
                <ul className="mt-2 grid grid-cols-2 gap-1">
                  <li>Categorias: {preview.categorias.length}</li>
                  <li>Produtos: {preview.produtos.length}</li>
                  <li>Variações: {preview.variacoes.length}</li>
                  <li>Imagens: {preview.imagens.length}</li>
                </ul>
              </div>

              <button
                onClick={runDryRun}
                disabled={validating}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-60"
              >
                {validating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileSearch className="h-4 w-4" />
                )}
                {report ? "Reexecutar verificação" : "Verificar (dry-run)"}
              </button>
            </div>
          )}
        </section>
      </div>

      <BackupGestaoClick />

      {report && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            {report.ok ? (
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-destructive" />
            )}
            <h2 className="font-display text-lg font-semibold">
              Relatório da verificação
            </h2>
            <span
              className={`ml-2 rounded-full px-3 py-1 text-xs font-semibold ${
                report.ok
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-destructive/15 text-destructive"
              }`}
            >
              {report.ok
                ? "OK — pronto para restaurar"
                : `${report.errors.length} erro(s) — restauração bloqueada`}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["Categorias", report.novos.categorias, report.conflicts.categorias],
                ["Produtos", report.novos.produtos, report.conflicts.produtos],
                ["Variações", report.novos.variacoes, report.conflicts.variacoes],
                ["Imagens", report.novos.imagens, report.conflicts.imagens],
              ] as const
            ).map(([label, novos, confl]) => (
              <div key={label} className="rounded-xl border border-border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {label}
                </p>
                <div className="mt-1 flex items-baseline gap-3 text-sm">
                  <span>
                    <span className="text-lg font-semibold text-emerald-700">
                      +{novos}
                    </span>{" "}
                    novos
                  </span>
                  <span>
                    <span className="text-lg font-semibold text-amber-700">
                      {confl}
                    </span>{" "}
                    sobrescritos
                  </span>
                </div>
              </div>
            ))}
          </div>

          {(report.errors.length > 0 || report.warnings.length > 0) && (
            <div className="mt-4 space-y-3">
              {report.errors.length > 0 && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
                  <p className="mb-2 text-sm font-semibold text-destructive">
                    Erros ({report.errors.length})
                  </p>
                  <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-destructive">
                    {report.errors.slice(0, 100).map((e, i) => (
                      <li key={i}>• {e.msg}</li>
                    ))}
                    {report.errors.length > 100 && (
                      <li>… e mais {report.errors.length - 100}</li>
                    )}
                  </ul>
                </div>
              )}
              {report.warnings.length > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                  <p className="mb-2 text-sm font-semibold text-amber-800">
                    Avisos ({report.warnings.length})
                  </p>
                  <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-amber-800">
                    {report.warnings.slice(0, 100).map((w, i) => (
                      <li key={i}>• {w.msg}</li>
                    ))}
                    {report.warnings.length > 100 && (
                      <li>… e mais {report.warnings.length - 100}</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="mt-5 space-y-3 border-t border-border pt-4">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={replaceMode}
                onChange={(e) => setReplaceMode(e.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="font-medium">Modo substituir</span>
                <span className="block text-xs text-muted-foreground">
                  Apaga tudo antes de restaurar. Sem marcar, faz merge por ID
                  (upsert).
                </span>
              </span>
            </label>

            {replaceMode && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                <ShieldAlert className="mt-0.5 h-4 w-4" />
                <span>
                  Atenção: essa ação é destrutiva e não pode ser desfeita.
                </span>
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={importing || !report.ok}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              title={
                !report.ok
                  ? "Corrija os erros do backup antes de restaurar"
                  : undefined
              }
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {report.ok ? "Confirmar restauração" : "Restauração bloqueada"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
