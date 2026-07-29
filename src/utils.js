// ============================================================
// JC SACOLAS — utils.js
// Regras de negócio: linhas, vendedores, rotas, prazos e parsing
// ============================================================

// ---------- LINHAS DE PRODUÇÃO (3 — Laser REMOVIDO) ----------
export const MODO_ORDER = ['PRODUCAO', 'GLICHE', 'GRAFICA']

export const MODO_NM = {
  PRODUCAO: 'SILK SCREEN',
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

// linha de um item específico do pedido.
// se o pedido tem linhasItens definido por item, usa isso.
// senão (pedidos antigos / Zeus / quando o usuário ainda não mexeu), herda de p.status.
export function linhaDoItem(p, idx) {
  const m = p.linhasItens && p.linhasItens[idx]
  if (m) return m
  return p.status || ''
}

// linhas únicas presentes no pedido (na ordem do MODO_ORDER).
// pedido com tudo na mesma linha -> array de 1 elemento.
// pedido dividido -> array com 2 ou 3 elementos.
// pedido sem itens (Zeus) ou totalmente sem linha -> respeita p.status.
export function linhasPresentes(p) {
  if (!p.itens || !p.itens.length) {
    return p.status ? [p.status] : []
  }
  const set = new Set()
  p.itens.forEach((_, i) => {
    const m = linhaDoItem(p, i)
    if (m) set.add(m)
  })
  return MODO_ORDER.filter((m) => set.has(m))
}

// devolve só os itens de uma linha (com o índice original preservado para sobrescritas posteriores).
export function itensDaLinha(p, linha) {
  if (!p.itens) return []
  return p.itens
    .map((it, i) => ({ ...it, _idx: i }))
    .filter((it) => linhaDoItem(p, it._idx) === linha)
}

// pedido está "completo" para sair da Triagem?
// - sem itens (Zeus): basta ter p.status.
// - com itens: todo item tem que ter linha.
export function pedidoCompleto(p) {
  if (!p.itens || !p.itens.length) return !!p.status
  return p.itens.every((_, i) => !!linhaDoItem(p, i))
}

// linha "predominante" do pedido (a com mais itens) — usada para gravar p.status,
// que ainda é o que filtros antigos e outras telas consultam.
export function linhaPredominante(p) {
  if (!p.itens || !p.itens.length) return p.status || ''
  const cont = {}
  p.itens.forEach((_, i) => {
    const m = linhaDoItem(p, i)
    if (!m) return
    cont[m] = (cont[m] || 0) + 1
  })
  let melhor = ''; let max = 0
  for (const m of MODO_ORDER) {
    if ((cont[m] || 0) > max) { melhor = m; max = cont[m] }
  }
  return melhor
}

// ---------- ORIGEM DOS PEDIDOS (sistema de onde veio a planilha) ----------
export const ORIGEM_NM = {
  POSSEIDON: 'Posseidon',
  ZEUS: 'Zeus',
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

// ---------- DE/PARA de clientes (razão social -> nome de exibição) ----------
// clientes = array [{ razao: 'EXEMPLO LIMITADA', nome: 'Loja Exemplo' }]
// Casa pela razão social normalizada (ignora espaço extra, acento e caixa).
export function achaCliente(razaoSocial, clientes) {
  if (!clientes || !clientes.length) return null
  const alvo = normaliza(razaoSocial)
  if (!alvo) return null
  return clientes.find((c) => normaliza(c.razao) === alvo) || null
}

// nome a EXIBIR: apelido cadastrado, senão a própria razão social da planilha.
// Resolve no render — não precisa reimportar quando se cadastra um apelido novo.
export function nomeCliente(razaoSocial, clientes) {
  const c = achaCliente(razaoSocial, clientes)
  if (c && c.nome && c.nome.trim()) return c.nome.trim()
  return razaoSocial || ''
}

// ITENS / PRODUTOS
// itens = array [{ produto: 'SACOLA ...', tipo: <id de MATERIAIS>, unidade: 'kg'|'un'|'' }]
// MATERIAIS: fonte única dos tipos de material (id, nome, unidade padrão, cor).
// Regra de contagem: PLÁSTICO em KG; PAPEL, ETIQUETAS e ALÇA TORCIDA em UNIDADE.
export const MATERIAIS = [
  { id: 'plastico', nome: 'Plástico', unidade: 'kg', cor: '#1C7A4E' },
  { id: 'papel', nome: 'Papel', unidade: 'un', cor: '#1A5FB4' },
  { id: 'etiquetas', nome: 'Etiquetas', unidade: 'un', cor: '#C08A1E' },
  { id: 'alca_torcida', nome: 'Alça Torcida', unidade: 'un', cor: '#8E44AD' },
]
export const MATERIAL_IDS = MATERIAIS.map((m) => m.id)
export const nomeDoMaterial = (id) => (MATERIAIS.find((m) => m.id === id)?.nome || '')
export const corDoMaterial = (id) => (MATERIAIS.find((m) => m.id === id)?.cor || 'var(--warn)')

// opções de tipo de material e unidade (tipo e unidade são INDEPENDENTES)
export const TIPOS_ITEM = MATERIAIS.map((m) => ({ id: m.id, nome: m.nome }))
export const UNIDADES_ITEM = [
  { id: 'kg', nome: 'kg' },
  { id: 'un', nome: 'un' },
]
export const tipoNome = (id) => (TIPOS_ITEM.find((t) => t.id === id)?.nome || '')
export const unidadeNome = (id) => (UNIDADES_ITEM.find((u) => u.id === id)?.nome || '')

// Casa pelo nome do produto normalizado (ignora espaço extra, acento e caixa).
export function achaItem(produto, itens) {
  if (!itens || !itens.length) return null
  const alvo = normaliza(produto)
  if (!alvo) return null
  return itens.find((it) => normaliza(it.produto) === alvo) || null
}

// info do produto (tipo + unidade) resolvida no render a partir do cadastro.
// Cadastrar/alterar um item reflete imediatamente em todos os pedidos, sem reimportar.
export function infoItem(produto, itens) {
  const it = achaItem(produto, itens)
  return {
    tipo: it?.tipo || '',
    unidade: it?.unidade || '',
    cadastrado: !!it,
  }
}

// ---------- MATERIAL / UNIDADE FÍSICA (regra do negócio) ----------
// O material vem do cadastro de Itens (tipo); se o item não estiver cadastrado,
// infere pelo texto do produto/grupo. Etiqueta/Alça são mais específicos e vêm
// antes de plástico/papel na inferência.
export const UNID_POR_MATERIAL = Object.fromEntries(MATERIAIS.map((m) => [m.id, m.unidade]))
export function unidadeDoMaterial(mat) { return UNID_POR_MATERIAL[mat] || '' }

export function materialDoItem(it, itensCad) {
  const info = infoItem(it?.produto, itensCad)
  if (info.tipo) return info.tipo // id de MATERIAIS (cadastro tem prioridade)
  const t = normaliza(`${it?.produto || ''} ${it?.grupo || ''}`)
  if (/ETIQUETA/.test(t)) return 'etiquetas'
  if (/ALCA TORCIDA/.test(t)) return 'alca_torcida'
  if (/PLAST/.test(t)) return 'plastico'
  if (/PAPEL/.test(t)) return 'papel'
  return ''
}

// totais zerados: uma chave por material + 'outro' (item sem material)
export const TOTAIS_ZERO = Object.freeze(
  MATERIAIS.reduce((o, m) => { o[m.id] = 0; return o }, { outro: 0 })
)

// soma as quantidades de uma lista de itens por material.
// devolve { <cada material>: <qtd>, outro: <n> }
export function totaisPorMaterial(itens, itensCad) {
  const t = { ...TOTAIS_ZERO }
  for (const it of itens || []) {
    const q = Number(it?.qtd) || 0
    if (!q) continue
    const mat = materialDoItem(it, itensCad)
    if (mat && mat in t) t[mat] += q
    else t.outro += q
  }
  return t
}

// soma dois objetos de totais (para acumular rota -> linha -> total)
export function somaTotais(a, b) {
  const r = {}
  for (const k of Object.keys(TOTAIS_ZERO)) r[k] = ((a && a[k]) || 0) + ((b && b[k]) || 0)
  return r
}

// número de quantidade em pt-BR (kg pode ter casas; unidade é inteiro)
export function fmtQtd(n) {
  const v = Number(n) || 0
  return v % 1 === 0
    ? v.toLocaleString('pt-BR')
    : v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 3 })
}

