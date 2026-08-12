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

// selo quadrado da linha — o mesmo símbolo que o designer marca na Triagem.
// Acompanha o produto em TODA tela por onde ele passa (quadro, lista, rota, romaneio).
export const SIGLA_LINHA = {
  PRODUCAO: 'S',
  GLICHE: 'G',
  GRAFICA: 'Gr',
}

// ---------- CHAVE ESTÁVEL DO ITEM ----------
// Todo estado por item (linhasItens, acabamentos, etapas) é gravado num MAPA.
// Indexar esse mapa pela POSIÇÃO no array é frágil: todo import sobrescreve `itens`
// com o que veio da planilha, e se a ordem mudar o estado migra para o item errado
// (linha trocada, acabamento trocado, item errado saindo na entrega).
// Por isso a chave é derivada do próprio item: produto normalizado + nº da ocorrência
// dele dentro do pedido ("SACOLA PAPEL TAM. P02#1"). É determinística — o import
// grava em `it.key`, e pedido antigo (sem key) tem a mesma chave recalculada aqui.
export function chaveItem(produto, ocorrencia) {
  return `${normaliza(produto)}#${ocorrencia}`
}
// chaves de todos os itens do pedido, na ordem do array
export function keysDoPedido(p) {
  const vistos = {}
  return (p?.itens || []).map((it) => {
    const base = normaliza(it?.produto)
    vistos[base] = (vistos[base] || 0) + 1
    return it?.key || chaveItem(it?.produto, vistos[base])
  })
}
export function keyDoItem(p, idx) {
  const it = p?.itens?.[idx]
  if (!it) return String(idx)
  if (it.key) return it.key
  return keysDoPedido(p)[idx]
}
// lê o mapa por item aceitando os dois formatos: chave nova e índice antigo (legado).
// O índice só é consultado quando não há entrada pela chave — assim um pedido já
// migrado nunca volta a ler lixo antigo.
export function doMapaDoItem(mapa, p, idx) {
  if (!mapa) return undefined
  const k = keyDoItem(p, idx)
  if (mapa[k] !== undefined) return mapa[k]
  return mapa[idx]
}

