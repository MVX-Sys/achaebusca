export type OpcaoPersonalizacao = {
  id: string;
  label: string;
  preco: number;
};

export const OPCOES_OCULOS: OpcaoPersonalizacao[] = [
  { id: "oculos-2-hastes", label: "2 Hastes", preco: 2 },
  { id: "oculos-1-haste", label: "1 Haste", preco: 1 },
  { id: "oculos-2-lentes", label: "2 Lentes", preco: 2 },
  { id: "oculos-1-lente", label: "1 Lente", preco: 1 },
];

export const OPCOES_CASE: OpcaoPersonalizacao[] = [
  { id: "case", label: "Case", preco: 1 },
];

export const OPCOES_LENCO: OpcaoPersonalizacao[] = [
  { id: "lenco", label: "Lenço", preco: 1 },
];

// Sandálias com pala (parte de cima do peito do pé)
export const OPCOES_SANDALIA_PALA: OpcaoPersonalizacao[] = [
  { id: "sandalia-pala", label: "Pala", preco: 2 },
  { id: "sandalia-calcanhar", label: "Calcanhar", preco: 1 },
  { id: "sandalia-lateral", label: "Lateral", preco: 1 },
];

// Sandálias com regulagem (Birkens)
export const OPCOES_SANDALIA_REGULAGEM: OpcaoPersonalizacao[] = [
  { id: "birken-regulagem-par", label: "Regulagem no par", preco: 1 },
  { id: "birken-lateral", label: "Lateral", preco: 1 },
  { id: "birken-calcanhar", label: "Calcanhar", preco: 1 },
];

// Bermudas: personalização única (+R$5), sem opções internas —
// os detalhes são combinados em contato com o cliente.
export const OPCAO_BERMUDA: OpcaoPersonalizacao = {
  id: "bermuda-personalizada",
  label: "Personalizada",
  preco: 5,
};

const norm = (s?: string | null) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

// Peças de vestuário sem personalização
const semPersonalizacao = ["moletom", "canguru", "careca", "regata", "oversized", "oversize"];

export function isBermudaPersonalizavel(
  produtoNome?: string | null,
  categoriaNome?: string | null,
  personalizacaoTipo?: string | null,
): boolean {
  const nome = norm(produtoNome);
  const tipo = norm(personalizacaoTipo);
  if (semPersonalizacao.some((t) => nome.includes(t) || tipo.includes(t))) return false;
  return nome.includes("bermuda") || tipo.includes("bermuda") || norm(categoriaNome).includes("bermuda");
}

export type GrupoPersonalizacao = {
  titulo: string;
  opcoes: OpcaoPersonalizacao[];
};

export function getGruposPersonalizacao(
  produtoNome?: string | null,
  categoriaNome?: string | null,
  personalizacaoTipo?: string | null,
): GrupoPersonalizacao[] {
  const nome = norm(produtoNome);
  const cat = norm(categoriaNome);
  const tipo = norm(personalizacaoTipo);

  if (semPersonalizacao.some((t) => nome.includes(t) || tipo.includes(t))) {
    return [];
  }

  if (isBermudaPersonalizavel(produtoNome, categoriaNome, personalizacaoTipo)) {
    // Bermudas não têm opções internas: apenas o botão "Personalizar Produto"
    // com acréscimo fixo de R$5 (OPCAO_BERMUDA).
    return [];
  }

  if (nome.includes("case") || nome.includes("estojo")) {
    return [{ titulo: "Case", opcoes: OPCOES_CASE }];
  }
  if (nome.includes("lenco")) {
    return [{ titulo: "Lenço", opcoes: OPCOES_LENCO }];
  }

  if (cat.includes("oculos") || nome.includes("oculos") || tipo.includes("oculos")) {
    return [
      { titulo: "Óculos", opcoes: OPCOES_OCULOS },
      { titulo: "Case", opcoes: OPCOES_CASE },
      { titulo: "Lenço", opcoes: OPCOES_LENCO },
    ];
  }

  const termosSandalia = [
    "chinelo",
    "sandal",
    "birken",
    "slide",
    "papete",
    "rasteir",
    "tamanco",
    "havaian",
    "flip",
    "anabela",
  ];
  const ehSandalia = termosSandalia.some(
    (t) => cat.includes(t) || nome.includes(t) || tipo.includes(t),
  );

  if (ehSandalia) {
    const comRegulagem =
      nome.includes("birken") || nome.includes("regulagem") || tipo.includes("birken");
    return [
      comRegulagem
        ? { titulo: "Sandália com regulagem", opcoes: OPCOES_SANDALIA_REGULAGEM }
        : { titulo: "Sandália com pala", opcoes: OPCOES_SANDALIA_PALA },
    ];
  }

  return [];
}

// ================= Personalizações definidas por produto =================
// Cada produto guarda a lista de personalizações disponíveis (coluna
// produtos.personalizacoes). As listas acima servem apenas como atalhos
// ("modelos") no formulário do admin.

export type OpcaoProduto = OpcaoPersonalizacao & { grupo?: string };

export const MODELOS_PERSONALIZACAO: GrupoPersonalizacao[] = [
  { titulo: "Óculos", opcoes: OPCOES_OCULOS },
  { titulo: "Case", opcoes: OPCOES_CASE },
  { titulo: "Lenço", opcoes: OPCOES_LENCO },
  { titulo: "Sandália com pala", opcoes: OPCOES_SANDALIA_PALA },
  { titulo: "Sandália com regulagem", opcoes: OPCOES_SANDALIA_REGULAGEM },
  { titulo: "Bermuda", opcoes: [OPCAO_BERMUDA] },
];

export function parsePersonalizacoes(raw: unknown): OpcaoProduto[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o: any) => o && typeof o.id === "string" && typeof o.label === "string")
    .map((o: any) => ({
      id: o.id,
      label: o.label,
      preco: Math.max(0, Number(o.preco) || 0),
      grupo: typeof o.grupo === "string" ? o.grupo : "",
    }));
}

export function agruparPersonalizacoes(opcoes: OpcaoProduto[]): GrupoPersonalizacao[] {
  const m = new Map<string, OpcaoPersonalizacao[]>();
  for (const o of opcoes) {
    const g = o.grupo?.trim() || "Opções";
    if (!m.has(g)) m.set(g, []);
    m.get(g)!.push({ id: o.id, label: o.label, preco: o.preco });
  }
  return [...m.entries()].map(([titulo, opcoes]) => ({ titulo, opcoes }));
}
