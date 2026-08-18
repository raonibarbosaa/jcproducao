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

// Abas que o usuário enxerga. O perfil dá a base, mas para o OPERADOR os
// SETORES também abrem aba: quem tem Expedição ou Entrega liberada trabalha com
// carga e precisa da tela de Entregas. Sem isso a permissão de dois eixos fica
// pela metade — o setor liberava o que ele move no quadro, mas não a tela onde
// esse trabalho acontece.
export function abasDoUsuario(perfil, setores, base) {
  const abas = [...(base || [])]
  if (perfil !== 'operador') return abas
  const meus = (setores || []).map(normSetor)
  if ((meus.includes('expedicao') || meus.includes('entrega')) && !abas.includes('carga')) {
    abas.splice(abas.indexOf('producao') + 1 || abas.length, 0, 'carga')
  }
  // quem trabalha na expedição também precisa VER os erros reportados — o
  // "já foi entregue" do vendedor é justamente o aviso de não carregar de novo
  // o que já saiu. Só leitura: fechar o aviso continua sendo do escritório.
  if ((meus.includes('expedicao') || meus.includes('entrega')) && !abas.includes('erros')) {
    abas.push('erros')
  }
  return abas
}

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
// Quanto deste item está NESTE painel. Com produção parcial o mesmo item aparece
// em mais de uma coluna (50 na linha, 50 na montagem) — por isso a resposta é uma
// quantidade, e "pertence ao painel" é só "quantidade > 0". Manter as duas coisas
// na MESMA função é o que impede o quadro e os contadores de discordarem.
export function qtdNoPainel(painel, p, idx, mat) {
  if (painel?.tipo === 'linha') {
    if (painel.linha !== linhaDoItem(p, idx)) return 0
    return qtdNaEtapa(p, idx, painel.linha)
  }
  if (!itemNoPainel(painel, mat)) return 0
  return qtdNaEtapa(p, idx, painel?.etapa)
}
export const itemPertenceAoPainel = (painel, p, idx, mat) => qtdNoPainel(painel, p, idx, mat) > 0

// ---------- CARGA (a viagem do caminhão) ----------
// A tela de Rota mostra o que ESTÁ pronto agora — é uma foto do momento. A carga
// é outra coisa: o documento de uma viagem. O operador da expedição escolhe o que
// entra neste caminhão (podendo misturar rotas e deixar pedido para trás), confere
// item a item ao carregar, e o romaneio passa a ser o papel dessa carga.
// Snapshot de propósito: o que foi expedido depois não entra numa carga já montada.
export const STATUS_CARGA = {
  MONTANDO: 'montando', SAIU: 'saiu', CONCLUIDA: 'concluida',
  // carga desfeita pelo dono: fica no histórico como registro, mas LIBERA os
  // itens para entrar noutra carga (senão ficariam presos a uma viagem que
  // não aconteceu)
  CANCELADA: 'cancelada',
}
// status que ainda seguram os itens: os outros liberam para uma carga nova
export const CARGA_SEGURA_ITENS = (st) =>
  st === STATUS_CARGA.MONTANDO || st === STATUS_CARGA.SAIU

// O que de um pedido pode entrar numa carga — um registro por VOLUME.
// É o volume que o motorista conta e que a conferência marca, e volumes do mesmo
// item podem ir em viagens diferentes. Item legado (que foi expedido antes de
// existir embalo) entra como um volume único, sem id.
export function itensParaCarga(p) {
  const out = []
  ;(p?.itens || []).forEach((it, i) => {
    const comum = {
      idVenda: p.idVenda,
      itemKey: keyDoItem(p, i),
      produto: it.produto || '',
      qtdItem: arredondaQtd(it.qtd),
      linha: linhaDoItem(p, i),
      material: '',          // preenchido na tela, que tem o cadastro de Itens
      conferido: false,
    }
    const vols = volumesDoItem(p, i).filter((v) => v.et === 'expedido')
    if (vols.length) {
      for (const v of vols) out.push({ ...comum, volumeId: v.id, volumeN: v.n, qtd: v.qtd })
    } else {
      const q = qtdNaEtapa(p, i, 'expedido')
      if (q > 0) out.push({ ...comum, volumeId: '', volumeN: 0, qtd: q })
    }
  })
  return out
}

// chave de comprometimento com uma carga: por VOLUME quando ele existe
export const chaveCarga = (it) => `${it.idVenda}|${it.itemKey}|${it.volumeId || ''}`

// próximo número da carga. Volume é de poucas por dia e um operador só, então
// max+1 basta; se um dia duas telas criarem no mesmo segundo, o número repete —
// o id do documento continua único, só o rótulo colide.
export const proximoNumeroCarga = (cargas) =>
  (cargas || []).reduce((m, c) => Math.max(m, Number(c.numero) || 0), 0) + 1

export const cargaAberta = (cargas) =>
  (cargas || []).find((c) => c.status === STATUS_CARGA.MONTANDO) || null

export function progressoConferencia(carga) {
  const itens = carga?.itens || []
  return { total: itens.length, conferidos: itens.filter((i) => i.conferido).length }
}
export const cargaConferida = (carga) => {
  const { total, conferidos } = progressoConferencia(carga)
  return total > 0 && conferidos === total
}

// pedidos distintos e rotas de uma carga (para o cabeçalho e o romaneio)
export const pedidosDaCarga = (carga) => [...new Set((carga?.itens || []).map((i) => i.idVenda))]
export function agrupaCargaPorPedido(carga, pedidos) {
  const porId = new Map((pedidos || []).map((p) => [String(p.idVenda), p]))
  const mapa = {}
  for (const it of carga?.itens || []) {
    ;(mapa[it.idVenda] ??= { idVenda: it.idVenda, p: porId.get(String(it.idVenda)) || null, itens: [] })
      .itens.push(it)
  }
  return Object.values(mapa)
}

// ---------- RELÓGIO: quanto tempo o item passa em cada etapa ----------
// Serve para a estatística da linha (onde a fila cresce) e para o card avisar
// "está há 6 dias no silk". O tempo medido é quase todo FILA, não trabalho — em
// produção por encomenda a peça passa a maior parte do tempo esperando —, e é
// justamente a fila que dá para atacar.
//
// Onde mora: dentro de `etapas[key]`, junto do resto — o import sobrescreve
// `itens`, então qualquer coisa que precise sobreviver mora no mapa por chave.
//   desde:  { <etapa>: iso }  quando esta etapa PASSOU A TER quantidade
//   tempos: { <etapa>: ms  }  somado das passagens já ENCERRADAS
//
// É por item × ETAPA (e não um relógio só por item) porque com produção parcial
// o mesmo item fica em duas etapas ao mesmo tempo: 50 na montagem e 50 no silk.
// Um relógio só devolveria "última movimentação", que não responde onde a fila
// está — e achar a fila é o objetivo.
export const MS_DIA = 86400000