// linha de um item específico do pedido.
// se o pedido tem linhasItens definido por item, usa isso.
// senão (pedidos antigos / Zeus / quando o usuário ainda não mexeu), herda de p.status.
export function linhaDoItem(p, idx) {
  const m = doMapaDoItem(p.linhasItens, p, idx)
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

// pedido pertence ao fluxo da Gráfica? (tem item de linha gráfica)
export function ehGrafica(p) { return linhasPresentes(p).includes('GRAFICA') }

// ---------- ETAPAS POR ITEM (o item é a unidade de produção) ----------
// Cada item anda sozinho: [linha de produção] -> Montagem -> Expedição -> expedido.
// A 1a coluna é a LINHA do próprio item (Silk screen, Gliche ou Gráfica), então
// itens de plástico, alça torcida e etiqueta também andam pelo quadro.
// Gravado em pedidos/{id}.etapas = { <chaveDoItem>: { et, por, em } }.
// O campo antigo p.etapa (pedido inteiro) vira fallback de leitura — legado.
export const COLUNAS_QUADRO = [
  ...MODO_ORDER.map((m) => ({ id: m, nome: MODO_NM[m], linha: true })),
  { id: 'montagem', nome: 'Montagem', linha: false },
  { id: 'expedicao', nome: 'Expedição', linha: false },
]
export const ETAPA_IDS_ITEM = COLUNAS_QUADRO.map((c) => c.id)
export const nomeEtapaItem = (id) =>
  (id === 'expedido' ? 'Expedido' : COLUNAS_QUADRO.find((c) => c.id === id)?.nome || '')

// setores que um operador pode ser liberado a movimentar (ids = ids das colunas).
// 'entrega' fica fora do quadro, mas segue no cadastro de usuários.
export const SETORES_PROD = [
  ...COLUNAS_QUADRO.map((c) => ({ id: c.id, nm: c.nome })),
  { id: 'entrega', nm: 'Entrega' },
]
// usuário cadastrado antes das colunas por linha guardou 'grafica' minúsculo
export const normSetor = (s) => (s === 'grafica' ? 'GRAFICA' : s === 'silk' ? 'PRODUCAO' : s)

// ---------- MONTAGEM POR MATERIAL ----------
// Quem monta sacola de papel não é quem monta a de plástico: a montagem é um
// setor só na ETAPA (o campo gravado continua 'montagem'), mas se divide em
// painéis pelo MATERIAL do item. A divisão é DERIVADA no render a partir do
// cadastro de Itens — corrigir o tipo de um produto realoca o item sozinho,
// inclusive os que já estão na montagem. Nada de etapa nova no banco.
export const MONTAGENS = [
  { id: 'papel', nome: 'Montagem Papel', materiais: ['papel'] },
  { id: 'plastico', nome: 'Montagem Plástico', materiais: ['plastico'] },
  { id: 'outros', nome: 'Montagem Etiq./Alça', materiais: ['etiquetas', 'alca_torcida'] },
]
// '' = material que o cadastro de Itens ainda não conhece
export const montagemDoMaterial = (mat) =>
  MONTAGENS.find((m) => m.materiais.includes(mat))?.id || ''

// ---------- PAINÉIS DO QUADRO (fila por setor) ----------
// Cada painel é a FILA de um posto de trabalho: o que está na minha mão agora.
// O item some do painel assim que avança — quem trabalha na linha não vê o que
// já foi para a montagem. A visão do fluxo inteiro é a aba "Visão geral"
// (só dono/designer), que desenha todos os painéis lado a lado.
export const PAINEIS_QUADRO = [
  ...MODO_ORDER.map((m) => ({ id: m, nome: MODO_NM[m], tipo: 'linha', etapa: m, linha: m })),
  ...MONTAGENS.map((m) => ({
    id: `montagem:${m.id}`, nome: m.nome, tipo: 'montagem', etapa: 'montagem', montagem: m.id,
  })),
  { id: 'expedicao', nome: 'Expedição', tipo: 'expedicao', etapa: 'expedicao' },
]
export const painelPorId = (id) => PAINEIS_QUADRO.find((x) => x.id === id) || null

// o item (já sabido o material) entra neste painel?
// Material desconhecido aparece em TODAS as montagens, com aviso: entre duplicar
// e sumir, sumir é pior — trabalho que ninguém vê é trabalho que atrasa.
export function itemNoPainel(painel, mat) {
  if (painel?.tipo !== 'montagem') return true
  const m = montagemDoMaterial(mat)
  return !m || m === painel.montagem
}

// O item pertence a este painel? Fonte única para os DOIS quadros (fábrica e
// vendedor), para os dois nunca discordarem sobre onde um item está.
// Etapa de linha (PRODUCAO/GLICHE/GRAFICA) significa só "ainda não saiu da
// linha" — quem diz QUAL linha é o `linhasItens` ATUAL. Sem isso, trocar a linha
// do item na Triagem depois que ele já andou e voltou fazia o item sumir do
// quadro: o painel da linha velha cobrava a linha nova e o da nova cobrava a
// etapa nova, e nenhum dos dois aceitava.
export function itemPertenceAoPainel(painel, p, idx, mat) {
  const et = etapaDoItem(p, idx)
  if (et === 'expedido') return false          // saiu do quadro, segue pela Rota
  if (painel?.tipo === 'linha') return MODO_ORDER.includes(et) && painel.linha === linhaDoItem(p, idx)
  return painel?.etapa === et && itemNoPainel(painel, mat)
}

// ---------- ORDEM DO FLUXO / PROGRESSO DA ROTA NO SETOR ----------
// posição da etapa no caminho do item: linha → montagem → expedição → expedido.
export const posNoFluxo = (et) =>
  (MODO_ORDER.includes(et) ? 0 : ({ montagem: 1, expedicao: 2, expedido: 3 }[et] ?? 0))

// o item passa por este painel em ALGUM momento? (não importa onde ele está agora)
export function itemPassaPeloPainel(painel, p, idx, mat) {
  if (painel?.tipo === 'linha') return linhaDoItem(p, idx) === painel.linha
  if (painel?.tipo === 'montagem') return itemNoPainel(painel, mat)
  return true // expedição: todo item passa por lá
}
export const jaPassouDoPainel = (painel, et) => posNoFluxo(et) > posNoFluxo(painel?.etapa)

// Progresso de um grupo (data+vendedor+rota) NESTE setor: de todos os itens que
// precisam passar por aqui, quantos já passaram. Conta também os que ainda nem
// chegaram (estão numa etapa anterior) e os travados na laminação — é justamente
// isso que avisa "a rota está incompleta" ANTES de a data chegar. Agrupar sozinho
// deixa os pedidos juntos, mas não denuncia o que falta.
export function progressoNoPainel(painel, pedidos, itensCad, materiaisDoUsuario) {
  let total = 0
  let feitos = 0
  for (const p of pedidos || []) {
    ;(p.itens || []).forEach((_, i) => {
      if (!linhaDoItem(p, i)) return // ainda na Triagem
      const mat = materialDoItem(p.itens[i], itensCad)
      if (!podeNoMaterial(materiaisDoUsuario, mat)) return
      if (!itemPassaPeloPainel(painel, p, i, mat)) return
      total++
      if (jaPassouDoPainel(painel, etapaDoItem(p, i))) feitos++
    })
  }
  return { total, feitos }
}

// Ordem da rota no cadastro do VENDEDOR — a sequência real em que ele roda, que
// é a ordem em que a produção deve fechar as rotas. Alfabético só coincide
// enquanto as rotas se chamarem ROTA 01/02/03. Rota fora do cadastro vai pro fim.
export function ordemRota(vendedorNome, rota, cadastros) {
  const v = (cadastros || []).find((x) => normaliza(x.nome) === normaliza(vendedorNome))
  const i = (v?.rotas || []).findIndex((r) => normaliza(r.nome) === normaliza(rota))
  return i >= 0 ? i : 999
}

// ---------- VISÃO DO VENDEDOR: o pedido INTEIRO, item a item ----------
// Etapas na linguagem de quem VENDE, não de quem produz: as três montagens viram
// uma só (a divisão por material é assunto interno da fábrica) e o fim da linha
// ganha os estados que o vendedor pergunta — pronto, saiu, entregue.
export const ETAPAS_VENDEDOR = [
  { id: 'triagem', nome: 'Em triagem' },
  { id: 'PRODUCAO', nome: MODO_NM.PRODUCAO },
  { id: 'GLICHE', nome: MODO_NM.GLICHE },
  { id: 'GRAFICA', nome: MODO_NM.GRAFICA },
  { id: 'montagem', nome: 'Montagem' },
  { id: 'expedicao', nome: 'Expedição' },
  { id: 'pronto', nome: 'Pronto p/ sair' },
  { id: 'saiu', nome: 'Saiu p/ entrega' },
  { id: 'entregue', nome: 'Entregue' },
]
export const nomeEtapaVendedor = (id) => ETAPAS_VENDEDOR.find((e) => e.id === id)?.nome || ''

// em que etapa (na linguagem do vendedor) está este item já unificado
export function etapaVendedor(item, pedido) {
  if (item?.entregue) return 'entregue'
  if (!item?.linha) return 'triagem'              // ainda sem classificação
  const et = item.etapa
  if (et === 'expedido') return saiuParaEntrega(pedido) ? 'saiu' : 'pronto'
  // etapa de linha diz só "não saiu da linha"; QUAL linha é o linhasItens atual
  if (MODO_ORDER.includes(et)) return item.linha
  return et                                       // montagem | expedicao
}

// Junta o pedido VIVO (coleção `pedidos`) com as remessas já entregues (coleção
// `entregues`) num objeto só por idVenda. Sem isso o pedido aparece partido para
// o vendedor: entrega parcial deixa metade dos itens em cada coleção, e pedido
// totalmente entregue some de `pedidos` — existe só como remessa.
export function unificaPedidosVendedor(pedidos, entregues) {
  const mapa = {}
  const garante = (id, base) => (mapa[id] ??= { ...base, idVenda: id, itens: [] })
  // pedidos primeiro: quem está vivo tem os dados mais atuais (rota, previsão)
  for (const p of pedidos || []) {
    const u = garante(p.idVenda, p)
    ;(p.itens || []).forEach((it, i) => {
      u.itens.push({
        produto: it.produto, qtd: it.qtd,
        linha: linhaDoItem(p, i), etapa: etapaDoItem(p, i), entregue: false,
      })
    })
  }
  for (const e of entregues || []) {
    const u = garante(e.idVenda, e)
    ;(e.itens || []).forEach((it, i) => {
      u.itens.push({
        produto: it.produto, qtd: it.qtd,
        linha: linhaDoItem(e, i), etapa: 'expedido', entregue: true,
        remessa: e.remessa || 1, entregueEm: e.entregueEm, motorista: e.motorista, pago: !!e.pago,
      })
    })
  }
  // cada item já sabe a etapa do vendedor (o pedido inteiro decide 'pronto' × 'saiu')
  for (const u of Object.values(mapa)) {
    for (const it of u.itens) it.etapaVend = etapaVendedor(it, u)
  }
  return Object.values(mapa)
}

// quantos itens em cada etapa — é o pipeline que o vendedor lê de uma vez
export function contaEtapasVendedor(pedidos) {
  const cont = {}
  for (const p of pedidos || []) for (const it of p.itens || []) {
    cont[it.etapaVend] = (cont[it.etapaVend] || 0) + 1
  }
  return cont
}

// Permissão em DOIS eixos: SETOR (o que eu faço) × MATERIAL (com o que trabalho).
// materiais vazio = todos os materiais (padrão de quem não foi restringido).
export function podeNoMaterial(materiais, mat) {
  if (!materiais || !materiais.length) return true
  if (!mat) return true // item sem material não pode sumir do chão de fábrica
  return materiais.includes(mat)
}

// painéis que este usuário enxerga. Staff/expedição/financeiro veem todos
// (expedição e financeiro só olham; quem age é o podeMoverEtapa do quadro).
export function paineisVisiveis({ perfil, setores, materiais }) {
  if (['dono', 'designer', 'expedicao', 'financeiro'].includes(perfil)) return PAINEIS_QUADRO
  const libs = (setores || []).map(normSetor)
  return PAINEIS_QUADRO.filter((pa) => {
    if (!libs.includes(pa.etapa)) return false
    if (pa.tipo === 'montagem' && materiais?.length) {
      const mm = MONTAGENS.find((m) => m.id === pa.montagem)?.materiais || []
      return mm.some((x) => materiais.includes(x))
    }
    return true
  })
}

export function etapaDoItem(p, idx) {
  const raw = doMapaDoItem(p?.etapas, p, idx)
  const et = typeof raw === 'string' ? raw : raw?.et
  if (et === 'expedido' || ETAPA_IDS_ITEM.includes(et)) return et
  // legado: o pedido inteiro andava num campo só. 'grafica' virou a coluna da linha.
  const leg = p?.etapa
  if (leg === 'montagem' || leg === 'expedicao' || leg === 'expedido') return leg
  if (leg === 'entregue') return 'expedido'
  return linhaDoItem(p, idx) // item ainda na própria linha de produção
}
export const itemExpedido = (p, idx) => etapaDoItem(p, idx) === 'expedido'
// quem/quando moveu esse item pela última vez (cai no log antigo do pedido inteiro)
export function logEtapaItem(p, idx) {
  const raw = doMapaDoItem(p?.etapas, p, idx)
  if (raw && typeof raw === 'object' && raw.por) return { por: raw.por, em: raw.em || '' }
  if (p?.etapaPor) return { por: p.etapaPor, em: p.etapaEm || '' }
  return null
}
// quem avança quem
export function proximaEtapaItem(et) {
  if (MODO_ORDER.includes(et)) return 'montagem'
  if (et === 'montagem') return 'expedicao'
  if (et === 'expedicao') return 'expedido'
  return null
}
export function etapaAnteriorItem(et, linha) {
  if (et === 'montagem') return linha || null
  if (et === 'expedicao') return 'montagem'
  if (et === 'expedido') return 'expedicao'
  return null
}
// materializa o mapa de etapas de TODOS os itens (congela o fallback do legado)
// e aplica a etapa nova nos índices pedidos. Devolve o mapa pronto pro updateDoc.
// `destino` pode ser um id de etapa ou uma função (idx) => etapa — o card de
// Montagem/Expedição pode ter itens de linhas diferentes voltando cada um pra sua.
export function mapaEtapasCom(p, idxs, destino, quem) {
  const alvo = new Set(idxs)
  const paraOnde = typeof destino === 'function' ? destino : () => destino
  const mapa = {}
  const agora = new Date().toISOString()
  ;(p.itens || []).forEach((_, i) => {
    const k = keyDoItem(p, i)
    const anterior = doMapaDoItem(p?.etapas, p, i)
    const base = (typeof anterior === 'object' && anterior) ? anterior : {}
    const novo = alvo.has(i) ? paraOnde(i) : null
    mapa[k] = novo
      ? { et: novo, por: quem || '', em: agora }
      : { et: etapaDoItem(p, i), por: base.por || '', em: base.em || '' }
  })
  return mapa
}

// ---------- AUDITORIA (append-only) ----------
// Um registro POR ITEM movido: quem, quando, de onde para onde. Vai no MESMO
// writeBatch da mudança de etapa — ou o item anda E fica registrado, ou nada
// acontece. Movimento sem rastro seria justamente o buraco que a auditoria
// existe para não ter. `quem` = { porUid, porNome, porEmail, perfil, ip }.
export function registrosAuditoria(p, idxs, destino, quem, materialDe) {
  const paraOnde = typeof destino === 'function' ? destino : () => destino
  const mat = materialDe || (() => '')
  const agora = new Date().toISOString()
  return (idxs || []).map((i) => {
    const it = p.itens?.[i] || {}
    return {
      idVenda: p.idVenda || '',
      cliente: p.cliente || '',
      itemKey: keyDoItem(p, i),
      produto: it.produto || '',
      qtd: Number(it.qtd) || 0,
      linha: linhaDoItem(p, i) || '',
      material: mat(i) || '',
      de: etapaDoItem(p, i),
      para: paraOnde(i),
      quando: agora,
      ...quem,
    }
  })
}

// pedido que nunca passou pelo quadro (nem `etapa` antigo, nem mapa `etapas`).
// É o legado que já estava em campo — tudo dele conta como pronto para entregar,
// senão a Rota esvaziava no dia que a produção por item entrou no ar.
export function pedidoSemEtapa(p) {
  return !p?.etapa && !(p?.etapas && Object.keys(p.etapas).length)
}
// índices dos itens liberados para a Rota/entrega
export function idxProntos(p) {
  const todos = (p?.itens || []).map((_, i) => i)
  if (pedidoSemEtapa(p)) return todos
  return todos.filter((i) => itemExpedido(p, i))
}
// devolve o pedido "fatiado" só com o que já pode ser entregue, guardando o
// original em _todos/_idxs (a entrega precisa saber o que sobra no pedido).
export function fatiaProntos(p) {
  const idxs = idxProntos(p)
  return {
    ...p,
    // _linha carimbada aqui: depois da fatia o índice muda, e a Rota/romaneio
    // precisam do selo da linha de cada item
    itens: idxs.map((i) => ({ ...p.itens[i], _linha: linhaDoItem(p, i) })),
    _todos: p.itens || [],
    _idxs: idxs,
    _pendentes: (p.itens || []).length - idxs.length,
  }
}

// valor dos itens escolhidos — só quando a planilha trouxe valor POR ITEM.
// Sem essa coluna, devolve null e a tela mostra o total do pedido.
export function valorDosItens(p, idxs) {
  const itens = (idxs || []).map((i) => p.itens?.[i]).filter(Boolean)
  if (!itens.length || itens.some((it) => !(Number(it.valor) > 0))) return null
  return itens.reduce((s, it) => s + Number(it.valor), 0)
}

// ---------- ACABAMENTOS POR ITEM (fluxo da gráfica: laminação + furo) ----------
// definidos pelo designer na Triagem; executados na Montagem.
export const LAMINACOES = [
  { id: 'nenhuma', nm: 'Nenhuma' },
  { id: 'fosca', nm: 'Fosca' },
  { id: 'brilho', nm: 'Brilho' },
]
export const nomeLaminacao = (id) => (LAMINACOES.find((l) => l.id === id)?.nm || 'Nenhuma')
export const LAMINACOES_VALIDAS = LAMINACOES.map((l) => l.id) // ['nenhuma','fosca','brilho']
// { laminacao: '' (não marcada) | 'nenhuma'|'fosca'|'brilho', furo: bool } — do item idx
export function acabamentoDoItem(p, idx) {
  const a = doMapaDoItem(p?.acabamentos, p, idx) || {}
  return { laminacao: a.laminacao || '', furo: !!a.furo }
}
// tem acabamento gravado para esse item? (distingue "não marcado" de "marcado nenhuma")
export function temAcabamento(p, idx) {
  return doMapaDoItem(p?.acabamentos, p, idx) !== undefined
}
// a laminação é OBRIGATÓRIA (uma das 3 opções, incluindo "nenhuma"/sem laminação)
export function acabamentoItemOk(ac) { return LAMINACOES_VALIDAS.includes(ac.laminacao) }
// todos os itens da linha GRÁFICA têm a laminação marcada?
export function acabamentosCompletos(p) {
  const itens = p?.itens || []
  for (let i = 0; i < itens.length; i++) {
    if (linhaDoItem(p, i) !== 'GRAFICA') continue
    if (!acabamentoItemOk(acabamentoDoItem(p, i))) return false
  }
  return true
}
// texto curto p/ a Montagem: "laminação fosca · com furo"
export function fmtAcabamento(ac) {
  const lam = ac.laminacao && ac.laminacao !== 'nenhuma'
    ? `laminação ${nomeLaminacao(ac.laminacao).toLowerCase()}`
    : 'sem laminação'
  return `${lam} · ${ac.furo ? 'com furo' : 'sem furo'}`
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

export const fmtDataHora = (iso) =>
  (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '')

// ---------- SAÍDA PARA ENTREGA ----------
// O estado que faltava entre "expedido" (pronto, parado na expedição) e o doc de
// `entregues`: o caminhão saiu com a rota. Fica no PEDIDO e não no item, porque o
// caminhão leva tudo que estava pronto. Entrega parcial LIMPA esses campos do que
// sobrou — o resto continua na fábrica, não saiu com ninguém.
export const saiuParaEntrega = (p) => !!p?.saidaEm

// quem enxerga o assistente de voz (o FAB 🎤). Fonte única: o App decide se
// renderiza e o Layout precisa saber para não encostar o "voltar ao topo" nele.
export const veAssistenteVoz = (perfil) => ['dono', 'designer', 'financeiro'].includes(perfil)

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

// A ciência por (tipo|vendedor|rota) foi REMOVIDA: era um retrato do momento e
// cobria pedido que entrasse na rota depois. Quem indexa agora é
// indexaCienciasPorPedido, que continua lendo os registros de rota antigos.

// ---------- CIÊNCIA POR PEDIDO ----------
// O PEDIDO é a unidade. A ciência de rota guardava `pedidoIds` num retrato do
// momento em que foi dada — pedido que entrasse na rota depois ficava coberto
// por um "✓ ciente" que nunca o viu. Agora cada pedido tem a sua.
// O retrato antigo continua valendo COMO LEITURA: um pedido está ciente se tem
// ciência própria OU se o id dele está numa ciência de rota antiga. Sem isso,
// tudo que já foi conferido voltaria a aparecer como pendente no dia da virada.
export function indexaCienciasPorPedido(lista) {
  const map = {}
  const guarda = (tipo, id, c) => {
    const k = `${tipo}|${id}`
    if (!map[k] || new Date(c.quando) > new Date(map[k].quando)) map[k] = c
  }
  for (const c of lista || []) {
    if (!c?.tipo) continue
    if (c.idVenda) guarda(c.tipo, c.idVenda, c)
    else for (const id of c.pedidoIds || []) guarda(c.tipo, id, c) // legado por rota
  }
  return map
}
export const cienciaDoPedido = (map, tipo, idVenda) => (map || {})[`${tipo}|${idVenda}`] || null
// pedidos da lista que ainda NÃO têm ciência desse tipo
export const semCiencia = (map, tipo, ps) =>
  (ps || []).filter((p) => !cienciaDoPedido(map, tipo, p.idVenda))
// documento de ciência de UM pedido. quem = { porUid, porEmail, porNome, ip }
export function docCiencia({ tipo, vendedor, rota, idVenda, quem }) {
  return {
    tipo,
    vendedor: vendedor || '',
    rota: rota || '',
    idVenda,
    ...quem,
    quando: new Date().toISOString(),
  }
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

// setor/etapa citado na pergunta — ou null. As colunas de linha (silk/gliche/
// gráfica) também são etapas: é onde o item está antes da montagem.
function extraiEtapa(t) {
  if (/MONTAGEM/.test(t)) return 'montagem'
  if (/EXPEDI/.test(t)) return 'expedicao'    // expedição / expedir
  if (/\bGRAFICA\b/.test(t)) return 'GRAFICA'
  if (/SILK/.test(t)) return 'PRODUCAO'
  if (/GLICHE|CLICHE/.test(t)) return 'GLICHE'
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

  // ---------- ETAPA / SETOR: "quantos pedidos na montagem" ----------
  // A produção anda por ITEM, então a conta é de itens — e diz em quantos pedidos.
  const etapaPerg = extraiEtapa(t)
  if (etapaPerg && /(PEDIDO|QUANT|FALTA|SETOR|ANDAMENTO|PRODUCAO)/.test(t)) {
    let itens = 0
    const peds = new Set()
    for (const p of lista) {
      (p.itens || []).forEach((_, i) => {
        if (etapaDoItem(p, i) !== etapaPerg) return
        itens++; peds.add(p.idVenda)
      })
    }
    const escSemLinha = partes.filter((x) => !(linha && x === `na ${linha.nome}`)).join(' ')
    const escE = escSemLinha ? ' ' + escSemLinha : ''
    const nm = nomeEtapaItem(etapaPerg).toLowerCase()
    if (!itens) return `Não tem nenhum item na ${nm}${escE}.`
    return `${itens === 1 ? 'Tem 1 item' : `Tem ${itens} itens`} na ${nm}, `
      + `${peds.size === 1 ? 'de 1 pedido' : `de ${peds.size} pedidos`}${escE}.`
  }

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
  const rota = f.rota || ''
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
    if (rota && (p.rota || 'SEM ROTA') !== rota) return false
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
  if (f.rota) partes.push(`rota ${f.rota}`)
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
  return Object.values(porId).map(carimbaKeys)
}

// grava a chave estável em cada item (o estado por item é indexado por ela)
export function carimbaKeys(p) {
  const ks = keysDoPedido(p)
  if (p.itens) p.itens = p.itens.map((it, i) => ({ ...it, key: ks[i] }))
  return p
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
  return Object.values(porId).map(carimbaKeys)
}
