import * as XLSX from 'xlsx'

// Datas COMO OBJETO Date (jeito que o Posseidon manda — número serial de data do Excel)
const hoje = new Date()
const dataA = hoje
const dataB = new Date(hoje.getTime() - 2 * 86400000)
const dataC = new Date(hoje.getTime() - 7 * 86400000)

const linhas = [
  // TESTE-001: 1 item, cliente com nome feio
  { 'ID Venda': 'TESTE-001', 'Nome Cliente': 'COMERCIO DE VARIEDADES JOSE DA SILVA EIRELI ME',
    'Vendedor': 'v1 - Sérgio', 'Cidade': 'ITABAIANA', 'Data da Venda': dataA,
    'Produto': 'SACOLA PLASTICA CAMISETA 30X40', 'Grupo': 'SACOLA PLASTICA',
    'Quantidade': 50, 'Valor': 250.00 },

  // TESTE-002: 3 itens (caso da Demanda 2 — dividir)
  { 'ID Venda': 'TESTE-002', 'Nome Cliente': 'LOJA DE PRESENTES JOAO PAULO LTDA',
    'Vendedor': 'v4 - Michele', 'Cidade': 'ARACAJU', 'Data da Venda': dataA,
    'Produto': 'SACOLA PAPEL ALCA TORCIDA PEQUENA', 'Grupo': 'SACOLA DE PAPEL',
    'Quantidade': 100, 'Valor': 980.00 },
  { 'ID Venda': 'TESTE-002', 'Nome Cliente': 'LOJA DE PRESENTES JOAO PAULO LTDA',
    'Vendedor': 'v4 - Michele', 'Cidade': 'ARACAJU', 'Data da Venda': dataA,
    'Produto': 'SACOLA PAPEL ALCA TORCIDA MEDIA', 'Grupo': 'SACOLA DE PAPEL',
    'Quantidade': 80, 'Valor': 980.00 },
  { 'ID Venda': 'TESTE-002', 'Nome Cliente': 'LOJA DE PRESENTES JOAO PAULO LTDA',
    'Vendedor': 'v4 - Michele', 'Cidade': 'ARACAJU', 'Data da Venda': dataA,
    'Produto': 'TAG PERSONALIZADA CARTAO 6X9', 'Grupo': 'GRAFICA',
    'Quantidade': 500, 'Valor': 980.00 },

  // TESTE-003: 5 itens em 3 linhas diferentes
  { 'ID Venda': 'TESTE-003', 'Nome Cliente': 'ARMARINHO CENTRAL COMERCIO LTDA ME',
    'Vendedor': 'v1 - Sérgio', 'Cidade': 'NOSSA SENHORA DA GLORIA', 'Data da Venda': dataB,
    'Produto': 'SACOLA PAPEL ALCA CHATA G', 'Grupo': 'SACOLA DE PAPEL',
    'Quantidade': 200, 'Valor': 2150.00 },
  { 'ID Venda': 'TESTE-003', 'Nome Cliente': 'ARMARINHO CENTRAL COMERCIO LTDA ME',
    'Vendedor': 'v1 - Sérgio', 'Cidade': 'NOSSA SENHORA DA GLORIA', 'Data da Venda': dataB,
    'Produto': 'SACOLA PAPEL ALCA CHATA M', 'Grupo': 'SACOLA DE PAPEL',
    'Quantidade': 200, 'Valor': 2150.00 },
  { 'ID Venda': 'TESTE-003', 'Nome Cliente': 'ARMARINHO CENTRAL COMERCIO LTDA ME',
    'Vendedor': 'v1 - Sérgio', 'Cidade': 'NOSSA SENHORA DA GLORIA', 'Data da Venda': dataB,
    'Produto': 'SACOLA PLASTICA CAMISETA 40X50', 'Grupo': 'SACOLA PLASTICA',
    'Quantidade': 300, 'Valor': 2150.00 },
  { 'ID Venda': 'TESTE-003', 'Nome Cliente': 'ARMARINHO CENTRAL COMERCIO LTDA ME',
    'Vendedor': 'v1 - Sérgio', 'Cidade': 'NOSSA SENHORA DA GLORIA', 'Data da Venda': dataB,
    'Produto': 'SACOLA PLASTICA CAMISETA 50X60', 'Grupo': 'SACOLA PLASTICA',
    'Quantidade': 300, 'Valor': 2150.00 },
  { 'ID Venda': 'TESTE-003', 'Nome Cliente': 'ARMARINHO CENTRAL COMERCIO LTDA ME',
    'Vendedor': 'v1 - Sérgio', 'Cidade': 'NOSSA SENHORA DA GLORIA', 'Data da Venda': dataB,
    'Produto': 'ETIQUETA ADESIVA REDONDA', 'Grupo': 'GRAFICA',
    'Quantidade': 1000, 'Valor': 2150.00 },

  // TESTE-004: cidade fora de rota
  { 'ID Venda': 'TESTE-004', 'Nome Cliente': 'MARIA APARECIDA COMERCIO',
    'Vendedor': 'v5 - Marcos', 'Cidade': 'CIDADE INEXISTENTE TESTE', 'Data da Venda': dataC,
    'Produto': 'SACOLA PAPEL KRAFT P', 'Grupo': 'SACOLA DE PAPEL',
    'Quantidade': 60, 'Valor': 540.00 },
  { 'ID Venda': 'TESTE-004', 'Nome Cliente': 'MARIA APARECIDA COMERCIO',
    'Vendedor': 'v5 - Marcos', 'Cidade': 'CIDADE INEXISTENTE TESTE', 'Data da Venda': dataC,
    'Produto': 'SACOLA PAPEL KRAFT M', 'Grupo': 'SACOLA DE PAPEL',
    'Quantidade': 40, 'Valor': 540.00 },

  // TESTE-005: outro vendedor
  { 'ID Venda': 'TESTE-005', 'Nome Cliente': 'DISTRIBUIDORA FERREIRA LTDA',
    'Vendedor': 'v8 - Jedeane', 'Cidade': 'PROPRIA', 'Data da Venda': dataA,
    'Produto': 'SACOLA PLASTICA BOCA PALHACO 30X40', 'Grupo': 'SACOLA PLASTICA',
    'Quantidade': 200, 'Valor': 750.00 },

  // TESTE-006: 4 itens mistos
  { 'ID Venda': 'TESTE-006', 'Nome Cliente': 'COMERCIAL TRES IRMAOS LTDA EPP',
    'Vendedor': 'v1 - Sérgio', 'Cidade': 'RIBEIROPOLIS', 'Data da Venda': dataA,
    'Produto': 'SACOLA PAPEL ALCA TORCIDA P', 'Grupo': 'SACOLA DE PAPEL',
    'Quantidade': 150, 'Valor': 1620.00 },
  { 'ID Venda': 'TESTE-006', 'Nome Cliente': 'COMERCIAL TRES IRMAOS LTDA EPP',
    'Vendedor': 'v1 - Sérgio', 'Cidade': 'RIBEIROPOLIS', 'Data da Venda': dataA,
    'Produto': 'SACOLA PAPEL ALCA TORCIDA M', 'Grupo': 'SACOLA DE PAPEL',
    'Quantidade': 150, 'Valor': 1620.00 },
  { 'ID Venda': 'TESTE-006', 'Nome Cliente': 'COMERCIAL TRES IRMAOS LTDA EPP',
    'Vendedor': 'v1 - Sérgio', 'Cidade': 'RIBEIROPOLIS', 'Data da Venda': dataA,
    'Produto': 'CARTAO DE VISITA 4X4 CORES', 'Grupo': 'GRAFICA',
    'Quantidade': 1000, 'Valor': 1620.00 },
  { 'ID Venda': 'TESTE-006', 'Nome Cliente': 'COMERCIAL TRES IRMAOS LTDA EPP',
    'Vendedor': 'v1 - Sérgio', 'Cidade': 'RIBEIROPOLIS', 'Data da Venda': dataA,
    'Produto': 'FLYER A5 4X0 COR', 'Grupo': 'GRAFICA',
    'Quantidade': 500, 'Valor': 1620.00 },
]