// Compara a distribuição ANTES × DEPOIS e carimba as entradas/saídas de etapa.
// Roda no fim de todo construtor de mapa, num lugar só: espalhar o carimbo por
// cada caminho de movimentação deixaria algum de fora, e um relógio que às vezes
// não conta é pior que nenhum — ninguém desconfia de um número que existe.
export function carimbaTempos(p, mapaNovo, agora) {
  if (!mapaNovo || typeof mapaNovo !== 'object') return mapaNovo
  const t = agora || new Date().toISOString()
  const depois = { ...p, etapas: mapaNovo }
  const out = { ...mapaNovo }
  ;(p?.itens || []).forEach((_, i) => {
    const k = keyDoItem(p, i)
    const entrada = out[k]
    if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return
    const antes = distribuicaoDoItem(p, i)
    const dep = distribuicaoDoItem(depois, i)
    const desde = { ...(entrada.desde || {}) }
    const tempos = { ...(entrada.tempos || {}) }
    // De quando este item está parado, na falta de carimbo: a última
    // movimentação, senão a entrada do pedido no sistema. É o que salva a
    // PRIMEIRA passagem de cada item — no dia em que o relógio entra no ar
    // ninguém tem carimbo, e sem isto toda fila que já existia fecharia com
    // zero e as etapas cheias seriam remarcadas como recém-chegadas.
    const antigo = doMapaDoItem(p?.etapas, p, i)?.em || p?.importadoEm || p?.dataVenda || t
    for (const et of new Set([...Object.keys(antes), ...Object.keys(dep)])) {
      const tinha = (antes[et] || 0) > 0
      const tem = (dep[et] || 0) > 0
      if (tem) {
        // já estava aqui: NÃO reinicia o relógio por causa de um movimento que
        // foi de outra parte do item (com produção parcial isso é rotina)
        if (!desde[et]) desde[et] = tinha ? antigo : t
      } else if (tinha) {
        const ini = Date.parse(desde[et] || antigo)
        const ms = Number.isFinite(ini) ? Date.parse(t) - ini : 0
        if (ms > 0) tempos[et] = (tempos[et] || 0) + ms
        delete desde[et]
      }
    }
    out[k] = { ...entrada, desde, tempos }
  })
  return out
}

// Desde quando o item está NESTA etapa. Sem carimbo (item que já estava parado
// antes de o relógio existir) cai na última movimentação e, por fim, na entrada
// do pedido no sistema: um número aproximado é mais útil que um traço.
export function desdeNaEtapa(p, idx, etapa) {
  const e = doMapaDoItem(p?.etapas, p, idx)
  return e?.desde?.[etapa] || e?.em || p?.importadoEm || p?.dataVenda || ''
}

// QUANDO o item entrou nesta etapa — a data e a hora, não só "há 3 dias".
// ⚠️ Devolve também se o carimbo é EXATO: sem `desde`, o valor vem do fallback
// (última movimentação → importação → venda) e é uma APROXIMAÇÃO. Mostrar
// aproximação como hora cravada vira discussão no chão de fábrica ("esse item
// não chegou 08:12 aqui"), e é o tipo de número que ninguém desconfia.
export function entradaNaEtapa(p, idx, etapa) {
  const e = doMapaDoItem(p?.etapas, p, idx)
  return { iso: desdeNaEtapa(p, idx, etapa), exato: !!e?.desde?.[etapa] }
}

// Tempo (ms) que o item está/esteve nesta etapa, contando a passagem atual.
export function tempoNaEtapa(p, idx, etapa, agora) {
  const e = doMapaDoItem(p?.etapas, p, idx)
  const t = agora ? Date.parse(agora) : Date.now()
  let ms = Number(e?.tempos?.[etapa]) || 0
  if (qtdNaEtapa(p, idx, etapa) > 0) {
    const ini = Date.parse(desdeNaEtapa(p, idx, etapa))
    if (Number.isFinite(ini)) ms += Math.max(0, t - ini)
  }
  return ms
}

// Idade do item desde que ENTROU no sistema — inclui o tempo em triagem, que é
// invisível em todo relatório de chão de fábrica e costuma ser dos maiores.
export function idadeDoItem(p, idx, agora) {
  const ini = Date.parse(p?.importadoEm || p?.dataVenda || desdeNaEtapa(p, idx, etapaDoItem(p, idx)))
  if (!Number.isFinite(ini)) return null
  return Math.max(0, (agora ? Date.parse(agora) : Date.now()) - ini)
}

// Idade do PEDIDO: a do item mais antigo ainda em produção (é ele que segura a
// entrega). Sem item pendente, devolve null — pedido que já saiu não "espera".
export function idadeDoPedido(p, agora) {
  let maior = null
  ;(p?.itens || []).forEach((_, i) => {
    if (qtdEmProducao(p, i) <= 0) return
    const v = idadeDoItem(p, i, agora)
    if (v != null && (maior == null || v > maior)) maior = v
  })
  return maior
}

