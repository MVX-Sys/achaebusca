export type PermissionKey =
  | "produtos.manage"
  | "solicitacoes.manage"
  | "auditoria.view"
  | "backup.manage"
  | "usuarios.manage"
  | "pedidos.view"
  | "cupons.manage"
  | "admin.advanced";

export const ALL_PERMISSIONS: {
  key: PermissionKey;
  label: string;
  description: string;
}[] = [
  {
    key: "produtos.manage",
    label: "Gerenciar produtos",
    description: "Criar, editar e excluir produtos, categorias, imagens e variações.",
  },
  {
    key: "solicitacoes.manage",
    label: "Gerenciar reposições",
    description: "Ver e atualizar solicitações de reposição de estoque.",
  },
  {
    key: "auditoria.view",
    label: "Ver auditoria",
    description: "Consultar o histórico de ações do painel.",
  },
  {
    key: "backup.manage",
    label: "Gerenciar backup",
    description: "Exportar e restaurar backups dos produtos.",
  },
  {
    key: "usuarios.manage",
    label: "Gerenciar usuários",
    description: "Alterar papéis e permissões de outros usuários.",
  },
  {
    key: "pedidos.view",
    label: "Ver Pedidos e Vendas",
    description: "Visualizar histórico de pedidos e relatórios de vendas.",
  },
  {
    key: "cupons.manage",
    label: "Gerenciar cupons",
    description: "Criar, editar e excluir cupons de desconto.",
  },
  {
    key: "admin.advanced",
    label: "Acesso técnico",
    description: "Abas técnicas do painel, como Manutenção e PIX.",
  },
];

export type UserRoleKind = "admin" | "funcionario" | "cliente";

export function classifyRole(roles: string[]): UserRoleKind {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("funcionario")) return "funcionario";
  return "cliente";
}

export function hasAdminPanelAccess(
  kind: UserRoleKind,
  permissions: string[],
): boolean {
  if (kind === "admin") return true;
  if (kind === "funcionario") return permissions.length > 0;
  return false;
}

export function canAccess(
  kind: UserRoleKind,
  permissions: string[],
  perm: PermissionKey,
): boolean {
  if (kind === "admin") return true;
  return permissions.includes(perm);
}
