export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          acao: string
          criado_em: string
          descricao: string | null
          detalhes: Json | null
          entidade: string
          entidade_id: string | null
          id: string
          user_email: string | null
          user_id: string
        }
        Insert: {
          acao: string
          criado_em?: string
          descricao?: string | null
          detalhes?: Json | null
          entidade: string
          entidade_id?: string | null
          id?: string
          user_email?: string | null
          user_id: string
        }
        Update: {
          acao?: string
          criado_em?: string
          descricao?: string | null
          detalhes?: Json | null
          entidade?: string
          entidade_id?: string | null
          id?: string
          user_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      atendentes: {
        Row: {
          ativo: boolean | null
          cargo: string | null
          criado_em: string | null
          foto_path: string | null
          id: string
          nome: string
          whatsapp: string
        }
        Insert: {
          ativo?: boolean | null
          cargo?: string | null
          criado_em?: string | null
          foto_path?: string | null
          id?: string
          nome: string
          whatsapp: string
        }
        Update: {
          ativo?: boolean | null
          cargo?: string | null
          criado_em?: string | null
          foto_path?: string | null
          id?: string
          nome?: string
          whatsapp?: string
        }
        Relationships: []
      }
      categorias: {
        Row: {
          criado_em: string
          hash_id: string | null
          id: string
          nome: string
          ordem: number
          slug: string
        }
        Insert: {
          criado_em?: string
          hash_id?: string | null
          id?: string
          nome: string
          ordem?: number
          slug: string
        }
        Update: {
          criado_em?: string
          hash_id?: string | null
          id?: string
          nome?: string
          ordem?: number
          slug?: string
        }
        Relationships: []
      }
      cupons: {
        Row: {
          ativo: boolean
          categorias_ids: string[] | null
          codigo: string
          created_at: string | null
          id: string
          preco_minimo_pedido: number | null
          produtos_ids: string[] | null
          quantidade_minima_itens: number
          tipo_desconto: string
          validade: string | null
          valor_desconto: number
        }
        Insert: {
          ativo?: boolean
          categorias_ids?: string[] | null
          codigo: string
          created_at?: string | null
          id?: string
          preco_minimo_pedido?: number | null
          produtos_ids?: string[] | null
          quantidade_minima_itens?: number
          tipo_desconto?: string
          validade?: string | null
          valor_desconto: number
        }
        Update: {
          ativo?: boolean
          categorias_ids?: string[] | null
          codigo?: string
          created_at?: string | null
          id?: string
          preco_minimo_pedido?: number | null
          produtos_ids?: string[] | null
          quantidade_minima_itens?: number
          tipo_desconto?: string
          validade?: string | null
          valor_desconto?: number
        }
        Relationships: []
      }
      hero_slides: {
        Row: {
          ativo: boolean
          created_at: string | null
          id: string
          media_url: string | null
          ordem: number
          subtitulo: string | null
          tipo: Database["public"]["Enums"]["hero_type"]
          titulo: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string | null
          id?: string
          media_url?: string | null
          ordem?: number
          subtitulo?: string | null
          tipo?: Database["public"]["Enums"]["hero_type"]
          titulo: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string | null
          id?: string
          media_url?: string | null
          ordem?: number
          subtitulo?: string | null
          tipo?: Database["public"]["Enums"]["hero_type"]
          titulo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      imagens_produto: {
        Row: {
          criado_em: string
          id: string
          ordem: number
          principal: boolean
          produto_id: string
          storage_path: string
        }
        Insert: {
          criado_em?: string
          id?: string
          ordem?: number
          principal?: boolean
          produto_id: string
          storage_path: string
        }
        Update: {
          criado_em?: string
          id?: string
          ordem?: number
          principal?: boolean
          produto_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "imagens_produto_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          atendente_id: string | null
          cliente_nome: string | null
          cliente_whatsapp: string | null
          criado_em: string | null
          cupom_codigo: string | null
          desconto_cupom: number | null
          endereco: Json | null
          forma_envio: string
          forma_pagamento: string
          id: string
          observacoes: string | null
          status: string
          total: number
          user_id: string
        }
        Insert: {
          atendente_id?: string | null
          cliente_nome?: string | null
          cliente_whatsapp?: string | null
          criado_em?: string | null
          cupom_codigo?: string | null
          desconto_cupom?: number | null
          endereco?: Json | null
          forma_envio: string
          forma_pagamento: string
          id?: string
          observacoes?: string | null
          status?: string
          total: number
          user_id: string
        }
        Update: {
          atendente_id?: string | null
          cliente_nome?: string | null
          cliente_whatsapp?: string | null
          criado_em?: string | null
          cupom_codigo?: string | null
          desconto_cupom?: number | null
          endereco?: Json | null
          forma_envio?: string
          forma_pagamento?: string
          id?: string
          observacoes?: string | null
          status?: string
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_atendente_id_fkey"
            columns: ["atendente_id"]
            isOneToOne: false
            referencedRelation: "atendentes"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_itens: {
        Row: {
          detalhes: Json | null
          id: string
          pedido_id: string
          preco_unitario: number
          produto_id: string | null
          quantidade: number
          variacao_id: string | null
        }
        Insert: {
          detalhes?: Json | null
          id?: string
          pedido_id: string
          preco_unitario: number
          produto_id?: string | null
          quantidade: number
          variacao_id?: string | null
        }
        Update: {
          detalhes?: Json | null
          id?: string
          pedido_id?: string
          preco_unitario?: number
          produto_id?: string | null
          quantidade?: number
          variacao_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_itens_variacao_id_fkey"
            columns: ["variacao_id"]
            isOneToOne: false
            referencedRelation: "variacoes_produto"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          ativo: boolean
          categoria_id: string | null
          codigo_base: string
          criado_em: string
          descricao: string | null
          hash_id: string | null
          id: string
          marca: string | null
          nome: string
          novidade: boolean
          ordem: number
          personalizacao_tipo: string | null
          preco: number
          preco_promocional: number | null
          promocao: boolean
          promocao_ate: string | null
        }
        Insert: {
          ativo?: boolean
          categoria_id?: string | null
          codigo_base: string
          criado_em?: string
          descricao?: string | null
          hash_id?: string | null
          id?: string
          marca?: string | null
          nome: string
          novidade?: boolean
          ordem?: number
          personalizacao_tipo?: string | null
          preco: number
          preco_promocional?: number | null
          promocao?: boolean
          promocao_ate?: string | null
        }
        Update: {
          ativo?: boolean
          categoria_id?: string | null
          codigo_base?: string
          criado_em?: string
          descricao?: string | null
          hash_id?: string | null
          id?: string
          marca?: string | null
          nome?: string
          novidade?: boolean
          ordem?: number
          personalizacao_tipo?: string | null
          preco?: number
          preco_promocional?: number | null
          promocao?: boolean
          promocao_ate?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produtos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      site_config: {
        Row: {
          hero_media_url: string | null
          hero_subtitle: string | null
          hero_title: string | null
          hero_type: string
          id: string
          updated_at: string | null
        }
        Insert: {
          hero_media_url?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          hero_type?: string
          id?: string
          updated_at?: string | null
        }
        Update: {
          hero_media_url?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          hero_type?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      solicitacoes_reposicao: {
        Row: {
          atualizado_em: string
          cliente_nome: string
          cliente_whatsapp: string
          cor: string
          criado_em: string
          id: string
          observacao: string | null
          produto_id: string
          status: string
          tamanho: string
        }
        Insert: {
          atualizado_em?: string
          cliente_nome: string
          cliente_whatsapp: string
          cor: string
          criado_em?: string
          id?: string
          observacao?: string | null
          produto_id: string
          status?: string
          tamanho: string
        }
        Update: {
          atualizado_em?: string
          cliente_nome?: string
          cliente_whatsapp?: string
          cor?: string
          criado_em?: string
          id?: string
          observacao?: string | null
          produto_id?: string
          status?: string
          tamanho?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_reposicao_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          created_at: string
          id: string
          permission: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      variacoes_produto: {
        Row: {
          criado_em: string
          hex_cor: string
          id: string
          nome_cor: string
          produto_id: string
          quantidade_estoque: number
          tamanho: string
        }
        Insert: {
          criado_em?: string
          hex_cor?: string
          id?: string
          nome_cor: string
          produto_id: string
          quantidade_estoque?: number
          tamanho: string
        }
        Update: {
          criado_em?: string
          hex_cor?: string
          id?: string
          nome_cor?: string
          produto_id?: string
          quantidade_estoque?: number
          tamanho?: string
        }
        Relationships: [
          {
            foreignKeyName: "variacoes_produto_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_list_users: {
        Args: never
        Returns: {
          created_at: string
          email: string
          email_confirmed_at: string
          id: string
          last_sign_in_at: string
          phone: string
        }[]
      }
      decrement_stock: {
        Args: { amount: number; var_id: string }
        Returns: undefined
      }
      has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      product_color_letter: { Args: { _produto_id: string }; Returns: string }
      set_pedido_status: {
        Args: { _pedido_id: string; _status: string }
        Returns: undefined
      }
      set_produtos_ordem: { Args: { _ids: string[] }; Returns: undefined }
      slug_upper: { Args: { _txt: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "funcionario" | "user"
      hero_type: "gradient" | "image" | "video"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "funcionario", "user"],
      hero_type: ["gradient", "image", "video"],
    },
  },
} as const
