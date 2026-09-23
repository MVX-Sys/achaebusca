import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import QRCode from "qrcode";
import "jspdf-autotable";
import { brl } from "./format";
import { BRAND } from "./config";
import type { ProductListItem } from "./products";
import { type CartItem, itemPrecoEfetivo, formatPersonalizacoes } from "./cart";
import { getGruposPersonalizacao } from "./personalizacao";

const fetchImageAsBase64 = async (url: string): Promise<string> => {
  if (!url) return "";
  try {
    // Add cache busting and ensure anonymous cross-origin
    const separator = url.includes('?') ? '&' : '?';
    const proxyUrl = `${url}${separator}t=${Date.now()}`;
    
    const response = await fetch(proxyUrl, { 
      mode: 'cors', 
      credentials: 'omit',
      cache: 'no-store'
    });
    
    if (!response.ok) {
      console.warn(`Failed to fetch image: ${response.status} ${response.statusText}`);
      return "";
    }
    
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        if (result && result.startsWith('data:image')) {
          resolve(result);
        } else {
          resolve("");
        }
      };
      reader.onerror = () => {
        console.error("FileReader error");
        resolve("");
      };
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Error fetching image for PDF:", error);
    return "";
  }
};

const ORANGE: [number, number, number] = [255, 85, 0];
const DARK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];
const LINE: [number, number, number] = [229, 231, 235];

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "arquivo";
}

function header(doc: jsPDF, title: string) {
  doc.setFillColor(...ORANGE);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(BRAND, 14, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(title, doc.internal.pageSize.getWidth() - 14, 14, { align: "right" });
  doc.setTextColor(...DARK);
}

function footer(doc: jsPDF) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...LINE);
  doc.line(14, h - 16, w - 14, h - 16);
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(
    `${BRAND} · Documento gerado em ${new Date().toLocaleString("pt-BR")}`,
    14,
    h - 9,
  );
  doc.setTextColor(...DARK);
}

