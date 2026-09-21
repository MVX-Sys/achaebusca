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

// Bermudas
export const OPCOES_BERMUDA: OpcaoPersonalizacao[] = [
  { id: "bermuda-dtf", label: "DTF", preco: 3 },
  { id: "bermuda-bordado", label: "Bordado", preco: 5 },
];

const norm = (s?: string | null) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

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

  // Peças de vestuário sem personalização
  const semPersonalizacao = ["moletom", "canguru", "careca", "regata", "oversized", "oversize"];
  if (semPersonalizacao.some((t) => nome.includes(t) || tipo.includes(t))) {
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
