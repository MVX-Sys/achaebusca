import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { listCategorias, getProduto } from "@/lib/products";
import { getImageUrl } from "@/lib/storage";
import { Trash2, Plus, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";

type VarRow = {
  id?: string;
  nome_cor: string;
  hex_cor: string;
  tamanho: string;
  quantidade_estoque: number;
};

type ImgRow = {
  id?: string;
  storage_path: string;
  principal: boolean;
  ordem: number;
  url?: string;
  _file?: File;
};

// Removemos as listas de tamanhos pré-definidos para permitir entrada livre.
const CATEGORIAS_CALCADOS = ["chinelos", "tenis", "botas"];

const CORES_CONHECIDAS: Record<string, string> = {
  preto: "#000000",
  branco: "#FFFFFF",
  cinza: "#9CA3AF",
  "cinza claro": "#D1D5DB",
  "cinza escuro": "#4B5563",
  vermelho: "#DC2626",
  "vermelho escuro": "#7F1D1D",
  bordô: "#7F1D1D",
  bordo: "#7F1D1D",
  vinho: "#5B1A1A",
  rosa: "#F472B6",
  "rosa claro": "#FBCFE8",
  pink: "#EC4899",
  laranja: "#FF5500",
  "laranja claro": "#FDBA74",
  amarelo: "#FACC15",
  "amarelo claro": "#FEF08A",
  mostarda: "#CA8A04",
  verde: "#16A34A",
  "verde claro": "#86EFAC",
  "verde escuro": "#14532D",
  "verde militar": "#4B5320",
  "verde musgo": "#556B2F",
  oliva: "#6B8E23",
  azul: "#2563EB",
  "azul claro": "#93C5FD",
  "azul escuro": "#1E3A8A",
  "azul marinho": "#0B1F4A",
  marinho: "#0B1F4A",
  turquesa: "#14B8A6",
  ciano: "#06B6D4",
  roxo: "#7C3AED",
  lilás: "#C4B5FD",
  lilas: "#C4B5FD",
  violeta: "#8B5CF6",
  marrom: "#78350F",
  "marrom claro": "#B45309",
  "marrom escuro": "#3F1F0A",
  bege: "#E7D2B4",
  nude: "#E9C9B0",
  caramelo: "#B0651F",
  chocolate: "#3F1B0B",
  café: "#4B2E1D",
  cafe: "#4B2E1D",
  areia: "#DAC9A6",
  creme: "#F5EFE0",
  off_white: "#F5F1EA",
  "off white": "#F5F1EA",
  gelo: "#F1F5F9",
  prata: "#C0C0C0",
  dourado: "#D4AF37",
  ouro: "#D4AF37",
  cobre: "#B87333",
  jeans: "#4B6A88",
  denim: "#3B5A78",
  grafite: "#374151",
  chumbo: "#52525B",
};

function guessHexFromName(name: string): string | null {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  if (CORES_CONHECIDAS[key]) return CORES_CONHECIDAS[key];
  // partial match: try to find a known color whose name appears in the input
  const found = Object.keys(CORES_CONHECIDAS).find((k) => key === k || key.includes(k));
  return found ? CORES_CONHECIDAS[found] : null;
}

export function ProductForm({ produtoId }: { produtoId?: string }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: categorias = [] } = useQuery({
    queryKey: ["categorias"],
    queryFn: listCategorias,
  });
  const { data: existing } = useQuery({
    queryKey: ["admin-produto", produtoId],
    queryFn: () => (produtoId ? getProduto(produtoId) : null),
    enabled: !!produtoId,
  });

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [preco, setPreco] = useState<number>(0);
  const [categoriaId, setCategoriaId] = useState<string>("");
  const [codigoBase, setCodigoBase] = useState<string>("");
  
  const [novidade, setNovidade] = useState(false);
  const [promocao, setPromocao] = useState(false);
  const [precoPromocional, setPrecoPromocional] = useState<string>("");
  const [promocaoAte, setPromocaoAte] = useState<string>("");
  const [ativo, setAtivo] = useState(true);
  const [imgs, setImgs] = useState<ImgRow[]>([]);
  const [vars, setVars] = useState<VarRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [addingCor, setAddingCor] = useState(false);
  const [novaCorNome, setNovaCorNome] = useState("");
  const [novaCorHex, setNovaCorHex] = useState("#000000");
  const [hexTouched, setHexTouched] = useState(false);

  useEffect(() => {
    if (!existing) return;
    setNome(existing.nome);
    setDescricao(existing.descricao ?? "");
    setPreco(existing.preco);
    setCategoriaId(existing.categoria_id ?? "");
    setCodigoBase(((existing as any).codigo_base as string) ?? (existing.hash_id ?? "").slice(0, 3));
    
    setNovidade(existing.novidade);
    setPromocao(existing.promocao);
    setPrecoPromocional(
      existing.preco_promocional != null ? String(existing.preco_promocional) : "",
    );
    // Converte ISO -> "YYYY-MM-DDTHH:mm" no horário local para <input type="datetime-local">
    if (existing.promocao_ate) {
      const d = new Date(existing.promocao_ate);
      const pad = (n: number) => String(n).padStart(2, "0");
      setPromocaoAte(
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
      );
    } else {
      setPromocaoAte("");
    }
    setAtivo(existing.ativo);
    setVars(
      existing.variacoes.map((v) => ({
        id: v.id,
        nome_cor: v.nome_cor,
        hex_cor: v.hex_cor,
        tamanho: v.tamanho,
        quantidade_estoque: v.quantidade_estoque,
      })),
    );
    Promise.all(
      existing.imagens
        .sort((a, b) => a.ordem - b.ordem)
        .map(async (i) => ({
          id: i.id,
          storage_path: i.storage_path,
          principal: i.principal,
          ordem: i.ordem,
          url: await getImageUrl(i.storage_path),
        })),
    ).then(setImgs);
  }, [existing]);

  const onPickFiles = async (files: FileList | null) => {
    if (!files) return;
    const { processImageFile } = await import("@/lib/images");
    const arr = Array.from(files);
    const processed: File[] = [];
    for (const f of arr) {
      try {
        processed.push(await processImageFile(f));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao processar imagem.");
      }
    }
    const nova: ImgRow[] = processed.map((f, idx) => ({
      storage_path: "",
      principal: false,
      ordem: imgs.length + idx,
      url: URL.createObjectURL(f),
      _file: f,
    }));
    setImgs((prev) => {
      const combined = [...prev, ...nova];
      if (!combined.some((x) => x.principal) && combined[0]) combined[0].principal = true;
      return [...combined];
    });
  };

  const removeImg = (idx: number) => {
    setImgs((prev) => {
      const copy = prev.filter((_, i) => i !== idx);
      if (!copy.some((x) => x.principal) && copy[0]) copy[0].principal = true;
      return [...copy];
    });
  };

  const setPrincipal = (idx: number) =>
    setImgs((prev) => prev.map((x, i) => ({ ...x, principal: i === idx })));

  // color groups (rows in variations matrix)
  const cores = Array.from(
    new Map(vars.map((v) => [v.nome_cor, v.hex_cor])).entries(),
  ).map(([nome, hex]) => ({ nome, hex }));

  const confirmAddCor = () => {
    const nome = novaCorNome.trim();
    if (!nome) {
      toast.error("Informe o nome da cor.");
      return;
    }
    if (cores.some((c) => c.nome.toLowerCase() === nome.toLowerCase())) {
      toast.error("Essa cor já foi adicionada.");
      return;
    }

    // Apenas garante que a cor exista na lista de variações (mesmo sem tamanho inicial)
    // Usamos um tamanho temporário vazio ou apenas não adicionamos nada se preferir,
    // mas para a lógica do componente 'cores' funcionar, precisamos de ao menos uma entrada.
    // Vamos adicionar uma entrada com tamanho vazio que será removida assim que o primeiro tamanho real for adicionado.
    setVars((prev) => [
      ...prev,
      {
        nome_cor: nome,
        hex_cor: novaCorHex,
        tamanho: "", // Tamanho vazio inicial
        quantidade_estoque: 0,
      },
    ]);

    setNovaCorNome("");
    setNovaCorHex("#000000");
    setHexTouched(false);
    setAddingCor(false);
    toast.success(`Cor ${nome} adicionada. Agora adicione os tamanhos para ela.`);
  };

  const confirmAddTam = (corNome: string, tamNome: string) => {
    const tam = tamNome.trim().toUpperCase();
    if (!tam) return;
    
    if (vars.some(v => v.nome_cor === corNome && v.tamanho === tam)) {
      toast.error("Este tamanho já existe para esta cor.");
      return;
    }

    setVars(prev => {
      // Remove a entrada vazia inicial se existir
      const filtered = prev.filter(v => !(v.nome_cor === corNome && v.tamanho === ""));
      return [
        ...filtered,
        {
          nome_cor: corNome,
          hex_cor: cores.find(c => c.nome === corNome)?.hex || "#000000",
          tamanho: tam,
          quantidade_estoque: 0
        }
      ];
    });
  };

  const removeTam = (cor: string, tam: string) =>
    setVars((prev) => prev.filter((v) => !(v.nome_cor === cor && v.tamanho === tam)));


  const removeCor = (nome: string) =>
    setVars((prev) => prev.filter((v) => v.nome_cor !== nome));

  const setEstoque = (cor: string, tam: string, q: number) =>
    setVars((prev) => {
      const idx = prev.findIndex((v) => v.nome_cor === cor && v.tamanho === tam);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantidade_estoque: Math.max(0, q) };
        return copy;
      }
      const hex = cores.find((c) => c.nome === cor)?.hex ?? "#000000";
      return [
        ...prev,
        { nome_cor: cor, hex_cor: hex, tamanho: tam, quantidade_estoque: Math.max(0, q) },
      ];
    });

  const getEstoque = (cor: string, tam: string) =>
    vars.find((v) => v.nome_cor === cor && v.tamanho === tam)?.quantidade_estoque ?? 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome || preco < 0 || !categoriaId) {
      toast.error("Nome, preço e categoria são obrigatórios.");
      return;
    }
    const codigoLimpo = codigoBase
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 3);
    if (codigoLimpo.length !== 3) {
      toast.error("Informe o código do produto com 3 caracteres (letras ou números).");
      return;
    }
    let precoPromoNum: number | null = null;
    let promoAteIso: string | null = null;
    if (promocao) {
      const parsed = precoPromocional.trim() === "" ? NaN : Number(precoPromocional);
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast.error("Informe um preço promocional válido.");
        return;
      }
      if (parsed >= preco) {
        toast.error("O preço promocional deve ser menor que o preço original.");
        return;
      }
      if (!promocaoAte.trim()) {
        toast.error("Informe a data de validade da promoção.");
        return;
      }
      const dt = new Date(promocaoAte);
      if (Number.isNaN(dt.getTime())) {
        toast.error("Data da promoção inválida.");
        return;
      }
      if (dt.getTime() <= Date.now()) {
        toast.error("A data da promoção deve ser no futuro.");
        return;
      }
      precoPromoNum = parsed;
      promoAteIso = dt.toISOString();
    }
    setSaving(true);
    try {
      let pid = produtoId;
      const payload = {
        nome,
        descricao: descricao || null,
        preco,
        categoria_id: categoriaId,
        codigo_base: codigoLimpo,
        marca: null,
        novidade,
        promocao,
        preco_promocional: precoPromoNum,
        promocao_ate: promoAteIso,
        ativo,
      };
      if (pid) {
        const { error } = await supabase.from("produtos").update(payload).eq("id", pid);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("produtos")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        pid = data.id;
      }

      // upload new images
      for (let i = 0; i < imgs.length; i++) {
        const img = imgs[i];
        if (img._file && !img.storage_path) {
          const ext = img._file.name.split(".").pop() ?? "jpg";
          const path = `${pid}/${crypto.randomUUID()}.${ext}`;
          const { error } = await supabase.storage
            .from("product-images")
            .upload(path, img._file, { upsert: false, contentType: img._file.type, cacheControl: "31536000" });

          if (error) throw error;
          img.storage_path = path;
        }
      }

      // sync imagens_produto rows: delete removed, upsert existing/new
      const { data: existingImgs } = await supabase
        .from("imagens_produto")
        .select("id")
        .eq("produto_id", pid);
      const keepIds = new Set(imgs.map((i) => i.id).filter(Boolean));
      const toDelete = (existingImgs ?? [])
        .map((r) => r.id)
        .filter((id) => !keepIds.has(id));
      if (toDelete.length)
        await supabase.from("imagens_produto").delete().in("id", toDelete);

      for (let i = 0; i < imgs.length; i++) {
        const img = imgs[i];
        if (img.id) {
          await supabase
            .from("imagens_produto")
            .update({ principal: img.principal, ordem: i })
            .eq("id", img.id);
        } else if (img.storage_path) {
          await supabase.from("imagens_produto").insert({
            produto_id: pid,
            storage_path: img.storage_path,
            principal: img.principal,
            ordem: i,
          });
        }
      }

      // sync variations: replace-all approach
      await supabase.from("variacoes_produto").delete().eq("produto_id", pid);
      if (vars.length) {
        const { error } = await supabase.from("variacoes_produto").insert(
          vars.map((v) => ({
            produto_id: pid,
            nome_cor: v.nome_cor,
            hex_cor: v.hex_cor,
            tamanho: v.tamanho,
            quantidade_estoque: v.quantidade_estoque,
          })),
        );
        if (error) throw error;
      }

      toast.success("Produto salvo!");
      await logAudit({
        acao: produtoId ? "editar" : "criar",
        entidade: "produto",
        entidade_id: pid,
        descricao: `${produtoId ? "Editou" : "Criou"} produto ${nome}`,
        detalhes: { nome, preco, ativo, variacoes: vars.length, imagens: imgs.length },
      });
      qc.invalidateQueries({ queryKey: ["admin-produtos"] });
      qc.invalidateQueries({ queryKey: ["produtos"] });
      qc.invalidateQueries({ queryKey: ["admin-produto"] });
      qc.invalidateQueries({ queryKey: ["produto"] });
      nav({ to: "/admin" });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : "Erro ao salvar.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
        {/* Main */}
        <div className="space-y-6">
          <Card title="Informações básicas">
            {produtoId && existing?.hash_id && (
              <div className="mb-4 rounded-lg bg-muted p-2 text-center">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">ID do Produto: </span>
                <code className="text-xs font-mono font-bold text-foreground">{existing.hash_id}</code>
              </div>
            )}
            <Field label="Nome do produto *">
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
                placeholder="Ex: Camiseta Oversized Preta"
                className="input"
              />
            </Field>
            <Field label="Código do produto * (3 caracteres)">
              <input
                value={codigoBase}
                onChange={(e) =>
                  setCodigoBase(
                    e.target.value
                      .normalize("NFD")
                      .replace(/[\u0300-\u036f]/g, "")
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, "")
                      .slice(0, 3),
                  )
                }
                required
                maxLength={3}
                placeholder="Ex: CBI"
                className="input font-mono uppercase tracking-widest"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                A 4ª letra é a inicial da cor e é adicionada automaticamente.
                {codigoBase.length === 3 && ` Código final: ${codigoBase}${(cores[0]?.nome ?? "X").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 1) || "X"}`}
              </p>
            </Field>
            <Field label="Descrição">
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={4}
                placeholder="Detalhes de tecido, caimento, ocasião…"
                className="input min-h-[120px] resize-y"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Preço base *">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    R$
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={preco}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setPreco(isNaN(val) ? 0 : Math.max(0, val));
                    }}
                    required
                    className="input pl-9"
                  />
                </div>
              </Field>
            </div>
            <Field label="Categoria *">
              <select
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                required
                className="input bg-background"
              >
                <option value="">Selecione…</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Field>
          </Card>

          <Card title="Gestão de Estoque por Variação"
            action={
              !addingCor && (
                <button
                  type="button"
                  onClick={() => setAddingCor(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
                >
                  <Plus className="h-3 w-3" /> Adicionar cor
                </button>
              )
            }
          >
            {addingCor && (
              <div className="mb-4 rounded-xl border border-border bg-muted/30 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
                  <div>
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Nome da cor
                    </span>
                    <input
                      autoFocus
                      value={novaCorNome}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNovaCorNome(val);
                        if (!hexTouched) {
                          const guess = guessHexFromName(val);
                          if (guess) setNovaCorHex(guess);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          confirmAddCor();
                        }
                      }}
                      placeholder="Ex: Preto"
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Visual
                    </span>
                    <label
                      className="flex h-10 w-14 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-input transition-colors"
                      style={{ backgroundColor: novaCorHex }}
                    >
                      <input
                        type="color"
                        value={novaCorHex}
                        onChange={(e) => {
                          setNovaCorHex(e.target.value);
                          setHexTouched(true);
                        }}
                        className="h-14 w-20 cursor-pointer border-0 bg-transparent p-0 opacity-0"
                      />
                    </label>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={confirmAddCor}
                      className="h-10 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90"
                    >
                      Confirmar Cor
                    </button>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => {
                        setAddingCor(false);
                        setNovaCorNome("");
                        setNovaCorHex("#000000");
                        setHexTouched(false);
                      }}
                      className="h-10 rounded-full border border-border px-4 text-xs font-medium hover:bg-accent"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {cores.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
                Nenhuma cor cadastrada. Adicione uma cor primeiro para definir os tamanhos.
              </div>
            ) : (
              <div className="space-y-4">
                {cores.map((c) => (
                  <div key={c.nome} className="rounded-xl border border-border bg-card overflow-hidden">
                    {/* Cabeçalho da Cor */}
                    <div className="flex items-center justify-between bg-muted/40 px-4 py-3 border-b border-border">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <label
                            className="h-6 w-6 cursor-pointer rounded-full border border-border shadow-inner"
                            style={{ backgroundColor: c.hex }}
                            title="Mudar cor visual"
                          >
                            <input
                              type="color"
                              value={c.hex}
                              onChange={(e) => {
                                const newHex = e.target.value;
                                setVars(prev => prev.map(v => v.nome_cor === c.nome ? { ...v, hex_cor: newHex } : v));
                              }}
                              className="pointer-events-none absolute h-0 w-0 opacity-0"
                            />
                          </label>
                        </div>
                        <span className="font-display font-bold text-sm uppercase tracking-wider">{c.nome}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeCor(c.nome)}
                        className="text-xs font-medium text-destructive hover:underline"
                      >
                        Remover Cor
                      </button>
                    </div>

                    {/* Tamanhos da Cor */}
                    <div className="p-4">
                      <div className="flex flex-wrap gap-3 items-end">
                        {vars
                          .filter((v) => v.nome_cor === c.nome && v.tamanho !== "")
                          .map((v) => (
                            <div key={v.tamanho} className="group relative flex flex-col items-center gap-1.5 rounded-xl border border-border bg-muted/20 p-3 pt-2">
                              <span className="text-[10px] font-bold uppercase text-muted-foreground">{v.tamanho}</span>
                              <input
                                type="number"
                                min={0}
                                value={v.quantidade_estoque}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  setEstoque(c.nome, v.tamanho, isNaN(val) ? 0 : Math.max(0, val));
                                }}
                                className="w-16 rounded-lg border border-input bg-background px-2 py-1.5 text-center text-sm tabular-nums outline-none focus:border-foreground"
                              />
                              <button
                                type="button"
                                onClick={() => removeTam(c.nome, v.tamanho)}
                                className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        
                        {/* Input para novo tamanho nesta cor */}
                        <div className="flex items-center gap-2 rounded-xl border border-dashed border-border p-2">
                          <input
                            type="text"
                            placeholder="Novo tam (ex: 38, P)"
                            className="w-24 bg-transparent text-xs outline-none"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                confirmAddTam(c.nome, (e.target as HTMLInputElement).value);
                                (e.target as HTMLInputElement).value = "";
                              }
                            }}
                          />
                          <span className="text-[10px] text-muted-foreground italic">Enter p/ add</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card title="Imagens">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 p-8 text-sm text-muted-foreground transition-colors hover:border-foreground hover:bg-accent">
              <Upload className="h-6 w-6" />
              <span className="font-medium text-foreground">Selecionar imagens</span>
              <span className="text-xs">Arraste ou clique para enviar</span>
              <input
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.avif,.jxl"
                onChange={(e) => onPickFiles(e.target.files)}
                className="hidden"
              />
            </label>
            {imgs.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {imgs.map((img, i) => (
                  <div
                    key={i}
                    className={`group relative aspect-square overflow-hidden rounded-lg border-2 transition-all ${
                      img.principal ? "border-foreground ring-2 ring-foreground/10" : "border-border"
                    }`}
                  >
                    {img.url && <img src={img.url} alt="" className="h-full w-full object-cover" />}
                    <button
                      type="button"
                      onClick={() => removeImg(i)}
                      className="absolute right-1 top-1 rounded-full bg-foreground/80 p-1 text-background opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrincipal(i)}
                      className={`absolute inset-x-0 bottom-0 text-[10px] font-semibold uppercase tracking-wider py-1 transition-opacity ${
                        img.principal
                          ? "bg-foreground text-background"
                          : "bg-foreground/70 text-background opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      {img.principal ? "Principal" : "Tornar principal"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Visibilidade">
            <div className="space-y-2.5">
              {[
                { key: "ativo", label: "Ativo (visível na loja)", val: ativo, set: setAtivo },
                { key: "novidade", label: "Marcar como novidade", val: novidade, set: setNovidade },
                { key: "promocao", label: "Em promoção", val: promocao, set: setPromocao },
              ].map(({ key, label, val, set }) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-background p-3 text-sm transition-colors hover:bg-accent"
                >
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={val}
                    onChange={(e) => set(e.target.checked)}
                    className="h-4 w-4 accent-foreground"
                  />
                </label>
              ))}
            </div>
            {promocao && (
              <div className="mt-3 space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Detalhes da promoção
                </p>
                <Field label="Preço promocional *">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      R$
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={precoPromocional}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setPrecoPromocional(isNaN(val) ? "" : Math.max(0, val).toString());
                      }}
                      placeholder="0,00"
                      className="input pl-9"
                    />
                  </div>
                  {precoPromocional && Number(precoPromocional) >= 0 && Number(precoPromocional) < preco && preco > 0 && (
                    <p className="mt-1.5 text-xs font-medium text-primary">
                      Desconto de {Math.round(((preco - Number(precoPromocional)) / preco) * 100)}%
                    </p>
                  )}
                </Field>
                <Field label="Válida até *">
                  <input
                    type="datetime-local"
                    value={promocaoAte}
                    onChange={(e) => setPromocaoAte(e.target.value)}
                    className="input"
                  />
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    A hora é opcional; se omitida, considera-se 00:00.
                  </p>
                </Field>
              </div>
            )}
          </Card>
        </div>
      </div>

      <div className="sticky bottom-4 z-10 flex flex-col-reverse gap-2 rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur-md sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => nav({ to: "/admin" })}
          className="rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
        >
          Cancelar
        </button>
        <button
          disabled={saving}
          className="btn-shine inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-6 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar produto"}
        </button>
      </div>
    </form>
  );
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-base font-semibold">{title}</h3>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