export async function downloadProductPDF(p: ProductListItem, categoriaNome?: string) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  header(doc, "Ficha do produto");

  let y = 32;

  // Replace image with QR Code
  let qrCodeAdded = false;
  try {
    const qrContent = typeof window !== 'undefined' 
      ? `${window.location.origin}/produto/${p.id}` 
      : p.id;
    const qrDataUrl = await QRCode.toDataURL(qrContent, {
      margin: 1,
      width: 200,
      color: {
        dark: "#111827",
        light: "#FFFFFF"
      }
    });
    
    if (qrDataUrl) {
      const qrSize = 40;
      doc.addImage(qrDataUrl, "PNG", 14, y, qrSize, qrSize, undefined, 'FAST');
      qrCodeAdded = true;
    }
  } catch (e) {
    console.error("Error generating QR code for product PDF:", e);
  }

  const contentX = qrCodeAdded ? 60 : 14;
  const contentWidth = qrCodeAdded ? 136 : 182;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  const nomeLines = doc.splitTextToSize(p.nome, contentWidth);
  doc.text(nomeLines, contentX, y + 5);
  
  const textY = y + 5 + (nomeLines.length * 6);
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...ORANGE);
  doc.text(brl(p.preco), contentX, textY + 8);
  doc.setTextColor(...DARK);

  y = Math.max(y + 55, textY + 15);
  y += 5;

  const badges: string[] = [];
  if (p.novidade) badges.push("NOVIDADE");
  if (p.promocao) badges.push("PROMOÇÃO");
  if (categoriaNome) badges.push(categoriaNome.toUpperCase());
  if (badges.length) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    let x = 14;
    for (const b of badges) {
      const w = doc.getTextWidth(b) + 6;
      doc.setFillColor(243, 244, 246);
      doc.roundedRect(x, y - 4, w, 6, 1.5, 1.5, "F");
      doc.setTextColor(...DARK);
      doc.text(b, x + 3, y);
      x += w + 3;
    }
    y += 8;
  }

  doc.setDrawColor(...LINE);
  doc.line(14, y, 196, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Descrição", 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const desc = p.descricao?.trim() || "Sem descrição cadastrada.";
  // Preserva quebras de linha substituindo \n por um marcador ou tratando cada linha
  const lines = desc.split(/\r?\n/);
  for (const line of lines) {
    const splitLines = doc.splitTextToSize(line, 182);
    if (y + splitLines.length * 5 > 280) {
      footer(doc);
      doc.addPage();
      header(doc, "Ficha do produto");
      y = 32;
    }
    doc.text(splitLines, 14, y);
    y += splitLines.length * 5;
  }
  y += 6;

  if (p.variacoes.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Grade de Variações", 14, y);
    y += 6;

    // Table header
    doc.setFillColor(249, 250, 251);
    doc.rect(14, y - 4, 182, 7, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...MUTED);
    doc.text("COR", 18, y);
    doc.text("TAMANHO", 90, y);
    doc.text("ESTOQUE", 160, y);
    doc.setTextColor(...DARK);
    y += 5;

    doc.setFont("helvetica", "normal");
    for (const v of p.variacoes) {
      if (y > 270) {
        footer(doc);
        doc.addPage();
        header(doc, "Ficha do produto");
        y = 32;
      }
      doc.setDrawColor(...LINE);
      doc.line(14, y + 1, 196, y + 1);
      y += 5;
      
      // Color dot
      if (v.hex_cor) {
        doc.setFillColor(v.hex_cor);
        doc.setDrawColor(...LINE);
        doc.circle(16, y - 1, 1.5, "F");
      }
      
      doc.text(v.nome_cor, 20, y);
      doc.text(v.tamanho, 90, y);
      doc.text(String(v.quantidade_estoque), 160, y);
      y += 2;
    }
    y += 6;
  }

  const grupos = getGruposPersonalizacao(p.nome, categoriaNome, (p as any).personalizacao_tipo ?? null);
  if (grupos.length) {
    if (y > 250) {
      footer(doc);
      doc.addPage();
      header(doc, "Ficha do produto");
      y = 32;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Personalizações disponíveis", 14, y);
    y += 6;
    for (const g of grupos) {
      if (y > 270) {
        footer(doc);
        doc.addPage();
        header(doc, "Ficha do produto");
        y = 32;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text(g.titulo.toUpperCase(), 14, y);
      doc.setTextColor(...DARK);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      for (const o of g.opcoes) {
        if (y > 275) {
          footer(doc);
          doc.addPage();
          header(doc, "Ficha do produto");
          y = 32;
        }
        doc.text(`• ${o.label}`, 18, y);
        doc.text(`+ ${brl(o.preco)}`, 60, y);
        y += 5;
      }
      y += 2;
    }
  }

  footer(doc);
  doc.save(`produto-${slugify(p.nome)}.pdf`);
}

export type OrderPDFPayload = {
  items: CartItem[];
  total: number;
  formaEnvio: string;
  formaEntrega?: string;
  formaPagamento: string;
  endereco?: {
    cep?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade?: string;
    estado?: string;
    referencia?: string;
  };
  observacoes?: string;
  cliente?: { nome?: string; email?: string; whatsapp?: string };
  cupom?: {
    codigo: string;
    desconto: number;
  };
};

export async function downloadOrderPDF(order: OrderPDFPayload, download = true): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  header(doc, "Resumo do pedido");

  let y = 32;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Pedido", 14, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(new Date().toLocaleString("pt-BR"), 196, y, { align: "right" });
  doc.setTextColor(...DARK);
  y += 8;

  // Dados do cliente
  if (order.cliente) {
    const c = order.cliente;
    const wpp = (c.whatsapp || "").replace(/\D/g, "");
    const wppFmt = wpp.length >= 10 ? `(${wpp.slice(-11, -9) || wpp.slice(0, 2)}) ${wpp.slice(-9, -4)}-${wpp.slice(-4)}` : wpp;
    doc.setFillColor(249, 250, 251);
    doc.rect(14, y - 4, 182, 22, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Cliente", 18, y + 1);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Nome: ${c.nome || "—"}`, 18, y + 7);
    doc.text(`WhatsApp: ${wppFmt || "—"}`, 18, y + 13);
    doc.text(`E-mail: ${c.email || "—"}`, 105, y + 7);
    y += 26;
  }

  // Items table
  doc.setFillColor(249, 250, 251);
  doc.rect(14, y - 4, 182, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("QTD", 18, y);
  doc.text("QR CODE", 32, y);
  doc.text("PRODUTO", 75, y);
  doc.text("UNIT.", 160, y);
  doc.text("SUBTOTAL", 196, y, { align: "right" });
  doc.setTextColor(...DARK);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  for (const it of order.items) {
    if (y > 240) {
      footer(doc);
      doc.addPage();
      header(doc, "Resumo do pedido");
      y = 32;
    }
    
    // Add product QR Code instead of image
    try {
      const qrContent = typeof window !== 'undefined' 
        ? `${window.location.origin}/produto/${it.produtoId}` 
        : it.produtoId;
      const qrDataUrl = await QRCode.toDataURL(qrContent, {
        margin: 1,
        width: 100,
        color: {
          dark: "#111827",
          light: "#FFFFFF"
        }
      });
      
      if (qrDataUrl) {
        const qrSize = 18;
        doc.addImage(qrDataUrl, "PNG", 32, y - 4, qrSize, qrSize, undefined, 'FAST');
      }
    } catch (e) {
      console.error("Error drawing QR code in PDF:", e);
    }

    const perso = formatPersonalizacoes(it);
    const desc = `${it.codigo ? `[${it.codigo}] ` : ""}${it.nome}\n${it.cor} · ${it.tamanho}${perso ? `\nPersonalização: ${perso}` : ""}`;
    const lines = doc.splitTextToSize(desc, 80);
    doc.text(String(it.quantidade), 18, y + 5);
    doc.text(lines, 75, y + 5);
    doc.text(brl(itemPrecoEfetivo(it)), 160, y + 5);
    doc.text(brl(itemPrecoEfetivo(it) * it.quantidade), 196, y + 5, { align: "right" });

    // Link clicável para a página do produto
    const productUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/produto/${it.produtoId}`
        : `/produto/${it.produtoId}`;
    if (typeof window !== "undefined") {
      doc.link(75, y, 85, lines.length * 5 + 6, { url: productUrl });
      const linkY = y + 5 + lines.length * 5;
      doc.setFontSize(8);
      doc.setTextColor(37, 99, 235);
      doc.textWithLink("Ver produto na loja", 75, linkY, { url: productUrl });
      doc.setTextColor(...DARK);
      doc.setFontSize(10);
    }
    
    const rowHeight = Math.max(lines.length * 5 + 12, 24);
    y += rowHeight;
    doc.setDrawColor(...LINE);
    doc.line(14, y - 2, 196, y - 2);
  }

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Total", 150, y);
  doc.setTextColor(...ORANGE);
  doc.text(brl(order.total), 196, y, { align: "right" });
  doc.setTextColor(...DARK);
  y += 10;
  
  if (order.cupom) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`Cupom: ${order.cupom.codigo} (desconto de ${brl(order.cupom.desconto)})`, 14, y);
    y += 6;
  }


  // Envio / pagamento
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Envio e pagamento", 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Forma de envio: ${order.formaEnvio}`, 14, y);
  y += 5;
  if (order.formaEntrega) {
    doc.text(`Forma de entrega: ${order.formaEntrega}`, 14, y);
    y += 5;
  }
  doc.text(`Forma de pagamento: ${order.formaPagamento}`, 14, y);
  y += 8;

  if (order.endereco) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Endereço de entrega", 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const e = order.endereco;
    const linhas = [
      e.cep ? `CEP: ${e.cep}` : null,
      e.logradouro ? `${e.logradouro}, ${e.numero}${e.complemento ? ` — ${e.complemento}` : ""}` : null,
      e.bairro ? `Bairro: ${e.bairro}` : null,
      e.cidade && e.estado ? `Cidade/UF: ${e.cidade}/${e.estado}` : null,
      e.referencia ? `Referência: ${e.referencia}` : null,
    ].filter(Boolean) as string[];
    for (const l of linhas) {
      doc.text(l, 14, y);
      y += 5;
    }
    y += 3;
  }

  if (order.observacoes?.trim()) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Observações", 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const obsLines = doc.splitTextToSize(order.observacoes, 182);
    const splitObs = order.observacoes.split(/\r?\n/);
    for (const line of splitObs) {
      const splitLines = doc.splitTextToSize(line, 182);
      if (y + splitLines.length * 5 > 280) {
        footer(doc);
        doc.addPage();
        header(doc, "Resumo do pedido");
        y = 32;
      }
      doc.text(splitLines, 14, y);
      y += splitLines.length * 5;
    }
  }

  footer(doc);
  const stamp = new Date().toISOString().slice(0, 10);
  const pdfBlob = doc.output("blob");
  if (typeof window !== "undefined" && download) {
    doc.save(`pedido-${BRAND.toLowerCase()}-${stamp}.pdf`);
  }
  return pdfBlob;
}

export type AuditLogExport = {
  criado_em: string;
  user_email: string | null;
  user_id: string;
  acao: string;
  entidade: string;
  entidade_id: string | null;
  descricao: string | null;
  detalhes: Record<string, unknown> | null;
};

function formatDateBR(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

export function downloadAuditCSV(rows: AuditLogExport[]) {
  const headers = ["Data/Hora", "Usuário", "Ação", "Entidade", "ID Entidade", "Descrição", "Detalhes"];
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [headers.map(escape).join(";")];
  for (const r of rows) {
    lines.push(
      [
        formatDateBR(r.criado_em),
        r.user_email ?? r.user_id,
        r.acao,
        r.entidade,
        r.entidade_id ?? "",
        r.descricao ?? "",
        r.detalhes ? JSON.stringify(r.detalhes) : "",
      ]
        .map(escape)
        .join(";"),
    );
  }
  const csv = "\ufeff" + lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `auditoria-${slugify(BRAND)}-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadAuditPDF(rows: AuditLogExport[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  header(doc, "Histórico de auditoria");

  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  let y = 30;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`${rows.length} registro(s)`, 14, y);
  doc.setTextColor(...DARK);
  y += 6;

  const cols = [
    { label: "Data/Hora", x: 14, width: 32 },
    { label: "Usuário", x: 46, width: 55 },
    { label: "Ação", x: 101, width: 32 },
    { label: "Entidade", x: 133, width: 26 },
    { label: "Descrição", x: 159, width: w - 14 - 159 },
  ];

  const drawHead = () => {
    doc.setFillColor(...ORANGE);
    doc.rect(14, y, w - 28, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    for (const c of cols) doc.text(c.label, c.x + 1, y + 5);
    doc.setTextColor(...DARK);
    doc.setFont("helvetica", "normal");
    y += 7;
  };
  drawHead();

  doc.setFontSize(8);
  for (const r of rows) {
    const cells = [
      formatDateBR(r.criado_em),
      r.user_email ?? r.user_id.slice(0, 12),
      r.acao,
      r.entidade,
      r.descricao ?? "",
    ];
    const wrapped = cells.map((v, i) => doc.splitTextToSize(String(v), cols[i].width - 2));
    const rowH = Math.max(...wrapped.map((l) => l.length)) * 4 + 2;
    if (y + rowH > h - 18) {
      footer(doc);
      doc.addPage();
      header(doc, "Histórico de auditoria");
      y = 30;
      drawHead();
      doc.setFontSize(8);
    }
    doc.setDrawColor(...LINE);
    doc.line(14, y + rowH, w - 14, y + rowH);
    for (let i = 0; i < cols.length; i++) {
      doc.text(wrapped[i], cols[i].x + 1, y + 4);
    }
    y += rowH;
  }

  footer(doc);
  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`auditoria-${slugify(BRAND)}-${stamp}.pdf`);
}

export type ProductExportRow = ProductListItem & { categoriaNome?: string };

export function downloadProductsCSV(rows: ProductExportRow[]) {
  const headers = [
    "Nome",
    "Categoria",
    "Preço",
    "Ativo",
    "Novidade",
    "Promoção",
    "Estoque total",
    "Variações",
    "Descrição",
  ];
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [headers.map(escape).join(";")];
  for (const p of rows) {
    const estoque = p.variacoes.reduce((a, v) => a + v.quantidade_estoque, 0);
    const vars = p.variacoes
      .map((v) => `${v.nome_cor}/${v.tamanho} (${v.quantidade_estoque})`)
      .join(" | ");
    lines.push(
      [
        p.nome,
        p.categoriaNome ?? "",
        p.preco.toFixed(2).replace(".", ","),
        p.ativo ? "Sim" : "Não",
        p.novidade ? "Sim" : "Não",
        p.promocao ? "Sim" : "Não",
        estoque,
        vars,
        (p.descricao ?? "").replace(/\s+/g, " ").trim(),
      ]
        .map(escape)
        .join(";"),
    );
  }
  const csv = "\ufeff" + lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `produtos-${slugify(BRAND)}-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadProductsPDF(rows: ProductExportRow[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  header(doc, "Catálogo de produtos");

  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  let y = 30;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`${rows.length} produto(s)`, 14, y);
  doc.setTextColor(...DARK);
  y += 6;

  const cols = [
    { label: "Produto", x: 14, width: 86 },
    { label: "Categoria", x: 100, width: 48 },
    { label: "Preço", x: 148, width: 22 },
    { label: "Estoque", x: 170, width: 20 },
    { label: "Status", x: 190, width: w - 14 - 190 },
  ];

  const drawHead = () => {
    doc.setFillColor(...ORANGE);
    doc.rect(14, y, w - 28, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    for (const c of cols) doc.text(c.label, c.x + 1, y + 5);
    doc.setTextColor(...DARK);
    doc.setFont("helvetica", "normal");
    y += 7;
  };
  drawHead();

  doc.setFontSize(8);
  for (const p of rows) {
    const estoque = p.variacoes.reduce((a, v) => a + v.quantidade_estoque, 0);
    const statusLabel = !p.ativo
      ? "Inativo"
      : estoque <= 0
      ? "Esgotado"
      : p.promocao
      ? "Promoção"
      : p.novidade
      ? "Novidade"
      : "Ativo";
    const cells = [
      p.nome,
      p.categoriaNome ?? "—",
      brl(p.preco),
      String(estoque),
      statusLabel,
    ];
    const wrapped = cells.map((v, i) => doc.splitTextToSize(String(v), cols[i].width - 2));
    const rowH = Math.max(...wrapped.map((l) => l.length)) * 4 + 2;
    if (y + rowH > h - 18) {
      footer(doc);
      doc.addPage();
      header(doc, "Catálogo de produtos");
      y = 30;
      drawHead();
      doc.setFontSize(8);
    }
    doc.setDrawColor(...LINE);
    doc.line(14, y + rowH, w - 14, y + rowH);
    for (let i = 0; i < cols.length; i++) {
      doc.text(wrapped[i], cols[i].x + 1, y + 4);
    }
    y += rowH;
  }

  footer(doc);
  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`produtos-${slugify(BRAND)}-${stamp}.pdf`);
}

// ---- Generic tabular export ----

export type TableColumn = { label: string; width: number };

export function downloadTableCSV(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [headers.map(escape).join(";")];
  for (const r of rows) lines.push(r.map(escape).join(";"));
  const csv = "\ufeff" + lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${slugify(filename)}-${slugify(BRAND)}-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadTablePDF(
  title: string,
  filename: string,
  columns: TableColumn[],
  rows: (string | number | null | undefined)[][],
) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  header(doc, title);

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = 30;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`${rows.length} registro(s)`, 14, y);
  doc.setTextColor(...DARK);
  y += 6;

  const totalW = columns.reduce((a, c) => a + c.width, 0);
  const scale = (pageW - 28) / totalW;
  const cols = columns.map((c, i) => ({
    label: c.label,
    width: c.width * scale,
    x: 14 + columns.slice(0, i).reduce((a, cc) => a + cc.width * scale, 0),
  }));

  const drawHead = () => {
    doc.setFillColor(...ORANGE);
    doc.rect(14, y, pageW - 28, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    for (const c of cols) doc.text(c.label, c.x + 1, y + 5);
    doc.setTextColor(...DARK);
    doc.setFont("helvetica", "normal");
    y += 7;
  };
  drawHead();

  doc.setFontSize(8);
  for (const r of rows) {
    const wrapped = cols.map((c, i) => doc.splitTextToSize(String(r[i] ?? ""), c.width - 2));
    const rowH = Math.max(...wrapped.map((l) => l.length)) * 4 + 2;
    if (y + rowH > pageH - 18) {
      footer(doc);
      doc.addPage();
      header(doc, title);
      y = 30;
      drawHead();
      doc.setFontSize(8);
    }
    doc.setDrawColor(...LINE);
    doc.line(14, y + rowH, pageW - 14, y + rowH);
    for (let i = 0; i < cols.length; i++) doc.text(wrapped[i], cols[i].x + 1, y + 4);
    y += rowH;
  }

  footer(doc);
  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`${slugify(filename)}-${slugify(BRAND)}-${stamp}.pdf`);
}

export function downloadTableXLSX(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
) {
  const aoa: (string | number)[][] = [headers, ...rows.map((r) => r.map((v) => (v == null ? "" : v)))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = headers.map((h, i) => {
    const maxLen = Math.max(
      h.length,
      ...rows.map((r) => String(r[i] ?? "").length),
    );
    return { wch: Math.min(Math.max(maxLen + 2, 10), 60) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || "Dados");
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${slugify(filename)}-${slugify(BRAND)}-${stamp}.xlsx`);
}

export function downloadProductsXLSX(rows: ProductExportRow[]) {
  const headers = [
    "Nome",
    "Categoria",
    "Preço",
    "Ativo",
    "Novidade",
    "Promoção",
    "Estoque total",
    "Variações",
    "Descrição",
  ];
  const data = rows.map((p) => {
    const estoque = p.variacoes.reduce((a, v) => a + v.quantidade_estoque, 0);
    const vars = p.variacoes
      .map((v) => `${v.nome_cor}/${v.tamanho} (${v.quantidade_estoque})`)
      .join(" | ");
    return [
      p.nome,
      p.categoriaNome ?? "",
      p.preco,
      p.ativo ? "Sim" : "Não",
      p.novidade ? "Sim" : "Não",
      p.promocao ? "Sim" : "Não",
      estoque,
      vars,
      (p.descricao ?? "").replace(/\s+/g, " ").trim(),
    ] as (string | number)[];
  });
  downloadTableXLSX("produtos", "Produtos", headers, data);
}

export function downloadRelatorioVendasPDF(
  titulo: string,
  filename: string,
  rows: string[][]
) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  header(doc, titulo);

  let y = 32;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Resumo de Desempenho", 14, y);
  y += 10;

  (doc as any).autoTable({
    startY: y,
    head: [["Atendente", "Pedidos", "Vendido", "Ticket Médio"]],
    body: rows,
    theme: "striped",
    headStyles: { fillColor: ORANGE },
    margin: { left: 14, right: 14 },
    styles: { font: "helvetica", fontSize: 9 },
  });

  footer(doc);
  doc.save(`${filename}.pdf`);
}