// monta a planilha — IMPORTANTE: cellDates: true para que as datas saiam como datas nativas
const ws = XLSX.utils.json_to_sheet(linhas, { cellDates: true })
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'Pedidos')

ws['!cols'] = [
  { wch: 12 }, { wch: 42 }, { wch: 18 }, { wch: 22 }, { wch: 12 },
  { wch: 36 }, { wch: 18 }, { wch: 10 }, { wch: 10 },
]

const out = '/mnt/user-data/outputs/pedidos_teste_posseidon.xlsx'
XLSX.writeFile(wb, out, { cellDates: true })
console.log('Gerado:', out)

// Verifica relendo o arquivo do mesmo jeito que o sistema lê
const lido = XLSX.readFile(out, { type: 'array', cellDates: true })
const linhasLidas = XLSX.utils.sheet_to_json(lido.Sheets['Pedidos'], { defval: null })
console.log('Primeira linha relida:', JSON.stringify(linhasLidas[0]))
console.log('Tipo da data lida:', typeof linhasLidas[0]['Data da Venda'], linhasLidas[0]['Data da Venda'] instanceof Date)
// Testa o new Date() que o sistema vai fazer:
try {
  const iso = new Date(linhasLidas[0]['Data da Venda']).toISOString()
  console.log('toISOString OK:', iso)
} catch (err) {
  console.error('ERRO toISOString:', err.message)
}
