// ============================================================
// JC SACOLAS — utils.js
// Regras de negócio: linhas, vendedores, rotas, prazos e parsing
// ============================================================

// ---------- LINHAS DE PRODUÇÃO (3 — Laser REMOVIDO) ----------
export const MODO_ORDER = ['PRODUCAO', 'GLICHE', 'GRAFICA']

export const MODO_NM = {
  PRODUCAO: 'PRODUÇÃO',
  GLICHE: 'GLICHE',
  GRAFICA: 'GRÁFICA',
}

export const MODO_DESC = {
  PRODUCAO: 'Silk screen (sacolas de papel)',
  GLICHE: 'Flexográfica (sacolas plásticas)',
  GRAFICA: 'Offset (inclui o antigo laser)',
}

export const MODO_COR = {
  PRODUCAO: '#1A5FB4', // azul
  GLICHE: '#1C7A4E',   // verde
  GRAFICA: '#C2410C',  // laranja
}

// ============================================================
// SEED — dados atuais embutidos, no FORMATO NOVO.
// Usado pelo botão "Importar dados atuais" na tela de Cadastros.
// Depois de importados, os cadastros passam a viver no Firestore
// (config/cadastros) e podem ser editados pelo dono/designer.
// ============================================================
export const SEED_VENDEDORES = [
  {
    codigo: 'v1', nome: 'Sérgio', dias: [1, 15],
    rotas: [
      { nome: 'ROTA 01', cidades: ['RIBEIROPOLIS', 'APARECIDA', 'GLORIA', 'MONTE ALEGRE', 'SAO MIGUEL ALEIXO', 'PORTO DA FOLHA', 'PAULO AFONSO', 'DELMIRO GOUVEIA', 'AQUIDABA', 'CEDRO DE SAO JOAO', 'ILHA DAS FLORES', 'NOSSA SENHORA DA GLORIA'] },
      { nome: 'ROTA 02', cidades: ['MOITA BONITA', 'NOSSA SENHORA DAS DORES', 'CAPELA', 'CARMOPOLIS', 'JAPARATUBA', 'SIRIRI', 'MURIBECA', 'LAGOA DA CANOA'] },
      { nome: 'ROTA 03', cidades: ['PROPRIA', 'JAPOATA', 'NEOPOLIS', 'PENEDO', 'CORURIPE', 'ARAPIRACA', 'PORTO REAL DO COLEGIO', 'TEOTONIO VILELA', 'TAQUARANA', 'MINADOR DO NEGRAO', 'PALMEIRA DOS INDIOS', 'JUNQUEIRO', 'SENADOR RUI PALMEIRA', 'LUIS EDUARDO MAGALHAES', 'ARACAJU'] },
    ],
  },
  { codigo: 'v2', nome: 'Pedro', dias: [], rotas: [] },   // preencher rotas/dias
  { codigo: 'v3', nome: 'Elaine', dias: [], rotas: [] },  // preencher rotas/dias
  {
    codigo: 'v4', nome: 'Michele', dias: [10, 25],
    rotas: [
      { nome: 'ROTA 01', cidades: ['ARACAJU', 'SAO CRISTOVAO', 'LARANJEIRAS', 'MALHADOR', 'NOSSA SENHORA DO SOCORRO'] },
    ],
  },
  {
    codigo: 'v5', nome: 'Marcos', dias: [10, 25],
    rotas: [
      { nome: 'ROTA 01', cidades: ['ARACAJU', 'SAO CRISTOVAO', 'LARANJEIRAS', 'MALHADOR', 'NOSSA SENHORA DO SOCORRO'] },
    ],
  },
  {
    codigo: 'v8', nome: 'Jedeane', dias: [12, 27],
    rotas: [
      { nome: 'ROTA 01', cidades: ['ITABAIANA', 'OURO BRANCO', 'RIBEIROPOLIS'] },
    ],
  },
  {
    codigo: '', nome: 'Rivanilde', dias: [5, 20],
    rotas: [
      { nome: 'ROTA 01', cidades: ['CAMPO DO BRITO', 'MACAMBIRA', 'SAO DOMINGOS', 'LAGARTO', 'SIMAO DIAS', 'PARIPIRANGA', 'POCO VERDE'] },
      { nome: 'ROTA 02', cidades: ['COLONIA 13', 'SALGADO', 'ESTANCIA', 'BOQUIM', 'PEDRINHAS', 'UMBAUBA', 'ARAUA', 'TOMAR DO GERU', 'INDIAROBA', 'RIO REAL', 'CRISTINAPOLIS', 'TOBIAS BARRETO', 'ITABAIANINHA'] },
      { nome: 'ROTA 03', cidades: ['FREI PAULO', 'CARIRA', 'CORONEL JOAO SA'] },
    ],
  },
]

