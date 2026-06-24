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
// itens = array [{ produto: 'SACOLA ...', tipo: 'plastico'|'papel'|'', unidade: 'kg'|'un'|'' }]
// opções de tipo de material e unidade (tipo e unidade são INDEPENDENTES)
export const TIPOS_ITEM = [
  { id: 'plastico', nome: 'Plástico' },
  { id: 'papel', nome: 'Papel' },
]
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
export function previsaoDe(p, cadastros) {
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

export function responderPergunta(textoBruto, pedidos, vendedores = []) {
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

  const escopo = partes.length ? ' ' + partes.join(' ') : ''
  const nPed = lista.length

  // ---------- métricas / intenções ----------
  const querProduto = /(PRODUTO|SACOLA|ITEM|ITENS|UNIDADE|PE[CÇ]A)/.test(t)
  const querValor = /(VALOR|RECEBER|REAIS|DINHEIRO|FATURAR)/.test(t)
  const querClienteTop = /(QUAL CLIENTE|CLIENTE COM MAIS|MAIOR CLIENTE|MAIS PEDIDO)/.test(t)
  const falaDePedido = /(PEDIDO|ENTREG)/.test(t)

  // cliente com mais pedidos
  if (querClienteTop) {
    if (nPed === 0) return `Não há pedidos${escopo}.`
    const cont = {}
    for (const p of lista) { const c = p.cliente || '—'; cont[c] = (cont[c] || 0) + 1 }
    const [cli, q] = Object.entries(cont).sort((a, b) => b[1] - a[1])[0]
    return `O cliente com mais pedidos${escopo} é ${cli}, com ${q} ${q === 1 ? 'pedido' : 'pedidos'}.`
  }

  // nada reconhecido -> não chuta, orienta
  const reconheceu = vend || rota || linha || soAtrasados || querProduto || querValor || falaDePedido
  if (!reconheceu) {
    return 'Não entendi. Você pode perguntar, por exemplo: quantos pedidos para entregar; quantos pedidos de um vendedor; quantas sacolas em uma rota; quantos pedidos em atraso; quantos pedidos na gráfica; o valor a receber; ou qual cliente tem mais pedidos.'
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