// texto "Plástico: 100 kg · Papel: 200 un · Etiquetas: 50 un"
export function fmtTotais(t) {
  const partes = []
  for (const m of MATERIAIS) if (t && t[m.id]) partes.push(`${m.nome}: ${fmtQtd(t[m.id])} ${m.unidade}`)
  if (t && t.outro) partes.push(`Outros: ${fmtQtd(t.outro)}`)
  return partes.length ? partes.join(' · ') : '—'
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

// previsão "viva": recalcula a partir do vendedor + data da venda usando o
// calendário ATUAL do Cadastro. Assim, configurar/ajustar o calendário de um
// vendedor reflete na hora em todos os pedidos dele — sem reimportar.
// Se não der pra recalcular (sem calendário), cai pro valor já gravado.
// EXCEÇÃO: data definida À MÃO (dono/designer) tem precedência sobre tudo —
// gravada em p.previsaoManual, só sai com "voltar ao automático".
export function previsaoDe(p, cadastros) {
  if (p.previsaoManual) return p.previsaoManual
  const calc = calculaPrevisao(p.vendedorRaw, p.dataVenda, cadastros)
  if (calc) return calc.toISOString()
  return p.previsao || null
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

// ============================================================
// ASSISTENTE DE VOZ (Opção A — local, sem LLM)
// Interpreta perguntas simples por rota/vendedor e devolve uma
// frase pronta para a síntese de voz falar. Acessibilidade.
// ============================================================
const NUM_PALAVRA = { UM: 1, DOIS: 2, TRES: 3, QUATRO: 4, CINCO: 5, SEIS: 6, SETE: 7, OITO: 8, NOVE: 9 }

// procura "ROTA 1", "ROTA 01", "ROTA UM" no texto já normalizado (maiúsculo, sem acento)
function extraiRota(t) {
  const m = t.match(/ROTA\s+(\d{1,2}|UM|DOIS|TRES|QUATRO|CINCO|SEIS|SETE|OITO|NOVE)/)
  if (!m) return null
  const v = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : NUM_PALAVRA[m[1]]
  return v ? String(v).padStart(2, '0') : null
}

// linha de produção citada (status). PRODUCAO != PRODUTO (palavra inteira)
function extraiLinha(t) {
  if (/\b(PRODUCAO|SILK|SCREEN)\b/.test(t)) return { id: 'PRODUCAO', nome: 'silk screen' }
  if (/\b(GLICHE|CLICHE)\b/.test(t)) return { id: 'GLICHE', nome: 'clichê' }
  if (/\bGRAFICA\b/.test(t)) return { id: 'GRAFICA', nome: 'gráfica' }
  return null
}

// valor em forma falável: "1330 reais e cinquenta centavos"
function fmtMoedaFala(v) {
  const reais = Math.floor(v)
  const cent = Math.round((v - reais) * 100)
  let s = `${reais} ${reais === 1 ? 'real' : 'reais'}`
  if (cent > 0) s += ` e ${cent} ${cent === 1 ? 'centavo' : 'centavos'}`
  return s
}

// ============================================================
// CIÊNCIA (conferido) — captura de IP e indexação
// ============================================================
// descobre o IP público via serviço gratuito (ipify). Falha silenciosa.
export async function pegarIP() {
  try {
    const r = await fetch('https://api.ipify.org?format=json')
    const j = await r.json()
    return j.ip || ''
  } catch {
    return ''
  }
}

// indexa a ciência MAIS RECENTE por (tipo|vendedor|rota)
export function indexaCiencias(lista) {
  const map = {}
  for (const c of lista || []) {
    const k = `${c.tipo}|${normaliza(c.vendedor)}|${normaliza(c.rota)}`
    if (!map[k] || new Date(c.quando) > new Date(map[k].quando)) map[k] = c
  }
  return map
}

export function cienciaDe(map, tipo, vendedor, rota) {
  return (map || {})[`${tipo}|${normaliza(vendedor)}|${normaliza(rota)}`] || null
}

// ---------- MÊS (para as perguntas por produto/por mês) ----------
const MESES_NORM = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO']
const MESES_LABEL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function mkMes(ano, m) {
  return { ini: new Date(ano, m, 1, 0, 0, 0, 0), fim: new Date(ano, m + 1, 0, 23, 59, 59, 999), nome: MESES_LABEL[m] }
}
function mesCorrente() { const d = new Date(); return mkMes(d.getFullYear(), d.getMonth()) }
// mês citado no texto normalizado; "MES/DO MES/ESTE MES" -> mês atual
function extraiMes(t) {
  for (let i = 0; i < 12; i++) if (new RegExp(`\\b${MESES_NORM[i]}\\b`).test(t)) { const d = new Date(); return mkMes(d.getFullYear(), i) }
  if (/\bMES(ES)?\b/.test(t)) return mesCorrente()
  return null
}
function emMes(d, mi) { if (!d || !mi) return false; const x = new Date(d); return x >= mi.ini && x <= mi.fim }

// ---------- PRODUTOS POR MATERIAL (para as perguntas por produto) ----------
// palavras comuns que NÃO servem para identificar um produto pelo nome falado
const STOP_PROD = new Set(['SACOLA', 'SACOLAS', 'CAIXA', 'CAIXAS', 'PAPEL', 'PLASTICO', 'PLASTICA', 'ETIQUETA',
  'ETIQUETAS', 'ALCA', 'ALCAS', 'TORCIDA', 'TORCIDAS', 'PRODUTO', 'PRODUTOS', 'ITEM', 'ITENS', 'PEDIDO', 'PEDIDOS',
  'ENTREGAR', 'ENTREGA', 'MES', 'MESES', 'QUANTAS', 'QUANTOS', 'QUANTA', 'QUANTO', 'TEM', 'TEMOS', 'PARA', 'POR',
  'COM', 'SEM', 'UNIDADE', 'UNIDADES', 'PECA', 'PECAS', 'QUAL', 'QUAIS', 'SABER', 'FALA', 'DIGA', 'MOSTRA',
  'LISTA', 'LISTAR', 'ESSE', 'ESSA', 'ESTE', 'ESTA', 'NESSE'])

// como falar a quantidade de cada material (singular/plural do "item" contado)
const FALA_MATERIAL = {
  papel: { s: 'sacola de papel', p: 'sacolas de papel' },
  etiquetas: { s: 'etiqueta', p: 'etiquetas' },
  alca_torcida: { s: 'alça torcida', p: 'alças torcidas' },
  plastico: { s: 'quilo de plástico', p: 'quilos de plástico' },
}
const falaQtd = (mat, q) => `${q} ${q === 1 ? (FALA_MATERIAL[mat]?.s || 'item') : (FALA_MATERIAL[mat]?.p || 'itens')}`

// material citado na pergunta (ou null)
function extraiMaterialPergunta(t) {
  if (/ETIQUETA/.test(t)) return 'etiquetas'
  if (/ALCA/.test(t)) return 'alca_torcida'   // texto já normalizado (sem cedilha)
  if (/PLAST/.test(t)) return 'plastico'
  if (/PAPEL/.test(t)) return 'papel'
  return null
}

// { chaveNormalizada -> { nome, mat, qtd, pedidos:Set } }
// matFiltro null = todos os materiais (cada produto marcado com seu material)
function mapaProdutosMaterial(lista, itensCad, matFiltro = null) {
  const map = {}
  for (const p of lista || []) {
    for (const it of (p.itens || [])) {
      const mat = materialDoItem(it, itensCad)
      if (!mat) continue
      if (matFiltro && mat !== matFiltro) continue
      const norm = normaliza(it.produto)
      if (!norm) continue
      if (!map[norm]) map[norm] = { nome: (it.produto || '').trim() || '—', mat, qtd: 0, pedidos: new Set() }
      map[norm].qtd += Number(it.qtd) || 0
      map[norm].pedidos.add(p.id != null ? p.id : p)
    }
  }
  return map
}

// acha, entre os produtos do escopo, o citado na pergunta (por palavras)
function achaProdutoMaterial(t, mapa) {
  const qTokens = new Set((t.split(/[^A-Z0-9]+/) || []).filter((w) => w.length >= 3 && !STOP_PROD.has(w)))
  if (!qTokens.size) return null
  let best = null, bestScore = 0
  for (const info of Object.values(mapa)) {
    const pTokens = normaliza(info.nome).split(/[^A-Z0-9]+/).filter((w) => w.length >= 3 && !STOP_PROD.has(w))
    if (!pTokens.length) continue
    let score = 0
    for (const w of pTokens) if (qTokens.has(w)) score++
    if (score > bestScore) { bestScore = score; best = info }
  }
  return bestScore >= 1 ? best : null
}

export function responderPergunta(textoBruto, pedidos, vendedores = [], clientes = [], itensCad = []) {
  const t = normaliza(textoBruto)
  if (!t) return 'Não entendi. Pode repetir a pergunta?'

  // só pedidos categorizados entram no fluxo de entrega
  let lista = (pedidos || []).filter((p) => p.status)
  const partes = []

  // ---------- escopos (filtros) ----------
  const vend = vendedores.find((v) => v.nome && t.includes(normaliza(v.nome)))
  if (vend) {
    lista = lista.filter((p) => normaliza(p.vendedor) === normaliza(vend.nome))
    partes.push(`de ${vend.nome}`)
  }

  const rota = extraiRota(t)
  if (rota) {
    lista = lista.filter((p) => normaliza(p.rota) === `ROTA ${rota}`)
    partes.push(`na rota ${rota}`)
  }

  const linha = extraiLinha(t)
  if (linha) {
    lista = lista.filter((p) => p.status === linha.id)
    partes.push(`na ${linha.nome}`)
  }

  const soAtrasados = /\bATRAS/.test(t)
  if (soAtrasados) {
    lista = lista.filter((p) => situacaoPrazo(previsaoDe(p, vendedores)) === 'atrasado')
    partes.push('em atraso')
  }

  // mês: nas perguntas GERAIS só filtra se o mês foi dito (compatível com o que já existia)
  const mesDito = extraiMes(t)
  if (mesDito) {
    lista = lista.filter((p) => emMes(previsaoDe(p, vendedores), mesDito))
    partes.push(`em ${mesDito.nome}`)
  }

  const escopo = partes.length ? ' ' + partes.join(' ') : ''
  const nPed = lista.length

  // ---------- métricas / intenções ----------
  const querProduto = /(PRODUTO|SACOLA|ITEM|ITENS|UNIDADE|PE[CÇ]A|ETIQUETA|ALCA)/.test(t)
  const querValor = /(VALOR|RECEBER|REAIS|DINHEIRO|FATURAR)/.test(t)
  const querClienteTop = /(QUAL CLIENTE|CLIENTE COM MAIS|MAIOR CLIENTE|MAIS PEDIDO)/.test(t)
  const querListarClientes = /CLIENTE/.test(t) &&
    /(QUAIS|QUEM|LISTA|LISTAR|MOSTRA|FALA|DIGA|CLIENTES D[AEO])/.test(t)
  const falaDePedido = /(PEDIDO|ENTREG)/.test(t)

  // ---------- PRODUTO POR MATERIAL: por produto / por mês / produto específico ----------
  // Para essas perguntas o mês é sempre considerado (o dito, ou o atual).
  const querListarProdutos = /PRODUTO/.test(t) && /(QUAIS|QUE PRODUTOS|LISTA|LISTAR|MOSTRA|FALA|DIGA|NOMES)/.test(t)
  const querPorProduto = /(POR PRODUTO|CADA PRODUTO|PRODUTO A PRODUTO|POR ITEM|POR TIPO)/.test(t)
  const matPerg = extraiMaterialPergunta(t)   // material citado, ou null
  const matAgg = matPerg || 'papel'           // agregados sem material citado -> papel
  const matLabel = (id) => nomeDoMaterial(id).toLowerCase()
  const mesProd = mesDito || mesCorrente()
  const listaProd = mesDito ? lista : lista.filter((p) => emMes(previsaoDe(p, vendedores), mesProd))
  const escProd = partes.filter((x) => !x.startsWith('em ')).join(' ')
  const escProdTxt = escProd ? ' ' + escProd : ''

  // produto específico (qualquer material) — não quando é pergunta agregada
  if (!querPorProduto && !querListarProdutos && !querListarClientes && !querClienteTop && !querValor) {
    const prod = achaProdutoMaterial(t, mapaProdutosMaterial(listaProd, itensCad, matPerg))
    if (prod) {
      const np = prod.pedidos.size
      return `${prod.nome}, em ${mesProd.nome}: ${falaQtd(prod.mat, prod.qtd)} para entregar${escProdTxt}, em ${np} ${np === 1 ? 'pedido' : 'pedidos'}.`
    }
  }

  // listar os produtos (do material) do mês
  if (querListarProdutos) {
    const nomes = Object.values(mapaProdutosMaterial(listaProd, itensCad, matAgg)).map((x) => x.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    if (!nomes.length) return `Não há produtos de ${matLabel(matAgg)} para entregar em ${mesProd.nome}${escProdTxt}.`
    const cap = nomes.slice(0, 12), resto = nomes.length - cap.length
    return `Em ${mesProd.nome} há ${nomes.length} ${nomes.length === 1 ? 'produto' : 'produtos'} de ${matLabel(matAgg)}${escProdTxt}: ${cap.join(', ')}${resto > 0 ? `, e mais ${resto}` : ''}.`
  }

  // por produto (do material): fala só o TOTAL e pede o produto
  if (querPorProduto) {
    const prods = Object.values(mapaProdutosMaterial(listaProd, itensCad, matAgg))
    if (!prods.length) return `Não há ${FALA_MATERIAL[matAgg]?.p || 'itens'} para entregar em ${mesProd.nome}${escProdTxt}.`
    const total = prods.reduce((s, x) => s + x.qtd, 0)
    const pedSet = new Set(); prods.forEach((x) => x.pedidos.forEach((id) => pedSet.add(id)))
    const nP = pedSet.size, nProd = prods.length
    // conta PEDIDOS quando a pergunta é "quantos pedidos..."; conta UNIDADES quando é "quantas sacolas/etiquetas/alças..."
    const contaUnidades = /QUANT\w*\s+(SACOLA|ETIQUETA|ALCA|CAIXA|UNIDADE|PECA)/.test(t)
    const soPedidos = /PEDIDO/.test(t) && !contaUnidades
    if (soPedidos) {
      return `Em ${mesProd.nome}, ${matLabel(matAgg)}${escProdTxt}: ${nP} ${nP === 1 ? 'pedido' : 'pedidos'} para entregar, em ${nProd} ${nProd === 1 ? 'produto' : 'produtos'}. Diga o nome de um produto para saber quantos pedidos dele, ou pergunte "quais produtos de ${matLabel(matAgg)}".`
    }
    return `Para entregar em ${mesProd.nome}${escProdTxt}: ${falaQtd(matAgg, total)}, em ${nProd} ${nProd === 1 ? 'produto' : 'produtos'} e ${nP} ${nP === 1 ? 'pedido' : 'pedidos'}. Diga o nome de um produto para saber a quantidade dele, ou pergunte "quais produtos de ${matLabel(matAgg)}".`
  }

  // cliente com mais pedidos
  if (querClienteTop) {
    if (nPed === 0) return `Não há pedidos${escopo}.`
    const cont = {}
    for (const p of lista) { const c = nomeCliente(p.cliente, clientes); cont[c] = (cont[c] || 0) + 1 }
    const [cli, q] = Object.entries(cont).sort((a, b) => b[1] - a[1])[0]
    return `O cliente com mais pedidos${escopo} é ${cli}, com ${q} ${q === 1 ? 'pedido' : 'pedidos'}.`
  }

  // listar os clientes (por rota/vendedor)
  if (querListarClientes) {
    if (nPed === 0) return `Não há clientes${escopo}.`
    const nomes = [...new Set(lista.map((p) => nomeCliente(p.cliente, clientes)))].sort()
    const q = nomes.length
    return `São ${q} ${q === 1 ? 'cliente' : 'clientes'}${escopo}: ${nomes.join(', ')}.`
  }

  // nada reconhecido -> não chuta, orienta
  const reconheceu = vend || rota || linha || soAtrasados || querProduto || querValor || falaDePedido || mesDito
  if (!reconheceu) {
    return 'Não entendi. Você pode perguntar, por exemplo: quantas sacolas por produto no mês; quais produtos de papel; quantas sacolas de um produto no mês; quantos pedidos para entregar; quais clientes de uma rota; quantos pedidos em atraso; ou o valor a receber.'
  }

  if (nPed === 0) return `Não há pedidos${escopo}.`

  if (querProduto) {
    const qtd = lista.reduce((s, p) => s + (p.itens || []).reduce((a, it) => a + (Number(it.qtd) || 0), 0), 0)
    return `São ${qtd} ${qtd === 1 ? 'item' : 'itens'} para entregar${escopo}, em ${nPed} ${nPed === 1 ? 'pedido' : 'pedidos'}.`
  }
  if (querValor) {
    const v = lista.reduce((s, p) => s + (Number(p.valorTotal) || 0), 0)
    return `O valor a entregar${escopo} é ${fmtMoedaFala(v)}, em ${nPed} ${nPed === 1 ? 'pedido' : 'pedidos'}.`
  }
  return `Você tem ${nPed} ${nPed === 1 ? 'pedido' : 'pedidos'} para entregar${escopo}.`
}

// ---------- filtro compartilhado (Rota e Produção) ----------
// f = { cliente, pedido, vendedor, dataIni, dataFim }
// datas filtram pela PREVISÃO de entrega. Pedido sem previsão não entra
// quando há filtro de data ativo. clientes = de/para (casa pelos dois nomes).
export function filtraPedidos(lista, f, clientes) {
  if (!f) return lista
  const cli = normaliza(f.cliente || '')
  const ped = normaliza(f.pedido || '')
  const vend = f.vendedor || ''
  const ini = f.dataIni ? new Date(f.dataIni + 'T00:00:00') : null
  const fim = f.dataFim ? new Date(f.dataFim + 'T23:59:59') : null
  return lista.filter((p) => {
    if (cli) {
      const razao = normaliza(p.cliente)
      const exib = normaliza(nomeCliente(p.cliente, clientes))
      if (!razao.includes(cli) && !exib.includes(cli)) return false
    }
    if (ped && !normaliza(p.idVenda).includes(ped)) return false
    if (vend && (p.vendedor || '—') !== vend) return false
    if (ini || fim) {
      if (!p.previsao) return false
      const d = new Date(p.previsao)
      if (ini && d < ini) return false
      if (fim && d > fim) return false
    }
    return true
  })
}

// lista de vendedores distintos presentes nos pedidos (para o select do filtro)
export function vendedoresDe(lista) {
  return [...new Set(lista.map((p) => p.vendedor || '—'))].sort()
}

// texto curto descrevendo os filtros ativos (cabeçalho da impressão)
export function resumoFiltros(f) {
  if (!f) return ''
  const partes = []
  if (f.cliente) partes.push(`cliente "${f.cliente}"`)
  if (f.pedido) partes.push(`pedido ${f.pedido}`)
  if (f.vendedor) partes.push(`vendedor ${f.vendedor}`)
  if (f.dataIni || f.dataFim) {
    const a = f.dataIni ? fmtData(f.dataIni + 'T00:00:00') : '…'
    const b = f.dataFim ? fmtData(f.dataFim + 'T00:00:00') : '…'
    partes.push(`entrega ${a} a ${b}`)
  }
  return partes.join(' · ')
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

// Pontua o quão bem uma coluna casa com uma chave:
//  - nome EXATO vale mais que palavra inteira, que vale mais que pedaço (substring).
//  - substring só conta para chaves longas (>= 4 letras), pra evitar que 'id' case
//    com "cidade" ou 'venda' case com "data da venda".
// Chaves mais à esquerda na lista têm leve prioridade (peso).
function scoreColuna(n, chaves) {
  let score = 0
  for (let i = 0; i < chaves.length; i++) {
    const k = chaves[i]
    const peso = chaves.length - i
    if (n === k) score = Math.max(score, 100 + peso)
    else if (new RegExp(`(^|\\s)${k}(\\s|$)`).test(n)) score = Math.max(score, 50 + peso)
    else if (k.length >= 4 && n.includes(k)) score = Math.max(score, 10 + peso)
  }
  return score
}

export function mapeiaColunas(colunas) {
  const norm = colunas.map((c) => ({ raw: c, n: normaliza(c).toLowerCase().trim() }))
  const mapa = {}
  const usados = new Set()
  for (const [campo, chaves] of Object.entries(PADROES)) {
    let melhor = null, melhorScore = 0
    for (const c of norm) {
      if (usados.has(c.raw)) continue            // 1 coluna não serve a 2 campos
      const s = scoreColuna(c.n, chaves)
      if (s > melhorScore) { melhorScore = s; melhor = c }
    }
    if (melhor) { mapa[campo] = melhor.raw; usados.add(melhor.raw) }
  }
  return mapa
}

// agrupa linhas (itens) por ID Venda => 1 pedido com N itens
export function agrupaPedidos(linhas, mapa, cadastros) {
  const porId = {}
  for (const row of linhas) {
    const id = String(row[mapa.id] ?? '').trim().replace(/\.0$/, '')
    if (!id) continue
    if (!porId[id]) {
      const vendRaw = row[mapa.vendedor] ?? ''
      const cidade = row[mapa.cidade] ?? ''
      const dataVenda = row[mapa.dataVenda] ?? null
      const { rota } = detectaRota(vendRaw, cidade, cadastros)
      const previsao = calculaPrevisao(vendRaw, dataVenda, cadastros)
      porId[id] = {
        idVenda: id,
        origem: 'POSSEIDON',
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

// ============================================================
// ZEUS — "Listagem de pré-vendas"
// Colunas: Faturada | Código | Venda (data) | Cód. cliente |
//          Cliente | Valor venda | Vendedor
// Diferenças p/ o Posseidon: não tem produto/itens, não tem cidade,
// valor vem como texto "3.219,50" e data como texto "08/06/2026".
// ============================================================

// ---------- detecta de qual sistema veio a planilha ----------
// recebe os nomes das colunas; devolve 'ZEUS', 'POSSEIDON' ou null
export function detectaOrigem(colunas) {
  const cols = colunas.map((c) => normaliza(c).toLowerCase())
  const tem = (k) => cols.some((c) => c.includes(k))
  // assinatura da Zeus: "Faturada" + "Valor venda" (ou "Cód. cliente")
  if (tem('faturada') || tem('valor venda') || tem('cod. cliente') || tem('cod cliente')) {
    return 'ZEUS'
  }
  // assinatura do Posseidon: tem Produto e/ou Cidade
  if (tem('produto') || tem('cidade') || tem('id venda')) {
    return 'POSSEIDON'
  }
  return null
}

// ---------- parsers de formato brasileiro ----------
// "08/06/2026" -> Date (new Date() puro interpretaria como mês/dia)
export function parseDataBR(v) {
  if (!v && v !== 0) return null
  if (v instanceof Date) return isNaN(v) ? null : v
  const s = String(v).trim()
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) {
    let ano = Number(m[3])
    if (ano < 100) ano += 2000
    return new Date(ano, Number(m[2]) - 1, Number(m[1]))
  }
  const d = new Date(s)
  return isNaN(d) ? null : d
}

// "3.219,50" -> 3219.5 (aceita número puro também)
export function parseValorBR(v) {
  if (typeof v === 'number') return v
  if (!v) return 0
  const s = String(v).trim().replace(/[R$\s]/g, '')
  if (/,\d{1,2}$/.test(s)) {
    return Number(s.replace(/\./g, '').replace(',', '.')) || 0
  }
  return Number(s) || 0
}

// ---------- mapeamento de colunas da Zeus ----------
// precisa ser exato em alguns casos: "Venda" (data) x "Valor venda",
// "Cliente" x "Cód. cliente"
export function mapeiaColunasZeus(colunas) {
  const norm = colunas.map((c) => ({ raw: c, n: normaliza(c).toLowerCase() }))
  const exata = (alvo) => norm.find((c) => c.n === alvo)?.raw
  const contem = (k) => norm.find((c) => c.n.includes(k))?.raw
  return {
    id: exata('codigo') || contem('codigo'),
    dataVenda: exata('venda') || exata('data venda') || exata('data'),
    cliente: exata('cliente') || norm.find((c) => c.n.includes('cliente') && !c.n.includes('cod'))?.raw,
    valor: contem('valor venda') || contem('valor'),
    vendedor: contem('vendedor'),
    faturada: contem('faturada'),
  }
}

// agrupa as linhas da Zeus => 1 linha = 1 pedido (pré-venda não tem itens)
export function agrupaPedidosZeus(linhas, mapa, cadastros) {
  const porId = {}
  for (const row of linhas) {
    const codigo = String(row[mapa.id] ?? '').trim().replace(/\.0$/, '')
    if (!codigo || !/\d/.test(codigo)) continue // pula linha de total no fim
    const cliente = String(row[mapa.cliente] ?? '').trim()
    if (!cliente) continue
    const vendRaw = row[mapa.vendedor] ?? ''
    const dataVenda = parseDataBR(row[mapa.dataVenda])
    const previsao = calculaPrevisao(vendRaw, dataVenda, cadastros)
    // prefixo Z no ID evita conflito com um pedido do Posseidon de mesmo número
    const idVenda = 'Z' + codigo
    porId[idVenda] = {
      idVenda,
      origem: 'ZEUS',
      cliente,
      vendedorRaw: String(vendRaw).trim(),
      vendedor: nomeVendedor(vendRaw, cadastros),
      cidade: '', // a listagem da Zeus não traz cidade
      dataVenda: dataVenda ? dataVenda.toISOString() : null,
      rota: 'SEM ROTA',
      previsao: previsao ? previsao.toISOString() : null,
      status: '',
      obs: '',
      valorTotal: parseValorBR(row[mapa.valor]),
      itens: [],
    }
  }
  return Object.values(porId)
}