// ---------- helpers de normalização ----------
export function normaliza(txt) {
  if (!txt && txt !== 0) return ''
  return String(txt)
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/\s+/g, ' ')
}

// extrai código (v1, v2...) e nome de "v1 - SERGIO"
export function parseVendedor(raw) {
  const s = String(raw || '').trim()
  const m = s.match(/^v?\s*(\d+)\s*[-–]\s*(.+)$/i)
  if (m) {
    return { codigo: 'v' + m[1], nomeRaw: m[2].trim() }
  }
  // sem padrão de código — usa o texto todo como nome
  return { codigo: null, nomeRaw: s }
}

// ---------- localizar um vendedor nos cadastros ----------
// cadastros = array de vendedores (do Firestore). Casa por código; se não,
// tenta por nome normalizado. Devolve o objeto do vendedor ou null.
export function achaVendedor(raw, cadastros) {
  if (!cadastros || !cadastros.length) return null
  const { codigo, nomeRaw } = parseVendedor(raw)
  if (codigo) {
    const porCod = cadastros.find((v) => v.codigo && normaliza(v.codigo) === normaliza(codigo))
    if (porCod) return porCod
  }
  const nomeN = normaliza(nomeRaw)
  return cadastros.find((v) => normaliza(v.nome) === nomeN) || null
}

// resolve o nome "oficial" do vendedor a partir do raw da planilha
export function nomeVendedor(raw, cadastros) {
  const v = achaVendedor(raw, cadastros)
  if (v) return v.nome
  // fallback: capitaliza o nome cru
  const { nomeRaw } = parseVendedor(raw)
  const n = nomeRaw.toLowerCase()
  return n.charAt(0).toUpperCase() + n.slice(1)
}

// dias de entrega do vendedor (array). [] = sem calendário definido
export function diasEntrega(raw, cadastros) {
  const v = achaVendedor(raw, cadastros)
  return v && Array.isArray(v.dias) ? v.dias : []
}

// ---------- detecção de rota pela cidade ----------
// retorna { rota: 'ROTA 01' } ou { rota: 'FORA DE ROTA' } ou { rota: 'SEM ROTA' }
export function detectaRota(vendedorRaw, cidadeRaw, cadastros) {
  const v = achaVendedor(vendedorRaw, cadastros)
  if (!v || !v.rotas || !v.rotas.length) return { rota: 'SEM ROTA' }
  const cidade = normaliza(cidadeRaw)
  for (const r of v.rotas) {
    if ((r.cidades || []).some((c) => normaliza(c) === cidade)) return { rota: r.nome }
  }
  return { rota: 'FORA DE ROTA' }
}