// "3d 4h" / "5h 20min" / "12min" — tempo CORRIDO (decisão do dono em 14/08/2026):
// é o que o cliente sente. Ele espera 5 dias, não 3 dias úteis.
export function fmtDuracao(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—'
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ${min % 60}min`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

// só o número de dias inteiros — para pintar o card de acordo com a espera
export const diasDe = (ms) => (ms == null ? null : Math.floor(ms / MS_DIA))

// ---------- PLANO DE ENTREGA (a previsão da viagem) ----------
// Camada ACIMA da carga, e a diferença entre as duas é a razão de existirem:
//   PLANO  guarda NÚMEROS DE PEDIDO — na hora de planejar o volume ainda nem
//          existe, e metade do que vai na viagem continua na produção.
//   CARGA  guarda VOLUMES — é o que o motorista conta e a conferência marca.
// Misturar os dois faria a conferência cobrar item que não está no caminhão.
//
// O plano NÃO se encerra ao liberar: ele solta o que ficou pronto, mantém o
// resto e continua acompanhando a rota até alguém encerrar. Uma rota rende
// várias viagens, e é isso que a tela precisa refletir.
export const STATUS_PLANO = { ABERTO: 'aberto', ENCERRADO: 'encerrado' }

export const proximoNumeroPlano = (planos) =>
  (planos || []).reduce((m, p) => Math.max(m, Number(p.numero) || 0), 0) + 1

export const planosAbertos = (planos) =>
  (planos || []).filter((p) => (p.status || STATUS_PLANO.ABERTO) === STATUS_PLANO.ABERTO)

// Um pedido só pode estar num plano aberto por vez — senão duas viagens contam
// com a mesma mercadoria e as duas se planejam errado.
export function pedidosEmPlanos(planos, exceto) {
  const m = new Map()
  for (const pl of planosAbertos(planos)) {
    if (exceto && pl.id === exceto) continue
    for (const id of pl.pedidos || []) m.set(String(id), pl)
  }
  return m
}

// ---------- A PREVISÃO É DO DIA (antes era de um vendedor + uma rota) ----------
// O caminhão não sai por vendedor: sai num DIA, e nesse dia leva o que está
// prometido para aquela data — inclusive pedidos de vendedores diferentes que
// rodam a mesma região. Amarrada ao vendedor, a previsão obrigava a criar uma por
// vendedor e nunca mostrava o dia inteiro.

// a data de entrega VIVA do pedido, em 'YYYY-MM-DD'.
// Partes LOCAIS, não `toISOString()`: em UTC-3 o ISO de uma data manual pode cair
// no dia anterior, e a viagem inteira mudaria de dia por causa do fuso.
export function diaDaPrevisao(p) {
  if (!p?.previsao) return null
  const d = new Date(p.previsao)
  if (isNaN(d)) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// a entrega deste pedido é NO dia ou ANTES dele?
// O atrasado entra de propósito: é justamente quem não pode perder mais um
// caminhão. ⚠️ Pedido SEM data também entra — sumir do planejamento é pior do que
// aparecer a mais, mesma regra de `temTrabalhoNaProducao`.
export function entregaAte(p, dia) {
  if (!dia) return true
  const d = diaDaPrevisao(p)
  if (!d) return true
  return d <= dia
}

// Este pedido é do bolo natural desta previsão? FONTE ÚNICA — a lista, o aviso de
// "veio de fora" e o contador do card têm que responder a mesma coisa.
// Quem decide o critério é o campo que o plano TEM: previsão nova anda por data,
// as antigas (vendedor + rota, sem `dataEntrega`) seguem exatamente como eram.
// Nenhuma migração: o formato velho continua legível, como nas ciências.
export function doPlano(p, pl) {
  if (!pl) return false
  if (pl.dataEntrega) return entregaAte(p, pl.dataEntrega)
  return (p.vendedor || '') === (pl.vendedor || '')
    && (p.rota || 'SEM ROTA') === (pl.rota || 'SEM ROTA')
}

export const planoPorData = (pl) => !!pl?.dataEntrega

// como a previsão se chama na tela, no card e na folha impressa
export const rotuloPlano = (pl) => (planoPorData(pl)
  ? `📅 ${fmtData(pl.dataEntrega + 'T00:00:00')}`
  : `📍 ${pl?.rota || 'SEM ROTA'}${pl?.vendedor ? ` · ${pl.vendedor}` : ''}`)

// Com o dia inteiro na tela, a lista solta vira um paredão. Agrupa por
// ROTA × VENDEDOR e mostra as CIDADES de cada grupo.
// ⚠️ NÃO funde rotas de nome igual de vendedores diferentes: a "ROTA 02" da
// GLAYCE às vezes é a mesma região da do Sérgio e às vezes não (decisão do dono
// em 17/08/2026). O sistema mostra as cidades lado a lado; juntar na viagem é
// decisão de quem monta.
export function agrupaPlanoPorRota(pedidos, cadastros) {
  const prazo = (a, b) => String(a.previsao || '9999').localeCompare(String(b.previsao || '9999'))
    || String(a.idVenda).localeCompare(String(b.idVenda))
  const por = new Map()
  for (const p of pedidos || []) {
    const vendedor = p.vendedor || '—'
    const rota = p.rota || 'SEM ROTA'
    const chave = `${vendedor}|${rota}`
    const g = por.get(chave) || { chave, vendedor, rota, cidades: [], pedidos: [] }
    g.pedidos.push(p)
    if (p.cidade && !g.cidades.includes(p.cidade)) g.cidades.push(p.cidade)
    por.set(chave, g)
  }
  return [...por.values()]
    .map((g) => ({ ...g, cidades: g.cidades.sort(), pedidos: g.pedidos.sort(prazo) }))
    // ⚠️ Aqui a ordem é pelo NOME da rota, não pela posição no cadastro — ao
    // contrário do resto do sistema. Com vários vendedores na mesma viagem não
    // existe UMA sequência: cada um roda a sua, e a posição 0 de um não vem
    // antes da posição 0 do outro. Pelo nome, as rotas homônimas ficam LADO A
    // LADO — que é exatamente o que deixa comparar as cidades e decidir se a
    // ROTA 02 dele é a mesma ROTA 02 dela. A posição no cadastro só desempata.
    .sort((a, b) => a.rota.localeCompare(b.rota, 'pt-BR')
      || (ordemRota(a.vendedor, a.rota, cadastros) - ordemRota(b.vendedor, b.rota, cadastros))
      || a.vendedor.localeCompare(b.vendedor))
}

// Onde estão os itens deste pedido que AINDA não saíram, agrupados por etapa.
// É a resposta de "esse pedido está vindo, mas vindo de onde" — sem isso o
// planejador vê só "não está pronto" e não sabe se falta um dia ou uma semana.
export const pendenciasDoPedido = (p, itensCad) =>
  resumePendencias(itensPendentesDoPedido(p, itensCad))

// "N em <etapa>" a partir do detalhe. Fonte ÚNICA do agrupamento: quem filtra o
// detalhe (por material, por exemplo) resume a MESMA lista que está mostrando —
// senão a linha do card diria 3 e a lista aberta embaixo dela mostraria 1.
export function resumePendencias(itens) {
  const por = {}
  for (const it of itens || []) {
    ;(por[it.etapa] ??= { etapa: it.etapa, nome: it.nome, itens: 0 }).itens++
  }
  return Object.values(por).sort((a, b) => ordemPendencia(a.etapa) - ordemPendencia(b.etapa))
}

// Item a item: QUAL produto ainda não saiu, quanto falta e em que etapa ele está.
// `pendenciasDoPedido` é só o resumo disto. Quem vai atrás do serviço precisa do
// PRODUTO — "1 em Montagem" não diz se é a sacola grande ou a etiqueta, e é o
// produto que alguém tem que ir buscar no chão de fábrica.
export function itensPendentesDoPedido(p, itensCad) {
  const out = []
  ;(p?.itens || []).forEach((it, i) => {
    const qtd = qtdEmProducao(p, i)
    if (qtd <= 0) return
    const et = etapaDoItem(p, i)
    if (!et) return
    const mat = materialDoItem(it, itensCad)
    out.push({
      idx: i,
      key: it.key || keyDoItem(p, i),
      produto: it.produto || '',
      linha: linhaDoItem(p, i),
      qtd,
      etapa: et,
      nome: nomeEtapaItem(et),
      material: mat,
      materialNome: nomeDoMaterial(mat) || SEM_MATERIAL,
    })
  })
  return out.sort((a, b) => ordemPendencia(a.etapa) - ordemPendencia(b.etapa))
}

// Item cujo material o cadastro não conhece continua APARECENDO, num grupo
// próprio: quem monta papel não monta plástico, mas trabalho que ninguém vê é
// trabalho que atrasa — é a mesma regra das 3 montagens do quadro.
export const SEM_MATERIAL = '⚠ Material não cadastrado'

// ordem de leitura das etapas pendentes: as 3 linhas na ordem do fluxo, depois
// montagem e expedição. `posNoFluxo` devolve 0 para as três linhas (ele responde
// outra pergunta), e sem o desempate silk/clichê/gráfica saem em ordem aleatória.
const ordemPendencia = (et) => posNoFluxo(et) * 10 + Math.max(0, MODO_ORDER.indexOf(et))

// As pendências de VÁRIOS pedidos agrupadas por ETAPA e, dentro dela, por
// MATERIAL — a folha que se leva para o chão de fábrica. Quem cobra serviço anda
// por SETOR (uma lista por pedido obrigaria a varrer a folha inteira para saber
// o que é da montagem), e dentro do setor quem faz papel não é quem faz plástico
// — é a mesma divisão das 3 montagens do quadro.
export function pendenciasPorEtapa(pedidos, itensCad) {
  const prazo = (a, b) => String(a.p.previsao || '').localeCompare(String(b.p.previsao || ''))
    || String(a.p.idVenda).localeCompare(String(b.p.idVenda))
  const por = new Map()
  for (const p of pedidos || []) {
    for (const it of itensPendentesDoPedido(p, itensCad)) {
      const g = por.get(it.etapa)
        || { etapa: it.etapa, nome: it.nome, itens: [], mats: new Map() }
      const linha = { ...it, p }
      g.itens.push(linha)
      const mg = g.mats.get(it.material)
        || { id: it.material, nome: it.materialNome, itens: [] }
      mg.itens.push(linha)
      g.mats.set(it.material, mg)
      por.set(it.etapa, g)
    }
  }
  return [...por.values()]
    .sort((a, b) => ordemPendencia(a.etapa) - ordemPendencia(b.etapa))
    .map(({ mats, ...g }) => ({
      ...g,
      // dentro do setor/material, a ordem é o PRAZO: é por ele que se prioriza
      itens: g.itens.sort(prazo),
      materiais: [...mats.values()]
        .sort((a, b) => ordemMaterial(a.id) - ordemMaterial(b.id))
        .map((mg) => ({ ...mg, itens: mg.itens.sort(prazo) })),
    }))
}

// ordem dos materiais na folha: a de `MATERIAIS` (fonte única), com o que o
// cadastro não reconhece no fim — visível, nunca escondido
const ordemMaterial = (id) => {
  const i = MATERIAL_IDS.indexOf(id)
  return i < 0 ? MATERIAL_IDS.length : i
}

// Situação de um pedido dentro do plano: o que já dá para carregar e o que falta.
// `livres` são os volumes ainda não comprometidos com outra carga (quem calcula
// isso é a tela, que conhece as cargas abertas).
export function situacaoNoPlano(p, livres, itensCad) {
  const vols = livres || []
  return {
    volumes: vols.length,
    peso: pesoDaLista(vols, itensCad),
    pendencias: pendenciasDoPedido(p),
    pronto: vols.length > 0,
  }
}

// há quantos dias inteiros isso aconteceu (null quando não há data)
export function diasDesde(iso) {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / 86400000))
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

// As rotas CADASTRADAS de um vendedor, na ordem em que ele as roda.
// Vem do cadastro e não dos pedidos da tela: dá para programar a viagem de uma
// rota cujos pedidos estão todos na produção — que é justamente o caso em que
// planejar vale a pena. Tirar a lista dos pedidos esconderia essas rotas.
export const rotasDoVendedor = (vendedorNome, cadastros) =>
  ((cadastros || []).find((x) => normaliza(x.nome) === normaliza(vendedorNome))?.rotas || [])
    .map((r) => r.nome).filter(Boolean)

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
      const et = etapaDoItem(p, i)
      // desde quando está parado AQUI: é a pergunta que o vendedor faz ao
      // cliente ("está no silk desde quando?") e que nenhuma tela dele
      // respondia — só dava para ver em que etapa estava, não há quanto tempo
      const ent = entradaNaEtapa(p, i, et)
      u.itens.push({
        produto: it.produto, qtd: it.qtd,
        linha: linhaDoItem(p, i), etapa: et, entregue: false,
        desde: ent.iso, desdeExato: ent.exato,
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

// Materializa `etapas` inteiro aplicando movimentos de QUANTIDADE.
// movimentos = [{ idx, de, para, qtd }]. Materializa o mapa todo (como o
// mapaEtapasCom fazia) para congelar o legado: item que não se move fica gravado
// já no formato novo, e nunca mais depende do fallback de leitura.
export function mapaEtapasComQtd(p, movimentos, quem) {
  return carimbaTempos(p, mapaEtapasComQtdCru(p, movimentos, quem))
}
function mapaEtapasComQtdCru(p, movimentos, quem) {
  const porIdx = new Map((movimentos || []).map((m) => [m.idx, m]))
  const agora = new Date().toISOString()
  const mapa = {}
  ;(p.itens || []).forEach((_, i) => {
    const k = keyDoItem(p, i)
    const m = porIdx.get(i)
    const movido = m ? moveQtdItem(p, i, m.de, m.para, m.qtd) : null
    const ant = doMapaDoItem(p?.etapas, p, i)
    // Item já embalado anda por VOLUME, não por quantidade solta: preservar a
    // entrada como está evita que um avanço por quantidade apague os volumes —
    // seria perda silenciosa do que a montagem pesou.
    if (Array.isArray(ant?.volumes) && ant.volumes.length) { mapa[k] = ant; return }
    if (movido) {
      mapa[k] = { ...movido, por: quem || '', em: agora }
    } else {
      const d = distribuicaoDoItem(p, i)
      mapa[k] = {
        montagem: d.montagem, expedicao: d.expedicao, expedido: d.expedido, entregue: d.entregue,
        por: ant?.por || '', em: ant?.em || '',
      }
    }
  })
  return mapa
}

// Materializa `etapas` movendo VOLUMES. movs = [{ idx, ids, para }].
// Item sem volume (legado, que andou antes do embalo) é congelado como está.
export function mapaEtapasMovendoVolumes(p, movs, quem) {
  return carimbaTempos(p, mapaEtapasMovendoVolumesCru(p, movs, quem))
}
function mapaEtapasMovendoVolumesCru(p, movs, quem) {
  const porIdx = new Map((movs || []).map((m) => [m.idx, m]))
  const mapa = {}
  ;(p.itens || []).forEach((_, i) => {
    const k = keyDoItem(p, i)
    const m = porIdx.get(i)
    // voltar para a montagem é DESEMBALAR, não mover volume de etapa
    const novo = !m ? null
      : m.para === 'montagem' ? desfazEmbalagem(p, i, quem)
      : movePorVolume(p, i, m.ids, m.para, quem)
    if (novo) { mapa[k] = novo; return }
    const ant = doMapaDoItem(p?.etapas, p, i)
    if (Array.isArray(ant?.volumes) && ant.volumes.length) { mapa[k] = ant; return }
    const d = distribuicaoDoItem(p, i)
    mapa[k] = {
      montagem: d.montagem, expedicao: d.expedicao, expedido: d.expedido, entregue: d.entregue,
      por: ant?.por || '', em: ant?.em || '',
    }
  })
  return mapa
}

// ids dos volumes de um item que estão numa etapa
export const volumesNaEtapa = (p, idx, et) =>
  volumesDoItem(p, idx).filter((v) => v.et === et).map((v) => v.id)

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

// A etapa "principal" do item: a MAIS ATRASADA que ainda tem quantidade — é onde
// o trabalho está. Com produção parcial o item pode estar em duas etapas ao mesmo
// tempo (50 na linha, 50 na montagem); esta função existe para as telas que
// precisam de UM valor (quadro do vendedor, badge, auditoria). Quem precisa da
// divisão usa distribuicaoDoItem/qtdNaEtapa.
export function etapaDoItem(p, idx) {
  const d = distribuicaoDoItem(p, idx)
  const linha = linhaDoItem(p, idx)
  if (linha && d[linha] > 0) return linha
  for (const e of ['montagem', 'expedicao', 'expedido']) if (d[e] > 0) return e
  if (d.entregue > 0) return 'entregue'          // item já foi todo entregue
  return linha || ''                              // nada em lugar nenhum
}
// tem ALGO expedido — com produção parcial, 50 de 100 já contam para a Rota
export const itemExpedido = (p, idx) => qtdNaEtapa(p, idx, 'expedido') > 0

// ---------- QUANTIDADE POR ETAPA (produção parcial) ----------
// O item deixou de andar inteiro: de um item de 100 sacolas, 50 podem estar na
// montagem e 50 ainda na linha, e essa metade segue sozinha até a entrega.
//
// A distribuição fica em `etapas[key]` e NÃO partindo o item em dois no array
// `itens`: todo import do Posseidon sobrescreve `itens`, então a divisão se
// perderia no import seguinte. O mapa `etapas` é indexado pela chave estável.
//
// Guardamos SÓ o que já avançou; a quantidade na linha é o RESTO:
//     linha = qtd do item − (montagem + expedicao + expedido + entregue)
// Se o import mudar a quantidade do item, a linha se ajusta sozinha — nunca fica
// um total em desacordo com a soma das partes.
export const ETAPAS_QTD = ['montagem', 'expedicao', 'expedido', 'entregue']

// kg entra em jogo (plástico), então soma/subtração precisam de arredondamento:
// 0.1 + 0.2 em ponto flutuante não é 0.3, e isso viraria "resta 0.00000001 kg"
export const arredondaQtd = (n) => Math.round((Number(n) || 0) * 1000) / 1000

// ---------- VOLUMES (o pacote físico) ----------
// O motorista conta VOLUME, não pesa kg: "são 10 volumes" é conferível no
// caminhão, "são 100 kg" não é. Depois da montagem o item deixa de andar por
// quantidade solta e passa a andar por volume — cada um com o seu peso/contagem
// e o seu estado, porque volumes do mesmo item podem ir em viagens diferentes.
//
// A SOMA dos volumes é a quantidade REAL produzida, e ela não precisa bater com
// a pedida: quem embala é quem pesa. `produzido` guarda quantas unidades PEDIDAS
// foram baixadas do lote; a diferença entre os dois é a quebra de processo.
export const ETAPAS_VOLUME = ['expedicao', 'expedido', 'entregue']

export function volumesDoItem(p, idx) {
  const bruto = doMapaDoItem(p?.etapas, p, idx)
  const vs = Array.isArray(bruto?.volumes) ? bruto.volumes : []
  return vs.map((v, i) => ({
    id: v?.id || `v${i + 1}`,
    n: i + 1,
    qtd: arredondaQtd(v?.qtd),
    et: ETAPAS_VOLUME.includes(v?.et) ? v.et : 'expedicao',
  }))
}

// quanto há em volumes, no total ou numa etapa
export const qtdEmVolumes = (p, idx, et) =>
  arredondaQtd(volumesDoItem(p, idx)
    .filter((v) => !et || v.et === et)
    .reduce((s, v) => s + v.qtd, 0))

export const temVolumes = (p, idx) => volumesDoItem(p, idx).length > 0

// distribuição da quantidade do item entre as etapas, já com o legado resolvido
export function distribuicaoDoItem(p, idx) {
  const qtd = arredondaQtd(p?.itens?.[idx]?.qtd)
  const linha = linhaDoItem(p, idx) || 'triagem'
  const dist = { [linha]: 0, montagem: 0, expedicao: 0, expedido: 0, entregue: 0 }
  const bruto = doMapaDoItem(p?.etapas, p, idx)

  // Item já embalado: depois da montagem quem manda são os VOLUMES. As
  // quantidades de expedição/expedido/entregue passam a ser a soma deles, e a
  // linha desconta o `produzido` — as unidades PEDIDAS que saíram do lote, que
  // não são a mesma coisa que a soma real dos volumes (é aí que mora a quebra).
  if (temVolumes(p, idx)) {
    dist.montagem = Math.max(0, arredondaQtd(bruto?.montagem))
    for (const e of ETAPAS_VOLUME) dist[e] = qtdEmVolumes(p, idx, e)
    const produzido = Math.max(0, arredondaQtd(bruto?.produzido))
    dist[linha] = Math.max(0, arredondaQtd(qtd - dist.montagem - produzido))
    return dist
  }

  if (bruto && typeof bruto === 'object' && !Array.isArray(bruto)) {
    if (bruto.et) {
      // legado: o item inteiro numa etapa só. Etapa de linha não precisa de
      // nada — o resto cobre.
      if (ETAPAS_QTD.includes(bruto.et)) dist[bruto.et] = qtd
    } else {
      for (const e of ETAPAS_QTD) dist[e] = Math.max(0, arredondaQtd(bruto[e]))
    }
  } else {
    // legado mais antigo ainda: o pedido inteiro andava no campo `p.etapa`
    const leg = p?.etapa === 'entregue' ? 'expedido' : p?.etapa
    if (ETAPAS_QTD.includes(leg)) dist[leg] = qtd
  }
  const avancado = ETAPAS_QTD.reduce((s, e) => s + dist[e], 0)
  dist[linha] = Math.max(0, arredondaQtd(qtd - avancado))
  return dist
}

// quanto deste item está NESTA etapa ('PRODUCAO'|'GLICHE'|'GRAFICA' = a linha)
export function qtdNaEtapa(p, idx, etapa) {
  const d = distribuicaoDoItem(p, idx)
  return arredondaQtd(d[etapa])
}

// Quanto deste item ainda está DENTRO da fábrica: tudo menos o que já foi
// expedido ou entregue. É a MESMA fronteira do quadro — linha, montagem e
// expedição são painéis; `expedido` e `entregue` não são, e por isso o item
// some do quadro ao ser expedido.
//
// O BUG QUE ISSO CONSERTA: a Lista de Produção filtrava só por `p.status`, então
// pedido já expedido continuava listado como serviço a fazer até ser entregue (o
// pedido 5276 aparecia na lista e em nenhuma coluna do quadro). Pior no parcial:
// de 500 com 200 expedidas, a folha impressa mandava produzir 500 de novo.
export const qtdEmProducao = (p, idx) => {
  const d = distribuicaoDoItem(p, idx)
  return arredondaQtd(Object.entries(d)
    .reduce((s, [e, n]) => s + (e === 'expedido' || e === 'entregue' ? 0 : n), 0))
}
// o pedido ainda tem ALGUM serviço na fábrica?
// Sem itens (pedido antigo/Zeus) não há quantidade por item para consultar —
// aí vale o campo antigo do pedido inteiro. Na dúvida o pedido FICA: sumir da
// lista de produção é pior do que aparecer a mais.
export const temTrabalhoNaProducao = (p) => {
  if (!p?.itens?.length) return !['expedido', 'entregue'].includes(p?.etapa)
  return p.itens.some((_, i) => qtdEmProducao(p, i) > 0)
}

// o que ainda não terminou (tudo menos o que já foi entregue)
export const qtdPendente = (p, idx) => {
  const d = distribuicaoDoItem(p, idx)
  return arredondaQtd(Object.entries(d).reduce((s, [e, n]) => s + (e === 'entregue' ? 0 : n), 0))
}

// Move `qtd` de uma etapa para outra e devolve a entrada nova de `etapas[key]`.
// Guarda só as etapas avançadas — a linha continua sendo o resto.
export function moveQtdItem(p, idx, de, para, qtd) {
  const d = distribuicaoDoItem(p, idx)
  const mover = Math.min(arredondaQtd(qtd), arredondaQtd(d[de]))   // nunca move mais do que tem
  if (mover <= 0) return null
  const novo = {}
  for (const e of ETAPAS_QTD) novo[e] = arredondaQtd(d[e])
  if (ETAPAS_QTD.includes(de)) novo[de] = arredondaQtd(novo[de] - mover)
  if (ETAPAS_QTD.includes(para)) novo[para] = arredondaQtd(novo[para] + mover)
  return novo
}

// ---------- FECHAR A MONTAGEM EM VOLUMES ----------
// `volumes` = [{ qtd }] criados pelo operador. `consumido` = quantas unidades
// PEDIDAS saem do lote da montagem — normalmente tudo que estava lá quando ele
// diz que encerrou, ou só a parte fechada quando ainda falta produzir.
// A soma dos volumes NÃO precisa bater com `consumido`: é isso que registra a
// quebra (98,3 kg produzidos de um lote de 100 pedidas).
// ⚠️ Devolve a ENTRADA de `etapas[key]`, não o mapa inteiro — quem monta o mapa
// é a tela, e é ela que chama `carimbaTempos` no fim. Envolver esta função com
// o carimbo era no-op: ele procura chaves de item num objeto que é uma entrada.
export function fechaMontagemEmVolumes(p, idx, volumes, consumido, quem) {
  const d = distribuicaoDoItem(p, idx)
  const naMontagem = arredondaQtd(d.montagem)
  const baixa = Math.min(arredondaQtd(consumido), naMontagem)
  const novos = (volumes || [])
    .map((v) => arredondaQtd(v?.qtd ?? v))
    .filter((q) => q > 0)
  if (!novos.length || baixa <= 0) return null

  const bruto = doMapaDoItem(p?.etapas, p, idx)
  const jaTem = volumesDoItem(p, idx)
  const base = new Date().toISOString()
  return {
    montagem: arredondaQtd(naMontagem - baixa),
    produzido: arredondaQtd((Number(bruto?.produzido) || 0) + baixa),
    volumes: [
      ...jaTem.map((v) => ({ id: v.id, qtd: v.qtd, et: v.et })),
      ...novos.map((q, i) => ({ id: `${base}-${i}`, qtd: q, et: 'expedicao' })),
    ],
    por: quem || '',
    em: base,
  }
}

// DESFAZ a embalagem: o item volta da expedição para a montagem.
// Voltar não é "mover volume", é desembalar — os volumes deixam de existir e a
// quantidade PEDIDA que tinha sido baixada (`produzido`) retorna para a montagem.
// Devolver a soma dos volumes em vez do `produzido` perderia a quebra: fechou 100
// pedidas com 98,3 reais, e ao voltar a montagem receberia 98,3, sumindo com 1,7.
//
// Só desembala quando NADA saiu ainda. Com volume já expedido ou entregue não há
// resposta certa para "quanto volta", e inventar uma seria pior que recusar.
// Também devolve a ENTRADA. É chamada de dentro de `mapaEtapasMovendoVolumes`,
// que já carimba o mapa resultante.
export function desfazEmbalagem(p, idx, quem) {
  const vs = volumesDoItem(p, idx)
  if (!vs.length) return null
  if (vs.some((v) => v.et !== 'expedicao')) return null
  const bruto = doMapaDoItem(p?.etapas, p, idx)
  const produzido = Math.max(0, arredondaQtd(bruto?.produzido))
  return {
    montagem: arredondaQtd(Math.max(0, arredondaQtd(bruto?.montagem)) + produzido),
    produzido: 0,
    volumes: [],
    por: quem || '',
    em: new Date().toISOString(),
  }
}

// dá para desembalar? (nada saiu ainda)
export const podeDesembalar = (p, idx) => {
  const vs = volumesDoItem(p, idx)
  return vs.length > 0 && vs.every((v) => v.et === 'expedicao')
}

// move volumes (por id) para outra etapa — é assim que o item anda depois de
// embalado, inclusive quando só parte dos volumes vai nesta viagem
export function movePorVolume(p, idx, ids, para, quem) {
  if (!ETAPAS_VOLUME.includes(para)) return null
  const alvo = new Set(ids || [])
  const vs = volumesDoItem(p, idx)
  if (!vs.some((v) => alvo.has(v.id))) return null
  const bruto = doMapaDoItem(p?.etapas, p, idx)
  return {
    montagem: Math.max(0, arredondaQtd(bruto?.montagem)),
    produzido: Math.max(0, arredondaQtd(bruto?.produzido)),
    volumes: vs.map((v) => ({ id: v.id, qtd: v.qtd, et: alvo.has(v.id) ? para : v.et })),
    por: quem || '',
    em: new Date().toISOString(),
  }
}

// item terminado: tudo entregue (é o que permite tirar o pedido de `pedidos`)
export const itemTodoEntregue = (p, idx) => qtdPendente(p, idx) <= 0
export const pedidoTodoEntregue = (p) =>
  (p?.itens || []).length > 0 && (p.itens || []).every((_, i) => itemTodoEntregue(p, i))
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
  return carimbaTempos(p, mapaEtapasComCru(p, idxs, destino, quem))
}
function mapaEtapasComCru(p, idxs, destino, quem) {
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

// Índices dos itens liberados para a Rota/entrega: SÓ o que foi expedido.
//
// Havia aqui um atalho para o legado — "pedido que nunca passou pelo quadro
// conta como pronto" —, escrito na virada para produção por item, quando nenhum
// pedido tinha etapa gravada e a Rota apareceria vazia. Com o sistema em uso ele
// passou a fazer o contrário do que protegia: declarava pronto tudo que ninguém
// tinha movido, e a Rota mostrava ~458 pedidos que ainda estavam na linha
// (relatado em 12/08/2026 pelo pedido 5001, parado no silk e listado na Rota).
// Não recolocar: pedido só chega à Rota sendo expedido no quadro.
export function idxProntos(p) {
  return (p?.itens || []).map((_, i) => i).filter((i) => itemExpedido(p, i))
}
// devolve o pedido "fatiado" só com o que já pode ser entregue, guardando o
// original em _todos/_idxs (a entrega precisa saber o que sobra no pedido).
export function fatiaProntos(p) {
  const idxs = idxProntos(p)
  return {
    ...p,
    // _linha carimbada aqui: depois da fatia o índice muda, e a Rota/romaneio
    // precisam do selo da linha de cada item
    // qtd = só o que está expedido (produção parcial): o romaneio e a entrega
    // precisam do que REALMENTE sai, não do total do item
    itens: idxs.map((i) => ({
      ...p.itens[i],
      qtd: qtdNaEtapa(p, i, 'expedido'),
      _qtdItem: arredondaQtd(p.itens[i]?.qtd),
      _linha: linhaDoItem(p, i),
    })),
    _todos: p.itens || [],
    _idxs: idxs,
    // com produção parcial o item pode SAIR e CONTINUAR pendente ao mesmo tempo
    // (40 expedidos vão, 60 seguem na linha) — por isso não é "itens que ficaram"
    _pendentes: (p.itens || []).filter((_, i) =>
      arredondaQtd(qtdPendente(p, i) - qtdNaEtapa(p, i, 'expedido')) > 0).length,
  }
}

// valor dos itens escolhidos — só quando a planilha trouxe valor POR ITEM.
// Sem essa coluna, devolve null e a tela mostra o total do pedido.
export function valorDosItens(p, idxs) {
  const itens = (idxs || []).map((i) => p.itens?.[i]).filter(Boolean)
  if (!itens.length || itens.some((it) => !(Number(it.valor) > 0))) return null
  return itens.reduce((s, it) => s + Number(it.valor), 0)
}

// ---------- PREÇO E VALOR PELA QUANTIDADE REAL ----------
// A planilha do Posseidon repete o valor TOTAL do pedido em cada item, então não
// existe preço unitário vindo do import. Ele vem do cadastro de Itens, e é o que
// permite cobrar o que foi de fato produzido (98,3 kg em vez de 100).
export function precoDoItem(item, itensCad) {
  const nm = normaliza(item?.produto)
  if (!nm) return null
  const cad = (itensCad || []).find((c) => normaliza(c.produto) === nm)
  const v = Number(cad?.preco)
  return v > 0 ? v : null
}

// valor de uma quantidade. null quando o produto não tem preço cadastrado —
// sem preço não dá para cobrar pelo produzido, e estimar seria pior que não dizer.
export function valorDaQtd(item, qtd, itensCad) {
  const preco = precoDoItem(item, itensCad)
  if (preco == null) return null
  return Math.round(preco * (Number(qtd) || 0) * 100) / 100
}

// quantos produtos de uma lista ainda estão sem preço (para avisar no cadastro)
export const itensSemPreco = (itensCad) =>
  (itensCad || []).filter((c) => !(Number(c.preco) > 0)).length

// ---------- PESO (o que limita a carga do caminhão) ----------
// O volume de PLÁSTICO já é kg: ele foi para a balança no fechamento da montagem.
// O de papel/etiqueta/alça guarda QUANTIDADE — ninguém pesa sacola de papel uma a
// uma —, então o peso sai do cadastro de Itens (kg por unidade) e é ESTIMADO.
//
// A distinção não é preciosismo: o peso é o número que decide se o caminhão está
// cheio. Somar pesado com estimado sem dizer qual é qual faz o operador carregar
// confiando numa conta que ninguém verificou. Produto sem peso cadastrado NÃO
// entra na soma e é contado à parte — um total que ignora volumes em silêncio
// mente para baixo, e é justamente aí que o caminhão passa do limite.
// Peso médio por unidade quando o produto não tem o dele cadastrado.
// Médias informadas pelo dono (14/08/2026): 40 g por sacola de PAPEL, 45 g por
// ALÇA TORCIDA. Servem para o total da carga sair utilizável desde o primeiro
// dia, sem esperar alguém preencher produto por produto — o peso cadastrado no
// produto sempre ganha deste. ETIQUETA segue sem média: sem chute, ela continua
// contada à parte em vez de entrar no total com um número inventado.
export const PESO_PADRAO = { papel: 0.04, alca_torcida: 0.045 }

export function pesoDaQtd(produto, qtd, itensCad) {
  const n = arredondaQtd(qtd)
  const mat = materialDoItem({ produto }, itensCad)
  if (mat === 'plastico') return { kg: n, estimado: false }
  const nm = normaliza(produto)
  const cad = nm ? (itensCad || []).find((c) => normaliza(c.produto) === nm) : null
  const pu = Number(cad?.pesoUnit)
  if (pu > 0) return { kg: arredondaQtd(n * pu), estimado: true }
  const padrao = PESO_PADRAO[mat]
  // `padrao: true` distingue a média genérica do peso medido daquele produto —
  // as duas são estimativas, mas não valem a mesma coisa numa conferência
  if (padrao > 0) return { kg: arredondaQtd(n * padrao), estimado: true, padrao: true }
  return { kg: 0, estimado: false, semPeso: true }
}

// soma o peso de uma lista de volumes/itens ({produto, qtd})
export function pesoDaLista(itens, itensCad) {
  let kg = 0, estimado = false, semPeso = 0, padrao = 0
  for (const it of itens || []) {
    const r = pesoDaQtd(it.produto, it.qtd, itensCad)
    if (r.semPeso) { semPeso++; continue }
    kg = arredondaQtd(kg + r.kg)
    if (r.estimado) estimado = true
    if (r.padrao) padrao++
  }
  return { kg, estimado, semPeso, padrao }
}

export const fmtPeso = (r) =>
  `${r?.estimado ? '~' : ''}${fmtQtd(r?.kg || 0)} kg${r?.semPeso ? ` + ${r.semPeso} sem peso` : ''}`

// quantos produtos ainda estão sem peso próprio. O plástico não entra (já é
// pesado na montagem) e o papel também não (cai na média de 40 g) — sobra o que
// realmente fica de fora da conta: etiqueta e alça.
export const itensSemPeso = (itensCad) =>
  (itensCad || []).filter((c) => c.tipo !== 'plastico' && !PESO_PADRAO[c.tipo]
    && !(Number(c.pesoUnit) > 0)).length

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
// A rota VIVA do pedido, recalculada pelo cadastro de cidades ATUAL.
//
// `p.rota` é congelada no import (`detectaRota` roda uma vez e grava), então
// corrigir a cidade no cadastro depois não arrumava pedido nenhum: CEDRO DE SÃO
// JOÃO passou para a ROTA 03 e os pedidos já importados continuaram na rota
// velha — aparecendo no planejamento da viagem errada. É a mesma armadilha da
// data de entrega, resolvida com `previsaoDe()` calculando no render.
//
// ⚠️ Só SUBSTITUI quando o cadastro sabe responder. Cidade que não está em rota
// nenhuma devolve 'FORA DE ROTA', e trocar uma rota real por isso apagaria a
// informação que existe por causa de um buraco no cadastro.
export function rotaDe(p, cadastros) {
  const { rota } = detectaRota(p?.vendedorRaw || p?.vendedor, p?.cidade, cadastros)
  if (rota && rota !== 'FORA DE ROTA' && rota !== 'SEM ROTA') return rota
  return p?.rota || rota || 'SEM ROTA'
}

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

// ---------- ERROS REPORTADOS E CORREÇÃO À PROVA DE IMPORT ----------
// O vendedor lança errado no Posseidon e o papel que chega na fábrica tem a
// informação certa, escrita à mão. Quem produz precisa reportar a diferença.
//
// A correção NÃO pode morar em `itens`: todo import sobrescreve aquele array e o
// erro voltaria calado. Fica em `pedidos/{id}.correcoes`, que o import não conhece
// (ele grava com merge e sem esse campo), e é aplicada na LEITURA.
//
// "Já foi entregue" é o erro que o VENDEDOR reporta: ele sabe que a mercadoria
// chegou ao cliente (levou ele mesmo, o cliente retirou, saiu fora do romaneio)
// e o sistema continua mostrando o pedido na produção. Não é um valor que não
// bate — é um pedido inteiro que não deveria estar ali. Por isso ele não usa os
// campos "no sistema × no papel", e sim QUANDO e COM QUEM saiu: é com isso que o
// escritório acha a entrega e dá a baixa.
export const CAMPOS_ERRO = [
  { id: 'quantidade', nm: 'Quantidade', corrige: true },
  { id: 'produto', nm: 'Produto/medida', corrige: false },
  { id: 'cliente', nm: 'Cliente ou entrega', corrige: false },
  { id: 'entregue', nm: '📦 Já foi entregue', corrige: false, entrega: true },
  { id: 'outro', nm: 'Outro', corrige: false },
]
export const nomeCampoErro = (id) => CAMPOS_ERRO.find((c) => c.id === id)?.nm || id
export const ehErroEntrega = (id) => !!CAMPOS_ERRO.find((c) => c.id === id)?.entrega

// aplica as correções sobre os itens do pedido. Chamado UMA vez, quando o App
// carrega os pedidos — daí para baixo toda tela já vê o valor certo.
export function aplicaCorrecoes(p) {
  const cor = p?.correcoes
  if (!cor || !Object.keys(cor).length || !Array.isArray(p.itens)) return p
  let mudou = false
  const itens = p.itens.map((it, i) => {
    const c = cor[it.key || keyDoItem(p, i)]
    const q = Number(c?.qtd)
    if (!(q > 0) || q === Number(it.qtd)) return it
    mudou = true
    // guarda o original: as telas mostram "20 (era 12)" para ninguém achar que
    // a planilha mudou sozinha
    return { ...it, qtd: q, _qtdOriginal: arredondaQtd(it.qtd), _corrigidoPor: c.por || '' }
  })
  return mudou ? { ...p, itens } : p
}

export const temCorrecao = (p, idx) => !!p?.itens?.[idx]?._qtdOriginal

// documento de um erro reportado.
// ⚠️ `itemKey` vazio = o erro é do PEDIDO INTEIRO, e `problemaDoItem` o mostra em
// todos os itens de propósito — é o caso do "já foi entregue", que o vendedor
// reporta sem escolher produto.
export function docProblema({ p, idx, campo, noSistema, noPapel, obs, entregueEm, entreguePor, quem }) {
  const d = {
    idVenda: p?.idVenda || '',
    cliente: p?.cliente || '',
    vendedor: p?.vendedor || '',
    rota: p?.rota || '',
    itemKey: idx == null ? '' : keyDoItem(p, idx),
    produto: idx == null ? '' : (p?.itens?.[idx]?.produto || ''),
    campo: campo || 'outro',
    noSistema: String(noSistema || '').trim(),
    noPapel: String(noPapel || '').trim(),
    obs: String(obs || '').trim(),
    status: 'aberto',
    ...quem,
    quando: new Date().toISOString(),
  }
  // só o aviso de entrega carrega estes dois — campo vazio em todo doc é ruído
  // que depois ninguém sabe se significa "não sei" ou "não se aplica"
  return ehErroEntrega(d.campo)
    ? { ...d, entregueEm: String(entregueEm || '').trim(), entreguePor: String(entreguePor || '').trim() }
    : d
}

// problemas ABERTOS indexados por pedido — é o que acende o ⚠ nos cards
export function indexaProblemas(lista) {
  const map = {}
  for (const x of lista || []) {
    if (x?.status !== 'aberto') continue
    ;(map[x.idVenda] ??= []).push(x)
  }
  return map
}
export const problemasDoPedido = (map, idVenda) => (map || {})[idVenda] || []
export const problemaDoItem = (map, idVenda, itemKey) =>
  problemasDoPedido(map, idVenda).filter((x) => !x.itemKey || x.itemKey === itemKey)

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

// ---------- CONCILIAÇÃO COM A PLANILHA DE ENTREGAS ----------
// Ferramenta de MIGRAÇÃO: o sistema entrou no ar com pedidos que já tinham sido
// entregues na vida real, e eles ficaram parados na produção. A planilha manual
// de entrega (uma aba por mês) diz quais são.
// Cuidados que os dados exigiram (medidos no arquivo de 2026):
//  · a planilha NÃO é só de entregues — tem "SERÁ ENTREGUE" e "NÃO ENTREGOU"
//    misturados na mesma coluna. Só entra o que está marcado ENTREGUE.
//  · há DUAS numerações: a curta (a nossa) e uma de 44.000+, de outro sistema.
//    A longa é descartada — não casa com nada aqui.
//  · a coluna do número às vezes tem data ou texto (linha de separação).
//  · o mesmo número aparece com clientes diferentes, então o nome do cliente é
//    conferido antes de aplicar (senão marcamos o pedido errado como entregue).
export const LIMITE_SERIE_CURTA = 40000

export const normStatusPlanilha = (v) =>
  String(v ?? '').trim().toUpperCase().replace(/\.+$/, '').replace(/\s+/g, ' ')

// 'MARÇO 2026' | 'FEVEREIRO2026' | 'abril 2026' → último dia do mês, ISO
export function fimDoMesDaAba(nome) {
  const t = normaliza(nome)
  const mes = MESES_NORM.findIndex((m) => t.includes(m))
  const ano = Number((t.match(/(20\d{2})/) || [])[1])
  if (mes < 0 || !ano) return null
  return new Date(ano, mes + 1, 0, 12, 0, 0).toISOString()   // dia 0 do mês seguinte = último do mês
}

// linhas cruas (array de arrays) de UMA aba → entradas de entrega válidas
export function entradasDaPlanilha(linhas, aba) {
  const entregueEm = fimDoMesDaAba(aba)
  const out = []
  for (const l of linhas || []) {
    if (normStatusPlanilha(l?.[4]) !== 'ENTREGUE') continue
    const v = l[0]
    if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) continue  // data/texto/vazio
    if (v >= LIMITE_SERIE_CURTA) continue                                   // série de outro sistema
    out.push({
      idVenda: String(v),
      cliente: String(l[1] ?? '').trim(),
      motorista: String(l[5] ?? '').trim(),
      aba,
      entregueEm,
    })
  }
  return out
}

// Limpa o nome para comparar. Medido nos dados reais: a planilha escreve
// "JAMSOFT(EXPEDIÇÃO)", "SANTANA CAMA, MESA E BANHO", "SUZANE´S", e o sistema
// guarda a razão social com LTDA/ME no fim. Sem tirar isso, nada casa.
const limpaNome = (s) => normaliza(String(s ?? '')
  .replace(/\([^)]*\)/g, ' '))                    // "(EXPEDIÇÃO)", "(RETIROU NA FABRICA)"
  .replace(/[^A-Z0-9 ]/g, ' ')                     // vírgula, apóstrofo, barra, hífen
  .replace(/\b(LTDA|ME|EPP|EIRELI|SA|S A)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

// o nome da planilha bate com o do sistema? Tolerante ao que os dados exigiram,
// mas NÃO fuzzy: nome parecido por acaso continua indo para revisão humana —
// é o que impede marcar como entregue o pedido de outro cliente.
export function casaCliente(a, b) {
  const x = limpaNome(a)
  const y = limpaNome(b)
  if (x.length < 3 || y.length < 3) return false
  if (x.includes(y) || y.includes(x)) return true
  // "LUX BEACHWEAR" × "LUX BEACH WEAR", "SIMONE SEMI JOIAS" × "SIMONE SEMIJOIAS"
  const sx = x.replace(/ /g, '')
  const sy = y.replace(/ /g, '')
  return sx.includes(sy) || sy.includes(sx)
}

// Separa o que dá para aplicar do que precisa de olho humano.
// `pedidos` = os que estão HOJE na coleção pedidos (ainda em produção).
// Devolve os TRÊS conjuntos da comparação por número, porque cada um responde a
// uma pergunta diferente:
//   aplicar/revisar  → está nos dois lados (o que a conciliação resolve)
//   naoEncontrados   → só na planilha (nada a fazer: já saiu ou nunca entrou)
//   foraDaPlanilha   → só no banco  (o que vai SOBRAR na produção depois)
export function classificaConciliacao(entradas, pedidos, clientes) {
  const porId = new Map((pedidos || []).map((p) => [String(p.idVenda), p]))
  const vistos = new Set()
  const aplicar = []
  const revisar = []
  const naoEncontrados = []
  for (const e of entradas || []) {
    if (vistos.has(e.idVenda)) continue        // mesmo pedido repetido na planilha
    vistos.add(e.idVenda)
    const p = porId.get(e.idVenda)
    if (!p) { naoEncontrados.push(e); continue }
    const nomeSis = nomeCliente(p.cliente, clientes)
    if (casaCliente(e.cliente, nomeSis) || casaCliente(e.cliente, p.cliente)) aplicar.push({ ...e, p })
    else revisar.push({ ...e, p, clienteSistema: nomeSis })
  }
  const foraDaPlanilha = (pedidos || [])
    .filter((p) => !vistos.has(String(p.idVenda)))
    .sort((a, b) => (Number(a.idVenda) || 0) - (Number(b.idVenda) || 0))
  return { aplicar, revisar, naoEncontrados, foraDaPlanilha }
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