// ---------- cálculo de prazo de entrega ----------
// Pedido feito num mês => entregue no mês seguinte, na PRÓXIMA data do vendedor.
export function calculaPrevisao(vendedorRaw, dataVenda, cadastros) {
  const dias = diasEntrega(vendedorRaw, cadastros)
  if (!dias.length) return null // sem calendário => sem previsão automática
  const base = dataVenda ? new Date(dataVenda) : new Date()
  // mês seguinte ao da venda
  let ano = base.getFullYear()
  let mes = base.getMonth() + 1 // 0-index -> mês seguinte
  if (mes > 11) { mes = 0; ano++ }
  const diasOrd = [...dias].sort((a, b) => a - b)
  // primeira data fixa do mês seguinte
  const dia = diasOrd[0]
  return new Date(ano, mes, dia)
}

// situação: só 'em_dia' ou 'atrasado'
export function situacaoPrazo(previsao) {
  if (!previsao) return 'em_dia'
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const p = new Date(previsao)
  p.setHours(0, 0, 0, 0)
  return p < hoje ? 'atrasado' : 'em_dia'
}

export function fmtData(d) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt)) return '—'
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function fmtMoeda(v) {
  const n = Number(v) || 0
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ---------- detecção flexível de colunas da planilha ----------
// recebe array de nomes de coluna, devolve mapa {campo: nomeRealDaColuna}
const PADROES = {
  id: ['id venda', 'id', 'venda', 'pedido'],
  cliente: ['nome cliente', 'cliente', 'nome'],
  produto: ['produto', 'descricao', 'item'],
  grupo: ['grupo', 'categoria'],
  qtd: ['quantidade', 'qtd', 'qtde'],
  valor: ['valor', 'total', 'preco'],
  dataVenda: ['data da venda', 'data venda', 'data'],
  cidade: ['cidade', 'municipio'],
  vendedor: ['vendedor', 'representante', 'rca'],
  previsao: ['previs', 'data previsao', 'entrega'],
  status: ['status', 'linha', 'setor'],
  obs: ['obs', 'observacao', 'observacoes'],
}

export function mapeiaColunas(colunas) {
  const norm = colunas.map((c) => ({ raw: c, n: normaliza(c).toLowerCase() }))
  const mapa = {}
  for (const [campo, chaves] of Object.entries(PADROES)) {
    const achou = norm.find((c) => chaves.some((k) => c.n.includes(k)))
    if (achou) mapa[campo] = achou.raw
  }
  return mapa
}

// agrupa linhas (itens) por ID Venda => 1 pedido com N itens
export function agrupaPedidos(linhas, mapa, cadastros) {
  const porId = {}
  for (const row of linhas) {
    const id = String(row[mapa.id] ?? '').trim()
    if (!id) continue
    if (!porId[id]) {
      const vendRaw = row[mapa.vendedor] ?? ''
      const cidade = row[mapa.cidade] ?? ''
      const dataVenda = row[mapa.dataVenda] ?? null
      const { rota } = detectaRota(vendRaw, cidade, cadastros)
      const previsao = calculaPrevisao(vendRaw, dataVenda, cadastros)
      porId[id] = {
        idVenda: id,
        cliente: String(row[mapa.cliente] ?? '').trim(),
        vendedorRaw: String(vendRaw).trim(),
        vendedor: nomeVendedor(vendRaw, cadastros),
        cidade: String(cidade).trim().replace(/\s+/g, ' '),
        dataVenda: dataVenda ? new Date(dataVenda).toISOString() : null,
        rota,
        previsao: previsao ? previsao.toISOString() : null,
        status: '',        // designer categoriza do zero
        obs: mapa.obs ? String(row[mapa.obs] ?? '').trim() : '',
        valorTotal: 0,
        itens: [],
      }
    }
    porId[id].itens.push({
      produto: String(row[mapa.produto] ?? '').trim(),
      grupo: String(row[mapa.grupo] ?? '').trim(),
      qtd: Number(row[mapa.qtd]) || 0,
    })
    // valor: na planilha o "Valor" se repete por item (é o total do pedido),
    // então pegamos o maior valor visto, não a soma.
    const v = Number(row[mapa.valor]) || 0
    if (v > porId[id].valorTotal) porId[id].valorTotal = v
  }
  return Object.values(porId)
}
