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

// ---------- ÍNDICE dos cadastros (07/10/2026) ----------
// Os cadastros (vendedores, clientes, itens) são arrays vindos do Firestore, e
// as telas procuram neles por PEDIDO e por ITEM a cada render: `achaCliente`
// em todo filtro e romaneio, `achaItem` em cada `materialDoItem`. Percorrer
// o array normalizando cada elemento a cada chamada custava pedidos × cadastro
// por passagem — e o cadastro de clientes cresce em todo import.
//
// O índice é montado UMA vez por array e guardado pela IDENTIDADE dele
// (WeakMap): o React/Firestore entregam um array novo quando o cadastro muda,
// e aí o índice se refaz sozinho. A conferência de `length` é a rede de
// segurança contra mutação em lugar (push no mesmo array) — editar um elemento
// sem trocar o array continua invisível, então: cadastro muda = array novo.
// Semântica preservada: PRIMEIRA ocorrência vence, como o `find` fazia.
function indiceDe(cache, arr, monta) {
  let ix = cache.get(arr)
  if (!ix || ix.len !== arr.length) {
    ix = { len: arr.length, ...monta(arr) }
    cache.set(arr, ix)
  }
  return ix
}
const poe = (mapa, chave, valor) => { if (!mapa.has(chave)) mapa.set(chave, valor) }

// ---------- localizar um vendedor nos cadastros ----------
// cadastros = array de vendedores (do Firestore). Casa por código; se não,
// tenta por nome normalizado. Devolve o objeto do vendedor ou null.
const IDX_VENDEDORES = new WeakMap()
export function achaVendedor(raw, cadastros) {
  if (!cadastros || !cadastros.length) return null
  const { codigo, nomeRaw } = parseVendedor(raw)
  const ix = indiceDe(IDX_VENDEDORES, cadastros, (lista) => {
    const porCodigo = new Map(), porNome = new Map()
    for (const v of lista) {
      if (v?.codigo) poe(porCodigo, normaliza(v.codigo), v)
      poe(porNome, normaliza(v?.nome), v)
    }
    return { porCodigo, porNome }
  })
  if (codigo) {
    const porCod = ix.porCodigo.get(normaliza(codigo))
    if (porCod) return porCod
  }
  return ix.porNome.get(normaliza(nomeRaw)) || null
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
const IDX_CLIENTES = new WeakMap()
export function achaCliente(razaoSocial, clientes) {
  if (!clientes || !clientes.length) return null
  const alvo = normaliza(razaoSocial)
  if (!alvo) return null
  const ix = indiceDe(IDX_CLIENTES, clientes, (lista) => {
    const porRazao = new Map()
    for (const c of lista) poe(porRazao, normaliza(c?.razao), c)
    return { porRazao }
  })
  return ix.porRazao.get(alvo) || null
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
export function abasDoUsuario(perfil, setores, base, posto = false) {
  const abas = [...(base || [])]
  if (perfil !== 'operador') return abas
  // o TABLET do setor é só a fila: nada de Entregas, Erros ou Localizar, mesmo
  // que o setor dele abrisse essas abas para um operador de carne e osso
  if (posto) return ['producao']
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
  // e a busca de "onde está o pedido": é literalmente o trabalho dela — achar a
  // mercadoria no galpão. Sem isto o operador de expedição enxergaria a aba
  // Entregas e não teria como descobrir por que um pedido não está lá.
  if ((meus.includes('expedicao') || meus.includes('entrega')) && !abas.includes('localizar')) {
    abas.push('localizar')
  }
  // e o Controle de entrega (pronto → saiu pelo número do pedido): a expedição
  // marca pronto e saída; a entrega continua só do escritório (07/10/2026)
  if ((meus.includes('expedicao') || meus.includes('entrega')) && !abas.includes('controle')) {
    abas.push('controle')
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

// TODAS as cargas em montagem. Podem ser várias: a trava de "uma por vez" existia
// para a segunda não nascer escondida atrás da conferência da primeira — o que se
// resolve mostrando as duas, não proibindo a segunda. Duas viagens no mesmo dia é
// rotina, e travar a liberação parava o planejamento inteiro.
// ⚠️ Volume não entra em duas cargas mesmo assim: o comprometimento é contado
// sobre TODAS as cargas vivas (`CARGA_SEGURA_ITENS`), não sobre "a aberta".
export const cargasEmMontagem = (cargas) =>
  (cargas || []).filter((c) => c.status === STATUS_CARGA.MONTANDO)
    .sort((a, b) => (a.criadaEm || '').localeCompare(b.criadaEm || ''))

export const cargaAberta = (cargas) => cargasEmMontagem(cargas)[0] || null

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
// ---------- ROMANEIO SEPARADO POR ROTA ----------
// A previsão é do DIA, então quase toda viagem leva 2+ rotas. Numa lista corrida
// o motorista separa as rotas de cabeça — e é ele quem decide a sequência das
// cidades, mas não deveria ter que descobrir quais paradas são da mesma rota.
// Ordem das rotas = a posição no cadastro do vendedor (a sequência real em que
// ele roda), com o nome só desempatando: rota de mesmo nome de vendedores
// diferentes NÃO é a mesma rota (decisão do dono em 17/08/2026).
export function agrupaRomaneioPorRota(grupos, cadastros) {
  const por = new Map()
  for (const g of grupos || []) {
    const rota = g.p?.rota || 'SEM ROTA'
    const vendedor = g.p?.vendedor || ''
    const chave = `${vendedor}|${rota}`
    const bloco = por.get(chave) || { chave, rota, vendedor, paradas: [], volumes: 0, cidades: [] }
    bloco.paradas.push(g)
    bloco.volumes += (g.itens || []).length
    const cid = g.p?.cidade
    if (cid && !bloco.cidades.includes(cid)) bloco.cidades.push(cid)
    por.set(chave, bloco)
  }
  return [...por.values()].sort((a, b) =>
    (ordemRota(a.vendedor, a.rota, cadastros) - ordemRota(b.vendedor, b.rota, cadastros))
    || a.rota.localeCompare(b.rota))
}

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
    const velho = doMapaDoItem(p?.etapas, p, i)
    // ⚠️ O relógio vem da entrada ANTIGA. Os construtores de mapa remontam a
    // entrada de cada item (o movido por `moveQtdItem`/`movePorVolume`, os
    // outros "congelados" no formato novo) SEM `desde`/`tempos` — e lendo só a
    // entrada nova, cada movimento ZERAVA o relógio do item movido e dos
    // vizinhos: `desde` recomeçava no fallback e `tempos` acumulado sumia
    // (bug achado em 07/10/2026). Aqui é o lugar único do carimbo, então é
    // aqui que ele se preserva; a entrada nova só ganha quando traz o campo.
    const desde = { ...(velho?.desde || {}), ...(entrada.desde || {}) }
    const tempos = { ...(velho?.tempos || {}), ...(entrada.tempos || {}) }
    // De quando este item está parado, na falta de carimbo: a última
    // movimentação, senão a entrada do pedido no sistema. É o que salva a
    // PRIMEIRA passagem de cada item — no dia em que o relógio entra no ar
    // ninguém tem carimbo, e sem isto toda fila que já existia fecharia com
    // zero e as etapas cheias seriam remarcadas como recém-chegadas.
    const antigo = velho?.em || p?.importadoEm || p?.dataVenda || t
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
// A previsão NUNCA é apagada: excluir é mudar de status.
// ⚠️ É o que faz o NÚMERO parar de se repetir. `proximoNumeroPlano` é
// `maior + 1` sobre os documentos que existem — apagando a #15 (a mais alta), a
// previsão seguinte nascia #15 de novo, e o histórico passava a ter duas viagens
// diferentes com o mesmo número. Ninguém desconfia de um número que existe.
// 'encerrado' é o status ANTIGO e continua sendo lido (zero migração).
export const STATUS_PLANO = {
  ABERTO: 'aberto',
  CONCRETIZADA: 'concretizada',   // virou viagem: soltou tudo que tinha
  ENCERRADA: 'encerrada',         // fechada na mão, com ou sem sobra
  EXCLUIDA: 'excluida',
  // ⚠️ o valor ANTIGO fica aqui de propósito. Tirar a chave não daria erro em
  // lugar nenhum: `STATUS_PLANO.ENCERRADO` passaria a valer `undefined`, e
  // previsão com status indefinido é lida como ABERTA — ela voltaria a prender
  // os pedidos, calada. Quem normaliza na leitura é `statusDoPlano`.
  ENCERRADO: 'encerrado',
}

export const proximoNumeroPlano = (planos) =>
  (planos || []).reduce((m, p) => Math.max(m, Number(p.numero) || 0), 0) + 1

export const statusDoPlano = (pl) => {
  const s = pl?.status || STATUS_PLANO.ABERTO
  return s === 'encerrado' ? STATUS_PLANO.ENCERRADA : s      // legado
}
export const planoEstaAberto = (pl) => statusDoPlano(pl) === STATUS_PLANO.ABERTO

export const planosAbertos = (planos) => (planos || []).filter(planoEstaAberto)

// o que já saiu de cena — é o histórico das previsões
export const planosFechados = (planos) => (planos || []).filter((p) => !planoEstaAberto(p))

export const NOME_STATUS_PLANO = {
  [STATUS_PLANO.ABERTO]: 'aberta',
  [STATUS_PLANO.CONCRETIZADA]: '🚚 virou viagem',
  [STATUS_PLANO.ENCERRADA]: '✓ encerrada',
  [STATUS_PLANO.EXCLUIDA]: '🗑 excluída',
}
export const nomeStatusPlano = (pl) => NOME_STATUS_PLANO[statusDoPlano(pl)] || statusDoPlano(pl)

// quem fechou a previsão e quando — o histórico existe para responder isso
export function fechamentoDoPlano(pl) {
  const s = statusDoPlano(pl)
  if (s === STATUS_PLANO.EXCLUIDA) return { por: pl.excluidaPor || '', em: pl.excluidaEm || '' }
  if (s === STATUS_PLANO.CONCRETIZADA) return { por: pl.concretizadaPor || pl.liberadoPor || '', em: pl.concretizadaEm || pl.liberadoEm || '' }
  // 'encerradoEm/Por' é o nome antigo do campo, de quando só existia encerrar
  return { por: pl.encerradaPor || pl.encerradoPor || '', em: pl.encerradaEm || pl.encerradoEm || '' }
}

// ---------- O NÚMERO QUE O MOTORISTA LÊ ----------
// A viagem herda o número da PREVISÃO que a gerou: um número só acompanha do
// planejamento até o caminhão. Uma previsão que libera duas vezes (parte ficou
// pronta depois) vira #15-1 e #15-2 — some o `-1` quando foi viagem única.
// Carga antiga, nascida antes da previsão existir, mantém o número próprio: o
// papel já impresso não se renumera.
export function rotuloCarga(c) {
  if (!c) return ''
  if (!c.planoNumero) return `#${c.numero ?? '?'}`
  return c.viagem > 1 ? `#${c.planoNumero}-${c.viagem}` : `#${c.planoNumero}`
}

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
export function diaISO(v) {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  if (isNaN(d)) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function diaDaPrevisao(p) {
  return p?.previsao ? diaISO(p.previsao) : null
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
// ---------- SEGURAR ITEM PRONTO (entrega parcial deliberada) ----------
// A carga já saía parcial SOZINHA: `itensParaCarga` só devolve o que está em
// `expedido`, então pedido com 1 de 3 itens prontos ia com 1. O que faltava era
// o volante — dizer "essa sacola vai, a etiqueta espera" — e a tela avisar que
// o pedido está saindo pela metade.
//
// A escolha mora em `planos/{id}.itensFora: ["5001|SACOLA PAPEL P02#1"]`.
// Campo ausente = nada segurado, então toda previsão que já existe continua
// funcionando igual. A chave usa `keyDoItem`, que sobrevive ao reimport — a
// POSIÇÃO no array não sobreviveria, e segurar a sacola grande viraria segurar a
// etiqueta no dia seguinte.
export const chaveItemPlano = (idVenda, itemKey) => `${idVenda}|${itemKey}`
export const itensSeguradosDoPlano = (pl) => new Set((pl?.itensFora || []).map(String))
export const itemSegurado = (segurados, idVenda, itemKey) =>
  !!segurados?.has(chaveItemPlano(idVenda, itemKey))

// o que REALMENTE sobe no caminhão: o que está pronto menos o que foi segurado
export const volumesQueVao = (livres, idVenda, segurados) =>
  (livres || []).filter((v) => !itemSegurado(segurados, idVenda, v.itemKey))

export function situacaoNoPlano(p, livres, itensCad, segurados) {
  const vols = livres || []
  const vao = volumesQueVao(vols, p?.idVenda, segurados)
  const pendencias = pendenciasDoPedido(p)
  return {
    volumes: vao.length,
    peso: pesoDaLista(vao, itensCad),
    pendencias,
    pronto: vao.length > 0,
    // ◑ PARCIAL = tem coisa saindo E tem coisa ficando. Dizer só "✅ pronto"
    // porque existe 1 volume esconde que 2 itens continuam na linha — e quem
    // libera descobre pelo cliente.
    parcial: vao.length > 0 && (pendencias.length > 0 || vao.length < vols.length),
    segurados: vols.length - vao.length,
    itensProntos: new Set(vols.map((v) => v.itemKey)).size,
    itensTotal: (p?.itens || []).length,
  }
}

// O pedido só SAI da previsão quando não sobra nada dele: nem item segurado, nem
// saldo na produção. Antes ele saía inteiro assim que mandava qualquer coisa,
// levando junto os itens que continuavam na linha — e a pessoa tinha que
// reincluir o pedido na viagem a cada entrega parcial.
export const sobrouNoPedido = (p, livres, segurados) =>
  temTrabalhoNaProducao(p)
  || (livres || []).length > volumesQueVao(livres, p?.idVenda, segurados).length

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
    // ⚠️ Item já embalado: preservar a entrada como está evita que um avanço por
    // quantidade apague os volumes — seria perda silenciosa do que a balança
    // pesou. Mas só quando NÃO há movimento para ele: com movimento, quem
    // devolveu a entrada foi `moveQtdItem`, e ela já vem com os volumes dentro.
    // Preservar mesmo assim era um NO-OP SILENCIOSO — o operador clicava,
    // ninguém reclamava e o item não saía do lugar (o resto do lote do #5458
    // ficou preso na gráfica assim).
    if (!movido && Array.isArray(ant?.volumes) && ant.volumes.length) { mapa[k] = ant; return }
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

  // ITEM JÁ EMBALADO com saldo ainda na linha. Depois da montagem quem anda
  // pelas etapas de VOLUME é o volume — mas o que ainda NÃO foi embalado
  // continua sendo quantidade solta, e com produção parcial isso é rotina: 227
  // fecharam em volume e saíram, 273 seguem na gráfica. Esse resto precisa
  // poder avançar para a montagem, e a entrada tem que voltar COM os volumes:
  // devolver só `{montagem, expedicao, …}` apagaria o que a balança pesou.
  if (temVolumes(p, idx)) {
    // etapa de volume não se move por quantidade — ali quem manda é o volume
    if (ETAPAS_VOLUME.includes(de) || ETAPAS_VOLUME.includes(para)) return null
    const bruto = doMapaDoItem(p?.etapas, p, idx)
    const naMontagem = Math.max(0, arredondaQtd(d.montagem))
    return {
      montagem: Math.max(0, arredondaQtd(naMontagem
        + (para === 'montagem' ? mover : 0) - (de === 'montagem' ? mover : 0))),
      produzido: Math.max(0, arredondaQtd(bruto?.produzido)),
      volumes: volumesDoItem(p, idx).map((v) => ({ id: v.id, qtd: v.qtd, et: v.et })),
      ...(bruto?.desde ? { desde: bruto.desde } : {}),
      ...(bruto?.tempos ? { tempos: bruto.tempos } : {}),
    }
  }

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
const IDX_ITENS = new WeakMap()
export function achaItem(produto, itens) {
  if (!itens || !itens.length) return null
  const alvo = normaliza(produto)
  if (!alvo) return null
  const ix = indiceDe(IDX_ITENS, itens, (lista) => {
    const porProduto = new Map()
    for (const it of lista) poe(porProduto, normaliza(it?.produto), it)
    return { porProduto }
  })
  return ix.porProduto.get(alvo) || null
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

// ---------- LER UM DOC DO FIRESTORE ----------
// ⚠️ O id do DOCUMENTO tem que ganhar do campo `id` que porventura esteja gravado
// DENTRO dele. O `{ id: d.id, ...d.data() }` (a ordem intuitiva) faz o contrário,
// e foi um bug caro: a remessa em `entregues` nasce de um `...pedido` que já
// carrega o `id` do doc de `pedidos`, então `p.id` virava "5001" num documento
// chamado "5001-1". Cancelar a entrega apagava `entregues/5001` — que não existe,
// e o Firestore não reclama de apagar o que não há: a quantidade voltava para o
// pedido e o card ficava na tela. Duas remessas do mesmo pedido também ficavam
// com a mesma `key` no React, que então desenha card trocado.
export const doDoc = (d) => ({ ...d.data(), id: d.id })

// ---------- BUSCA POR NOME PARECIDO ----------
// O filtro de cliente casava por SUBSTRING exata: quem digitava "LUX BEACHWEAR"
// não achava "LUX BEACH WEAR", "MODAS ATUAL" não achava "ATUAL MODAS" e uma
// letra trocada ("JESICA CLOSET") não achava nada. Na prática só abria com o
// nome escrito igual — e quem procura não sabe como a razão social foi
// cadastrada no Posseidon.
//
// ⚠️ Aqui PODE ser tolerante porque quem decide é a PESSOA: a busca só desenha
// candidatos na tela. É o oposto de `casaCliente` (Conciliação), que não é fuzzy
// de propósito — lá o casamento marca pedido como entregue sozinho, e nome
// parecido por acaso daria baixa no pedido de outro cliente.
const paraBusca = (t) => normaliza(t).replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

// Levenshtein com corte: não interessa a distância, só se cabe em `max` erros.
// Sai fora assim que a linha inteira passa do limite — sem isso, uma busca solta
// roda a matriz completa contra cada palavra de cada pedido, a cada tecla.
export function cabeEmErros(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false
  let ant = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const linha = [i]
    let melhor = i
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1
      linha[j] = Math.min(ant[j] + 1, linha[j - 1] + 1, ant[j - 1] + custo)
      if (linha[j] < melhor) melhor = linha[j]
    }
    if (melhor > max) return false
    ant = linha
  }
  return ant[b.length] <= max
}

// O texto casa com o que foi digitado? Cada PALAVRA digitada precisa aparecer —
// em qualquer ordem, colada ou separada, com até um erro de digitação. É E, não
// OU: digitar mais palavras tem que estreitar a busca, senão a lista cresce
// conforme a pessoa tenta ser mais específica.
export function casaBusca(termo, ...textos) {
  const q = paraBusca(termo)
  if (!q) return true
  const junto = textos.map(paraBusca).filter(Boolean).join(' ')
  if (!junto) return false
  const colado = junto.replace(/ /g, '')
  const palavras = junto.split(' ')
  return q.split(' ').every((tk) => {
    if (junto.includes(tk)) return true            // pedaço do nome, como antes
    if (colado.includes(tk)) return true           // "BEACHWEAR" acha "BEACH WEAR"
    // erro de digitação. Só a partir de 4 letras: abaixo disso a tolerância
    // acha qualquer coisa ("ANA" casaria com "ANO", "UVA", "AVA").
    if (tk.length < 4) return false
    return palavras.some((w) => cabeEmErros(w, tk, tk.length >= 8 ? 2 : 1))
  })
}

// ---------- filtro compartilhado (Rota e Produção) ----------
// f = { cliente, pedido, vendedor, dataIni, dataFim }
// datas filtram pela PREVISÃO de entrega. Pedido sem previsão não entra
// quando há filtro de data ativo. clientes = de/para (casa pelos dois nomes).
export function filtraPedidos(lista, f, clientes) {
  if (!f) return lista
  const cli = String(f.cliente || '').trim()
  const ped = normaliza(f.pedido || '')
  const vend = f.vendedor || ''
  const rota = f.rota || ''
  const ini = f.dataIni ? new Date(f.dataIni + 'T00:00:00') : null
  const fim = f.dataFim ? new Date(f.dataFim + 'T23:59:59') : null
  return lista.filter((p) => {
    // casa pela razão social E pelo apelido: a pessoa procura pelo nome que ela
    // conhece, que muitas vezes não é o que veio na planilha
    if (cli && !casaBusca(cli, p.cliente, nomeCliente(p.cliente, clientes))) return false
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

// ---------- LOCALIZAR — "onde está este pedido?" ----------
// A pergunta chega da expedição e do balcão ("o cliente ligou perguntando do
// 5257"), e até aqui NENHUMA tela respondia inteira: o quadro só mostra o que
// está na fábrica, a Rota só o que está pronto, Entregas só o que já entrou numa
// viagem, e o pedido totalmente entregue SOME de `pedidos` — existe apenas como
// remessa em `entregues`. Quem procurava abria quatro abas e, no fim, o ⌘F.
//
// Aqui o pedido é procurado nas quatro camadas de uma vez e a resposta é FÍSICA:
// em que posto da fábrica está cada item, quantos volumes estão no galpão, se
// está preso numa viagem e se já saiu do portão.

// A ordem em que a pessoa lê o fluxo. ⚠️ NÃO dá para reusar `posNoFluxo` aqui:
// ele devolve 0 para as três linhas E para 'triagem' E para 'entregue' (responde
// outra pergunta), então o que já foi entregue apareceria antes da montagem.
const ORDEM_LOCAL = ['triagem', ...MODO_ORDER, 'montagem', 'expedicao', 'expedido', 'entregue']
export const ordemEtapaLocal = (et) => {
  const i = ORDEM_LOCAL.indexOf(et)
  return i < 0 ? ORDEM_LOCAL.length : i
}

// Nome do lugar onde a pessoa vai PROCURAR — não o nome técnico da etapa.
// 'expedido' não é "expedido": para quem carrega, é a prateleira do galpão.
export const nomeEtapaLocal = (et) => (
  et === 'triagem' ? 'Triagem (sem linha definida)'
  : MODO_ORDER.includes(et) ? MODO_NM[et]
  : et === 'montagem' ? 'Montagem'
  : et === 'expedicao' ? 'Expedição'
  : et === 'expedido' ? 'Pronto no galpão'
  : et === 'entregue' ? 'Entregue'
  : et || '—')

// A montagem é UM campo no banco e TRÊS postos no chão de fábrica: quem monta
// papel não é quem monta plástico. Para localizar, o posto é o que importa.
export function ondeProcurar(etapa, material) {
  if (etapa !== 'montagem') return nomeEtapaLocal(etapa)
  const m = MONTAGENS.find((x) => x.id === montagemDoMaterial(material))
  return m ? m.nome : 'Montagem (material não cadastrado)'
}

// Onde este item está — PLURAL de propósito. Com produção parcial o mesmo item
// fica em duas etapas ao mesmo tempo (50 na montagem, 50 no silk), e devolver
// uma etapa só ("a mais atrasada", que é o que `etapaDoItem` faz) mandaria a
// expedição procurar no posto errado a metade que já está pronta.
export function paradasDoItem(p, idx, agora) {
  const d = distribuicaoDoItem(p, idx)
  const linha = linhaDoItem(p, idx) || 'triagem'
  const t = agora ? Date.parse(agora) : Date.now()
  const out = []
  for (const et of [linha, 'montagem', 'expedicao', 'expedido', 'entregue']) {
    const qtd = arredondaQtd(d[et])
    if (!(qtd > 0)) continue
    const ent = entradaNaEtapa(p, idx, et)
    const ini = Date.parse(ent.iso)
    out.push({
      etapa: et,
      qtd,
      volumes: ETAPAS_VOLUME.includes(et)
        ? volumesDoItem(p, idx).filter((v) => v.et === et) : [],
      desde: ent.iso,
      // ⚠️ `exato: false` = carimbo aproximado (item parado antes de o relógio
      // existir). Hora cravada que não é cravada vira discussão no chão de
      // fábrica — a tela marca com `~`.
      exato: ent.exato,
      parado: Number.isFinite(ini) ? Math.max(0, t - ini) : null,
    })
  }
  return out
}

// O pedido inteiro, item a item, já com material e paradas.
export function localizacaoDoPedido(p, itensCad, agora) {
  return (p?.itens || []).map((it, i) => ({
    idx: i,
    key: keyDoItem(p, i),
    produto: it.produto || '',
    linha: linhaDoItem(p, i),
    cores: coresDoItem(p, i),
    material: materialDoItem(it, itensCad),
    qtdItem: arredondaQtd(it.qtd),
    paradas: paradasDoItem(p, i, agora),
  }))
}

// Resumo por POSTO — é a linha que responde a pergunta de uma vez ("2 itens na
// Montagem Papel, 1 pronto no galpão"). A montagem quebra por material porque
// são postos diferentes; o resto é a etapa mesmo.
export function resumoLocalizacao(itensLoc) {
  const map = new Map()
  for (const it of itensLoc || []) {
    for (const pa of it.paradas) {
      const chave = pa.etapa === 'montagem'
        ? `montagem|${montagemDoMaterial(it.material)}` : pa.etapa
      const g = map.get(chave) || {
        chave, etapa: pa.etapa, material: it.material,
        onde: ondeProcurar(pa.etapa, it.material),
        itens: 0, volumes: 0, produtos: [],
      }
      g.itens++
      g.volumes += pa.volumes.length
      g.produtos.push({ produto: it.produto, qtd: pa.qtd, linha: it.linha })
      map.set(chave, g)
    }
  }
  return [...map.values()].sort((a, b) => ordemEtapaLocal(a.etapa) - ordemEtapaLocal(b.etapa)
    || String(a.onde).localeCompare(String(b.onde)))
}

// ---------- o que uma CARGA ainda prende ----------
// Pedido que voltou no caminhão sem ser entregue. A carga NÃO é reescrita: o que
// saiu, saiu — apagar o item da viagem esconderia que ela chegou a levá-lo.
// Fica registrado o retorno, e é ele que solta o volume para a viagem seguinte.
export const pedidosRetornados = (c) =>
  new Set((c?.retornados || []).map((r) => String(r?.idVenda ?? r)))

// Quanto de cada volume/quantidade já está comprometido com alguma carga VIVA.
// Fonte única: a tela de Entregas e a busca precisam concordar sobre o que está
// livre, senão a busca manda carregar o que a outra tela já deu por carregado.
export function comprometimentoDeCargas(cargas) {
  const volumes = new Set()
  const qtd = new Map()
  for (const c of cargas || []) {
    if (!CARGA_SEGURA_ITENS(c.status)) continue
    const voltou = pedidosRetornados(c)
    for (const it of c.itens || []) {
      if (voltou.has(String(it.idVenda))) continue    // voltou: não prende mais
      const k = chaveCarga(it)
      if (it.volumeId) { volumes.add(k); continue }
      qtd.set(k, arredondaQtd((qtd.get(k) || 0) + (Number(it.qtd) || 0)))
    }
  }
  return { volumes, qtd }
}

// O que deste pedido ainda pode entrar numa carga (volume já comprometido sai).
// Legado sem volume conta por QUANTIDADE: expediram 40 e foram numa carga,
// depois expediram os outros 60 — esses 60 podem ir na viagem seguinte.
export function volumesLivresDoPedido(p, comp) {
  const { volumes, qtd } = comp || { volumes: new Set(), qtd: new Map() }
  return itensParaCarga(p)
    .filter((it) => !it.volumeId || !volumes.has(chaveCarga(it)))
    .map((it) => ({
      ...it,
      qtd: it.volumeId ? it.qtd : arredondaQtd(it.qtd - (qtd.get(chaveCarga(it)) || 0)),
    }))
    .filter((it) => it.qtd > 0)
}

// cargas que contêm este pedido. `vivas` = só as que ainda prendem item
export function cargasDoPedido(cargas, idVenda, vivas) {
  const id = String(idVenda)
  return (cargas || [])
    .filter((c) => (c.pedidos || []).some((x) => String(x) === id))
    .filter((c) => !vivas || (CARGA_SEGURA_ITENS(c.status) && !pedidosRetornados(c).has(id)))
    .sort((a, b) => String(b.criadaEm || '').localeCompare(String(a.criadaEm || '')))
}

// previsões que contêm este pedido (por padrão, só as ABERTAS — são as únicas
// que o reservam; encerrada e excluída soltam o pedido sozinhas)
export function planosDoPedido(planos, idVenda, todos) {
  const id = String(idVenda)
  return (planos || [])
    .filter((pl) => todos || planoEstaAberto(pl))
    .filter((pl) => (pl.pedidos || []).some((x) => String(x) === id))
}

// A situação LOGÍSTICA do pedido: por que ele aparece (ou não) na aba Entregas.
// É a resposta que faltava — "está pronto e livre", "está na previsão #15",
// "está preso na carga #12, que saiu dia 20 e nunca foi concluída".
export function situacaoEntrega(p, { cargas, planos, remessas, comp } = {}) {
  const id = String(p?.idVenda ?? '')
  const c = comp || comprometimentoDeCargas(cargas)
  const livres = p ? volumesLivresDoPedido(p, c) : []
  const cargasVivas = cargasDoPedido(cargas, id, true)
  const abertos = planosDoPedido(planos, id)
  const emProducao = (p?.itens || []).some((_, i) => qtdEmProducao(p, i) > 0)
  return {
    livres,
    volumesLivres: livres.length,
    cargasVivas,
    planosAbertos: abertos,
    cargasAntigas: cargasDoPedido(cargas, id, false).filter((x) => !cargasVivas.includes(x)),
    saiu: saiuParaEntrega(p),
    remessas: remessas || [],
    emProducao,
    // aparece na LISTA de Entregas (fora de previsão) exatamente quando tem
    // volume livre e nenhuma previsão aberta o reservou — a mesma conta da tela
    naListaDeEntregas: livres.length > 0 && abertos.length === 0,
  }
}

// ---------- a busca em si ----------
// Junta as duas coleções por número: `pedidos` (o que está vivo) e `entregues`
// (as remessas). Pedido totalmente entregue não existe mais em `pedidos`, e sem
// isto a busca responderia "não achei" para o pedido que acabou de sair.
export function indexaEntreguesPorPedido(entregues) {
  const m = new Map()
  for (const e of entregues || []) {
    const k = String(e?.idVenda ?? e?.id ?? '')
    if (!k) continue
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(e)
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => (Number(a.remessa) || 1) - (Number(b.remessa) || 1))
  }
  return m
}

// Busca global. Número casa por PEDAÇO EXATO (dígito não tem "parecido": 5111
// nunca pode trazer 5118); texto usa `casaBusca`, que tolera ordem trocada e
// erro de digitação — quem procura não sabe como a razão social foi cadastrada.
// O corte é VISÍVEL (`cortado`): lista truncada em silêncio passa a impressão de
// que aquilo é tudo que existe.
export function buscaGlobal(termo, { pedidos, entregues, clientes, limite = 30 } = {}) {
  const q = String(termo || '').trim()
  if (q.length < 2) return { termo: q, curto: q.length > 0, total: 0, itens: [], cortado: 0 }
  const soNumero = /^\d+$/.test(q)
  const porEntrega = indexaEntreguesPorPedido(entregues)
  const mapa = new Map()
  for (const p of pedidos || []) {
    mapa.set(String(p.idVenda), { idVenda: String(p.idVenda), p, remessas: [] })
  }
  for (const [id, rem] of porEntrega) {
    const r = mapa.get(id) || { idVenda: id, p: null, remessas: [] }
    r.remessas = rem
    mapa.set(id, r)
  }
  const casa = (r) => {
    if (soNumero) return normaliza(r.idVenda).includes(normaliza(q))
    const ref = r.p || r.remessas[r.remessas.length - 1] || {}
    const produtos = [
      ...(ref.itens || []).map((i) => i.produto),
      ...r.remessas.flatMap((x) => (x.itens || []).map((i) => i.produto)),
    ]
    return casaBusca(q, ref.cliente, nomeCliente(ref.cliente, clientes),
      ref.cidade, ref.vendedor, ref.rota, ...produtos)
  }
  const achados = [...mapa.values()].filter(casa).sort((a, b) => {
    // o número digitado inteiro vem primeiro: é quase sempre o que se procura
    const ea = a.idVenda === q ? 0 : 1
    const eb = b.idVenda === q ? 0 : 1
    if (ea !== eb) return ea - eb
    // depois o que ainda está na fábrica — é sobre ele que dá para agir
    if (!!a.p !== !!b.p) return a.p ? -1 : 1
    return String(b.idVenda).localeCompare(String(a.idVenda), undefined, { numeric: true })
  })
  return {
    termo: q, curto: false, total: achados.length,
    itens: achados.slice(0, limite),
    cortado: Math.max(0, achados.length - limite),
  }
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

// ============================================================
// FINANCEIRO — CONTAS A RECEBER (Fase 1)
// Desenho completo e o porquê de cada decisão: FINANCEIRO.md
//
// Duas peças, e a separação é o ponto:
//   `cobrancas`  = quem me deve (nasce da entrega ou é lançada à mão)
//   `movimentos` = o que entrou/saiu (o livro-caixa, base do OFX depois)
// A cobrança NÃO guarda "quanto já recebi": isso é somado no render a partir
// dos movimentos. Total desnormalizado diverge em silêncio — mesma regra de
// `qtdNoPainel` no quadro.
// ============================================================

// A empresa é EIXO, não filtro: todo lançamento nasce com ela. Enxertar depois
// obrigaria a adivinhar de quem é cada registro já gravado.
export const EMPRESAS = [
  { id: 'sacolas', nome: 'JC Sacolas', curto: 'Sacolas' },
  { id: 'plastico', nome: 'JC Plástico', curto: 'Plástico' },
]
export const EMPRESA_PADRAO = 'sacolas'
export const nomeEmpresa = (id) => EMPRESAS.find((e) => e.id === id)?.nome || ''

export const FORMAS_PGTO = [
  { id: 'pix', nome: 'PIX' },
  { id: 'dinheiro', nome: 'Dinheiro' },
  { id: 'boleto', nome: 'Boleto' },
  { id: 'cheque', nome: 'Cheque' },
  { id: 'cartao', nome: 'Cartão' },
  { id: 'transferencia', nome: 'Transferência' },
]
export const nomeForma = (id) => FORMAS_PGTO.find((f) => f.id === id)?.nome || ''

// As contas de cada empresa, como o dono descreveu. É aqui que o extrato vai
// desembocar na Fase 5 — por isso a conta é obrigatória na baixa: sem ela o
// recebimento não tem onde ser conciliado.
export const CONTAS = [
  { id: 'bradesco', nome: 'Bradesco', empresas: ['sacolas', 'plastico'] },
  { id: 'banese', nome: 'Banese', empresas: ['plastico'] },
  { id: 'nordeste', nome: 'Banco do Nordeste', empresas: ['plastico'] },
  { id: 'cielo', nome: 'Cielo', empresas: ['sacolas'] },
  { id: 'caixa', nome: 'Caixa interno', empresas: ['sacolas', 'plastico'] },
]
export const contasDaEmpresa = (emp) =>
  CONTAS.filter((c) => !emp || c.empresas.includes(emp))
export const nomeConta = (id) => CONTAS.find((c) => c.id === id)?.nome || ''

// quem enxerga a aba Financeiro. O DESIGNER fica de fora de propósito: ele é
// staff para todo o resto (`ehStaff` nas rules o inclui), mas dinheiro não.
export const veFinanceiro = (perfil) => perfil === 'dono' || perfil === 'financeiro'

export const arredondaMoeda = (n) => Math.round((Number(n) || 0) * 100) / 100

// ---------- DATAS DE VENCIMENTO ----------
// ⚠️ 'YYYY-MM-DD' passado ao `new Date()` é lido como UTC: em UTC-3 vira o dia
// ANTERIOR. Vencimento errado por um dia gera cobrança de atraso que não existe,
// então aqui a data é montada pelas PARTES.
export function dataDeISO(iso) {
  const [a, m, d] = String(iso || '').slice(0, 10).split('-').map(Number)
  if (!a || !m || !d) return null
  return new Date(a, m - 1, d)
}
export function somaDias(iso, dias) {
  const d = dataDeISO(iso)
  if (!d) return ''
  d.setDate(d.getDate() + (Number(dias) || 0))
  return diaISO(d)
}
export const hojeISO = () => diaISO(new Date())

// Uma data 'YYYY-MM-DD' na tela. O meio-dia é o truque que impede o fuso de
// mostrar o dia anterior — e fica num lugar só para não ser reinventado em cada
// tela (foi assim que ele apareceu em cinco lugares na primeira escrita).
export const fmtDia = (iso) => (iso ? fmtData(`${String(iso).slice(0, 10)}T12:00`) : '—')

// ---------- O VALOR ----------
// Σ preço de tabela × quantidade. `null` quando FALTA preço em qualquer item:
// sem a tabela inteira não dá para achar o desconto, e ratear com meia tabela
// inventaria valor. A tela pede o número em vez de estimar.
export function valorDeTabela(itens, itensCad) {
  if (!itens?.length) return null
  let soma = 0
  for (const it of itens) {
    const preco = precoDoItem(it, itensCad)
    if (preco == null) return null
    soma += preco * (Number(it.qtd) || 0)
  }
  return arredondaMoeda(soma)
}

// o desconto do pedido em FATOR (0,92 = 8% de desconto). É o mesmo número que
// decide a faixa de comissão na Fase 3.
// ⚠️ O Posseidon dá o desconto ABAIXANDO o preço unitário, não na coluna de
// desconto (medido no relatório de julho: o mesmo produto a 32,00 e a 30,00 com
// "Desconto Efetivo" zerado nos dois). Por isso o desconto é DERIVADO daqui.
export function fatorDesconto(valorVendido, valorTabela) {
  const v = Number(valorVendido) || 0
  if (!v || !valorTabela) return null
  return v / valorTabela
}

// A lista COMPLETA de itens do pedido, com a quantidade total de cada um.
// ⚠️ Pedido totalmente entregue SOME de `pedidos` — existe só como remessa. Sem
// juntar as duas pontas o valor de tabela sairia menor e o rateio inflaria a
// cobrança. O pedido vivo manda quando existe (é o dado atual e já traz todos os
// itens, porque a entrega parcial não mexe em `itens`).
// índice por número de pedido. Existe por causa da escala: a fila "a cobrar"
// resolve os itens de CADA entrega, e varrer `pedidos` + `entregues` inteiros a
// cada uma é O(n²) — com o histórico de entregas real isso trava a tela.
export function indexaPorVenda(pedidos, entregues) {
  const vivos = new Map()
  const remessas = new Map()
  for (const p of (pedidos || [])) vivos.set(String(p.idVenda), p)
  for (const e of (entregues || [])) {
    const k = String(e.idVenda)
    if (!remessas.has(k)) remessas.set(k, [])
    remessas.get(k).push(e)
  }
  return { vivos, remessas }
}

export function itensDoPedidoInteiro(idVenda, pedidos, entregues, idx) {
  const alvo = String(idVenda)
  const { vivos, remessas } = idx || indexaPorVenda(pedidos, entregues)
  const vivo = vivos.get(alvo)
  if (vivo?.itens?.length) {
    return vivo.itens.map((it, i) => ({
      key: it.key || keyDoItem(vivo, i), produto: it.produto, qtd: arredondaQtd(it.qtd),
    }))
  }
  const porKey = new Map()
  for (const r of (remessas.get(alvo) || [])) {
    (r.itens || []).forEach((it, i) => {
      const k = it.key || keyDoItem(r, i)
      // `qtdItem` é o total do item no pedido; `qtd` é só o que saiu nesta
      // remessa. Somar contaria o item duas vezes quando ele sai em partes.
      const q = arredondaQtd(it.qtdItem ?? it.qtd)
      const ant = porKey.get(k)
      if (!ant || q > ant.qtd) porKey.set(k, { key: k, produto: it.produto, qtd: q })
    })
  }
  return [...porKey.values()]
}

// Quanto vale ESTA entrega.
// Saiu tudo de uma vez? é o total do pedido, exato, sem conta nenhuma — que é a
// esmagadora maioria dos casos. Saiu em partes? rateia pelo valor de tabela
// aplicando o MESMO desconto do pedido, e aí a soma das remessas fecha
// exatamente o total quando tudo tiver saído.
// ⚠️ NUNCA ratear por quantidade: quilo e unidade não somam.
export function valorDaEntrega(remessa, itensDoPedido, itensCad, nRemessas = 1) {
  const total = Number(remessa?.valorTotal) || 0
  if (!total) return { valor: null, motivo: 'sem-valor' }
  if (nRemessas <= 1 && !remessa?.parcial) return { valor: arredondaMoeda(total), exato: true }
  const tabela = valorDeTabela(itensDoPedido, itensCad)
  const fator = fatorDesconto(total, tabela)
  if (fator == null) return { valor: null, motivo: 'sem-preco' }
  let soma = 0
  for (const it of (remessa.itens || [])) {
    const preco = precoDoItem(it, itensCad)
    if (preco == null) return { valor: null, motivo: 'sem-preco' }
    soma += preco * (Number(it.qtd) || 0)
  }
  return { valor: arredondaMoeda(fator * soma), exato: false, fator }
}

// ---------- A TRAVA: nada é cobrado duas vezes ----------
// Mesma ideia de `comprometimentoDeCargas` com volume: duas contas de "o que
// está livre" divergem em silêncio, e aí uma tela manda cobrar o que a outra já
// deu por cobrado.
export const chaveEntrega = (idVenda, remessa) => `${idVenda}|${remessa || 1}`
export const cobrancaCobrePedidoInteiro = (c) => !c?.remessa
export const cobrancasVivas = (cobrancas) =>
  (cobrancas || []).filter((c) => c?.status !== 'cancelada')

export function entregasCobertas(cobrancas) {
  const porPedido = new Set()
  const porEntrega = new Set()
  for (const c of cobrancasVivas(cobrancas)) {
    if (!c.idVenda) continue
    if (cobrancaCobrePedidoInteiro(c)) porPedido.add(String(c.idVenda))
    else porEntrega.add(chaveEntrega(c.idVenda, c.remessa))
  }
  return { porPedido, porEntrega }
}
export const entregaJaCobrada = (cobertas, idVenda, remessa) =>
  cobertas.porPedido.has(String(idVenda))
  || cobertas.porEntrega.has(chaveEntrega(idVenda, remessa))

// A fila de trabalho: entregas que ainda não viraram cobrança, já com o valor
// sugerido e o motivo quando ele não dá para calcular.
export function entregasParaCobrar(entregues, cobrancas, pedidos, itensCad) {
  const cobertas = entregasCobertas(cobrancas)
  const idx = indexaPorVenda(pedidos, entregues)
  return (entregues || [])
    // ⚠️ Entrega que já teve a BAIXA ANTIGA (`entregues.pago`, o interruptor que
    // existia antes deste módulo) não entra na fila: ela foi acertada no fluxo
    // velho. Sem isto, no primeiro dia a tela mostraria todo o histórico da
    // fábrica como dívida em aberto — e o número mais visível do sistema seria
    // uma mentira.
    .filter((e) => !e.pago)
    .filter((e) => !entregaJaCobrada(cobertas, e.idVenda, e.remessa))
    .map((e) => {
      const itens = itensDoPedidoInteiro(e.idVenda, pedidos, entregues, idx)
      const nR = (idx.remessas.get(String(e.idVenda)) || []).length || 1
      return { ...e, sugestao: valorDaEntrega(e, itens, itensCad, nR) }
    })
    .sort((a, b) => new Date(b.entregueEm || 0) - new Date(a.entregueEm || 0))
}

// ---------- PARCELAS ----------
// ⚠️ `n` é a identidade da parcela, NUNCA a posição no array. É o bug do
// `keyDoItem` de novo: editar a lista renumeraria e os recebimentos passariam a
// apontar para a parcela errada.
export function geraParcelas(valor, quantas, primeiroVenc, intervaloDias = 30, forma = '') {
  const qtd = Math.max(1, Math.floor(Number(quantas) || 1))
  const cents = Math.round(arredondaMoeda(valor) * 100)
  const base = Math.floor(cents / qtd)
  const resto = cents - base * qtd
  const lista = []
  for (let i = 0; i < qtd; i++) {
    lista.push({
      n: i + 1,
      // a sobra dos centavos vai na PRIMEIRA: dividida por igual, 100,00 em 3
      // viraria 99,99 e a cobrança nunca quitaria
      valor: (base + (i === 0 ? resto : 0)) / 100,
      venc: somaDias(primeiroVenc, i * (Number(intervaloDias) || 0)),
      forma: forma || '',
    })
  }
  return lista
}

// ---------- MOVIMENTOS (o livro-caixa) ----------
// Movimento não se edita nem se apaga: se CANCELA. Corrigir é cancelar e lançar
// de novo, com o cancelado riscado na tela — apagar esconderia que aconteceu.
export const movimentosVivos = (movs) => (movs || []).filter((m) => !m?.cancelado)

export function recebidoDaCobranca(cobrancaId, movs) {
  return arredondaMoeda(movimentosVivos(movs)
    .filter((m) => m.cobrancaId === cobrancaId)
    .reduce((s, m) => s + (Number(m.valor) || 0), 0))
}
export function recebidoDaParcela(cobrancaId, n, movs) {
  return arredondaMoeda(movimentosVivos(movs)
    .filter((m) => m.cobrancaId === cobrancaId && Number(m.parcelaN) === Number(n))
    .reduce((s, m) => s + (Number(m.valor) || 0), 0))
}
export const parcelaTemMovimento = (cobrancaId, n, movs) =>
  movimentosVivos(movs).some((m) => m.cobrancaId === cobrancaId && Number(m.parcelaN) === Number(n))

// as parcelas com o quanto já entrou em cada uma
export function parcelasDaCobranca(cob, movs) {
  return (cob?.parcelas || []).map((pc) => {
    const recebido = recebidoDaParcela(cob.id, pc.n, movs)
    return { ...pc, recebido, saldo: arredondaMoeda((Number(pc.valor) || 0) - recebido) }
  })
}

// ---------- SITUAÇÃO (derivada, nunca gravada) ----------
// Só `cancelada` é um fato gravado. Aberta/parcial/quitada/vencida saem da
// conta na hora, como `etapaDoItem` e `situacaoNoPlano`.
export function situacaoDaCobranca(cob, movs, hoje) {
  const valor = arredondaMoeda(cob?.valor)
  if (cob?.status === 'cancelada') {
    return { st: 'cancelada', valor, recebido: recebidoDaCobranca(cob.id, movs), saldo: 0 }
  }
  const recebido = recebidoDaCobranca(cob.id, movs)
  const saldo = arredondaMoeda(valor - recebido)
  const parcelas = parcelasDaCobranca(cob, movs)
  const abertas = parcelas.filter((pc) => pc.saldo > 0.004)
  const dia = hoje || hojeISO()
  const vencidas = abertas.filter((pc) => pc.venc && pc.venc < dia)
  const proxima = abertas.map((pc) => pc.venc).filter(Boolean).sort()[0] || ''
  // meio centavo de folga: divisão de parcela deixa resíduo, e cobrança que não
  // quita nunca sai da tela
  if (saldo <= 0.004) return { st: 'quitada', valor, recebido, saldo: 0, parcelas, proxima: '' }
  if (vencidas.length) {
    const maisVelha = vencidas.map((pc) => pc.venc).sort()[0]
    return {
      st: 'vencida', valor, recebido, saldo, parcelas, proxima: maisVelha,
      diasAtraso: diasEntreISO(maisVelha, dia), parcial: recebido > 0,
    }
  }
  return { st: recebido > 0 ? 'parcial' : 'aberta', valor, recebido, saldo, parcelas, proxima }
}

export function diasEntreISO(de, ate) {
  const a = dataDeISO(de); const b = dataDeISO(ate)
  if (!a || !b) return 0
  return Math.round((b - a) / 86400000)
}

export const SITUACAO_COBRANCA = {
  aberta: { nm: 'Em aberto', cor: 'var(--text-dim)' },
  parcial: { nm: 'Parcial', cor: 'var(--accent)' },
  vencida: { nm: 'Vencida', cor: 'var(--danger)' },
  quitada: { nm: 'Quitada', cor: 'var(--ok)' },
  cancelada: { nm: 'Cancelada', cor: 'var(--text-faint)' },
}

// as parcelas em aberto que vencem até um dia, ordenadas pelo vencimento.
// É a resposta de "o que eu tenho para receber esta semana".
export function parcelasVencendo(cobrancas, movs, ate) {
  const fora = []
  for (const cob of cobrancasVivas(cobrancas)) {
    for (const pc of parcelasDaCobranca(cob, movs)) {
      if (pc.saldo <= 0.004) continue
      if (ate && pc.venc && pc.venc > ate) continue
      fora.push({ cob, ...pc })
    }
  }
  return fora.sort((a, b) => String(a.venc).localeCompare(String(b.venc)))
}

// os números do cabeçalho. `recebidoNoMes` sai dos MOVIMENTOS, não das
// cobranças: é dinheiro que entrou, não promessa.
export function totaisReceber(cobrancas, movs, hoje) {
  const dia = hoje || hojeISO()
  const mes = dia.slice(0, 7)
  let aberto = 0; let vencido = 0; let quitado = 0
  for (const cob of cobrancasVivas(cobrancas)) {
    const s = situacaoDaCobranca(cob, movs, dia)
    aberto += s.saldo
    if (s.st === 'vencida') vencido += s.saldo
    if (s.st === 'quitada') quitado += s.valor
  }
  const recebidoNoMes = movimentosVivos(movs)
    .filter((m) => m.tipo !== 'saida' && String(m.data || '').slice(0, 7) === mes)
    .reduce((s, m) => s + (Number(m.valor) || 0), 0)
  return {
    aberto: arredondaMoeda(aberto), vencido: arredondaMoeda(vencido),
    quitado: arredondaMoeda(quitado), recebidoNoMes: arredondaMoeda(recebidoNoMes),
  }
}

// =====================================================================
// PIN DO POSTO COMPARTILHADO (tablet com login geral)
// =====================================================================
// O funcionário é um usuário do sistema (e-mail + senha) e, para dar baixa num
// tablet que fica logado numa conta só, usa um PIN de 4 dígitos ligado ao uid.
//
// O PIN mora em `pins/{uid}`, NÃO em `usuarios`: o tablet precisa ler o PIN de
// todo o setor, e abrir `usuarios` para ele exporia perfil e vínculos de todo
// mundo. Só vai o necessário para desenhar a faixa de nomes e conferir o PIN.
//
// ⚠️ A conferência é no navegador, então o hash protege contra o colega que
// toca no nome errado — não contra quem tem a API na mão (10 mil combinações se
// testam na hora). É a mesma natureza do log de auditoria: bom contra engano,
// não contra má-fé.

export const DOMINIO_LOGIN_INTERNO = 'jcsacolas.app'

export function pinValido(pin) {
  return /^\d{4}$/.test(String(pin ?? ''))
}

// PIN que o colega adivinha no primeiro chute. Recusar aqui é barato; aceitar
// "1234" transforma o PIN num botão a mais.
export function pinFraco(pin) {
  const s = String(pin ?? '')
  if (!pinValido(s)) return false
  if (/^(\d)\1{3}$/.test(s)) return true                       // 0000, 7777
  const d = s.split('').map(Number)
  const passo = d[1] - d[0]
  const seq = (passo === 1 || passo === -1) && d.every((x, i) => i === 0 || x - d[i - 1] === passo)
  return seq                                                   // 1234, 4321, 6789
}

// O que há de errado com o PIN, em português, ou '' quando está bom.
export function problemaDoPin(pin) {
  if (!pinValido(pin)) return 'O PIN tem que ter exatamente 4 números.'
  if (pinFraco(pin)) return 'PIN fácil demais (número repetido ou em sequência). Escolha outro.'
  return ''
}

// SHA-256(uid:pin) em hex. O uid entra de sal: o mesmo PIN em duas pessoas
// gera hashes diferentes, e ninguém descobre que "a Maria usa o mesmo do João".
export async function hashPin(uid, pin) {
  const bytes = new TextEncoder().encode(`${uid}:${pin}`)
  const dig = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(dig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function conferePin(uid, pin, hash) {
  if (!pinValido(pin) || !hash) return false
  return (await hashPin(uid, pin)) === hash
}

// O documento de `pins/{uid}`. `ativo` segue o USUÁRIO: desativar o acesso tem
// que desligar o PIN no mesmo clique, senão quem saiu da empresa continua dando
// baixa no tablet. E só operador dá baixa em posto — trocar o perfil desliga.
export function docPin(u, hash) {
  const d = {
    nome: String(u?.nome || '').trim(),
    setores: u?.perfil === 'operador' ? (u?.setores || []).map(normSetor) : [],
    // a conta do TABLET não é uma pessoa: PIN nela seria baixa sem autor
    ativo: u?.ativo !== false && u?.perfil === 'operador' && u?.posto !== true,
  }
  if (hash) d.hash = hash
  return d
}

// Login para quem não tem e-mail: "Maria José da Silva" → maria.silva@jcsacolas.app.
// Primeiro + último nome, sem acento; repete com 2, 3… se já existir.
export function loginInterno(nome, emailsExistentes = []) {
  const partes = normaliza(nome).toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(Boolean)
  if (!partes.length) return ''
  const base = partes.length > 1 ? `${partes[0]}.${partes[partes.length - 1]}` : partes[0]
  const usados = new Set((emailsExistentes || []).map((e) => String(e || '').toLowerCase()))
  for (let n = 1; ; n++) {
    const email = `${base}${n > 1 ? n : ''}@${DOMINIO_LOGIN_INTERNO}`
    if (!usados.has(email)) return email
  }
}

// Login interno não recebe e-mail: "redefinir senha" nesse endereço não chega a
// ninguém, e a tela tem que dizer isso em vez de fingir que mandou.
export function ehLoginInterno(email) {
  return String(email || '').toLowerCase().endsWith('@' + DOMINIO_LOGIN_INTERNO)
}

// ---------- o POSTO em uso (tablet) ----------
// Quanto tempo o funcionário identificado continua valendo sem mexer em nada.
// Cada baixa renova. Passou disso, o próximo a pegar o tablet não herda o nome.
export const POSTO_MINUTOS = 5
export const POSTO_TENTATIVAS = 5      // PIN errado seguido antes de esperar
export const POSTO_ESPERA_S = 30

// Milissegundos que ainda restam para quem está ativo (0 = expirou).
export function restaDoPosto(ultimo, agora = Date.now(), minutos = POSTO_MINUTOS) {
  if (!ultimo) return 0
  return Math.max(0, ultimo + minutos * 60000 - agora)
}

export function fmtResta(ms) {
  const s = Math.ceil((ms || 0) / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Quem aparece na faixa do tablet: PIN ligado, com hash, e que trabalha em
// algum setor deste posto. Ordem alfabética — a mão acha o nome sem ler tudo.
export function pinsDoPosto(pins, setoresDoPosto) {
  const meus = (setoresDoPosto || []).map(normSetor)
  return Object.entries(pins || {})
    .map(([uid, d]) => ({ uid, ...d }))
    .filter((d) => d.ativo === true && d.hash
      && (d.setores || []).map(normSetor).some((x) => meus.includes(x)))
    .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
}

// Quem assina o movimento. No tablet o LOGADO é o aparelho (`porUid`, exigido
// pela rule) e quem FEZ é o funcionário do PIN (`executor*`). Fora do tablet,
// as duas coisas são a mesma pessoa — e o executor vai preenchido igual, para a
// auditoria ter um campo só para "quem fez".
export function quemAssina({ user, nome, perfil, ip, posto, executor }) {
  const q = {
    porUid: user?.uid || '', porNome: nome || '', porEmail: user?.email || '',
    perfil: perfil || '', ip: ip || '',
    executorUid: user?.uid || '', executorNome: nome || '',
  }
  if (posto) {
    q.executorUid = executor?.uid || ''
    q.executorNome = executor?.nome || ''
    q.posto = true
  }
  return q
}

// Quem fez, para quem LÊ a auditoria (registro antigo não tem executor).
export function quemFez(r) {
  return r?.executorNome || r?.porNome || r?.porEmail || ''
}

// =====================================================================
// COR DA IMPRESSÃO (plástico) — ver ORDEM_FABRICACAO.md
// =====================================================================
// Marcada na Triagem, por item, em `pedidos/{id}.cores = { <keyDoItem>: [ids] }`.
// É a cor que agrupa as Ordens de Fabricação: 30×40 PRETO vai junto para a
// máquina; 30×40 DOURADO é outra OF. "Duas cores" = array com DOIS ids.
//
// A LISTA vem do cadastro (Cadastros › Cores, `config/cadastros.cores`). Estas
// são as cores de fábrica: valem enquanto o cadastro estiver vazio e são a base
// do primeiro salvamento.
export const CORES_PADRAO = [
  { id: 'preto', nm: 'Preto', hex: '#1b1b1b' },
  { id: 'dourado', nm: 'Dourado', hex: '#c9a227' },
  { id: 'vermelho', nm: 'Vermelho', hex: '#d32f2f' },
  { id: 'rosa', nm: 'Rosa', hex: '#e8559b' },
  { id: 'branca', nm: 'Branca', hex: '#f4f4f4' },
  { id: 'prata', nm: 'Prata', hex: '#aeb4bb' },
  { id: 'laranja', nm: 'Laranja', hex: '#f57c00' },
  { id: 'tiffany', nm: 'Tiffany', hex: '#0abab5' },
  { id: 'azul-medio', nm: 'Azul Médio', hex: '#1f6fd6' },
  // "Azul BB" = azul bebê, no nome usado na fábrica
  { id: 'azul-bb', nm: 'Azul BB', hex: '#9ccbf0' },
]

const RE_ID_COR = /^[a-z0-9][a-z0-9-]{0,39}$/
const RE_HEX = /^#[0-9a-f]{6}$/i

// Lista do cadastro, limpa. Vazia → as de fábrica.
export function coresDoCadastro(lista) {
  const ok = (Array.isArray(lista) ? lista : [])
    .filter((c) => c && RE_ID_COR.test(String(c.id || '')) && String(c.nm || '').trim())
    .map((c) => ({
      id: c.id, nm: String(c.nm).trim(),
      hex: RE_HEX.test(String(c.hex || '')) ? c.hex : '#888888',
      ativo: c.ativo !== false,
    }))
  const vistos = new Set()
  const unicas = ok.filter((c) => (vistos.has(c.id) ? false : vistos.add(c.id)))
  return unicas.length ? unicas : CORES_PADRAO.map((c) => ({ ...c, ativo: true }))
}

// Registro do módulo: o CadastrosProvider chama `definirCores` quando o
// cadastro chega. Passar a lista por parâmetro a cada `fmtCores` espalharia o
// cadastro por dezenas de telas e impressões.
let coresAtuais = coresDoCadastro([])
export function definirCores(lista) { coresAtuais = coresDoCadastro(lista) }
export const coresCadastradas = () => coresAtuais
export const coresAtivas = () => coresAtuais.filter((c) => c.ativo !== false)
// compatibilidade: quem ainda lê a lista como constante recebe a de fábrica
export const CORES_IMPRESSAO = CORES_PADRAO

const corPorId = (id) => coresAtuais.find((c) => c.id === id) || CORES_PADRAO.find((c) => c.id === id)
// id que o cadastro não conhece (cor apagada à mão no banco, cadastro ainda
// carregando) aparece pelo próprio id, arrumado — nunca some
export const nomeCor = (id) => corPorId(id)?.nm
  || String(id || '').split('-').map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(' ')
export const hexCor = (id) => corPorId(id)?.hex || '#888888'

// ⚠️ Só ids BEM FORMADOS, sem repetir, no máximo 2 — mas SEM exigir que estejam
// no cadastro. Filtrar pelo cadastro faria o Salvar da Triagem, rodando antes
// de o cadastro carregar, regravar o pedido SEM a cor: perda silenciosa.
export function limpaCores(v) {
  const arr = Array.isArray(v) ? v : []
  return [...new Set(arr.filter((x) => typeof x === 'string' && RE_ID_COR.test(x)))].slice(0, 2)
}

// "Azul Médio" → "azul-medio". O id é o que vai para os pedidos: nasce do nome
// e NUNCA muda — renomear a cor muda só o nome.
export function slugCor(nome) {
  return normaliza(nome).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

// Problema no formulário do cadastro, ou ''.
export function problemaDaCor({ nm, hex }, lista, idEditando) {
  const nome = String(nm || '').trim()
  if (!nome) return 'Informe o nome da cor.'
  if (!slugCor(nome)) return 'O nome precisa ter letras ou números.'
  if (!RE_HEX.test(String(hex || ''))) return 'Escolha a cor no seletor.'
  const repetida = (lista || []).find((c) => c.id !== idEditando
    && (normaliza(c.nm) === normaliza(nome) || (!idEditando && c.id === slugCor(nome))))
  if (repetida) return `Já existe a cor "${repetida.nm}".`
  return ''
}

export function coresDoItem(p, idx) {
  return limpaCores(doMapaDoItem(p?.cores, p, idx))
}

// Para telas que RECORTAM os itens (lista por linha, Rota): a posição muda
// depois do recorte, mas a chave gravada no item (`it.key`) não.
export function coresDoItemPorChave(p, it) {
  return it?.key ? limpaCores(p?.cores?.[it.key]) : []
}

export const corOk = (cores) => limpaCores(cores).length >= 1

// só plástico tem cor de impressão (decisão do dono, 16/09/2026)
export function itemPedeCor(it, itensCad) {
  return materialDoItem(it, itensCad) === 'plastico'
}

export function coresCompletas(p, itensCad) {
  return (p?.itens || []).every((it, i) => !itemPedeCor(it, itensCad) || corOk(coresDoItem(p, i)))
}

// Chave de AGRUPAMENTO: ordenada, senão "Preto + Dourado" e "Dourado + Preto"
// virariam duas Ordens de Fabricação.
export function chaveCor(cores) {
  return limpaCores(cores).slice().sort().join('+')
}

export function fmtCores(cores) {
  return limpaCores(cores).map(nomeCor).join(' + ')
}

// Status que a Triagem grava. A linha continua sendo o que decide; a COR entra
// só para quem ainda NÃO saiu da Triagem. ⚠️ Pedido de plástico triado antes de
// a cor existir já tem status e está na produção: exigir a cor dele faria o
// próximo "Salvar" zerar o status e o pedido SUMIR da produção.
export function statusDaTriagem(p, itensCad, statusAnterior) {
  if (!pedidoCompleto(p)) return ''
  if (!coresCompletas(p, itensCad) && !statusAnterior) return ''
  return linhaPredominante(p)
}

// "Sem definição" na Triagem: linha faltando, ou pedido com itens que ainda não
// ganhou status (é o caso de quem só está esperando a cor).
export function pendenteNaTriagem(p) {
  if (!pedidoCompleto(p)) return true
  return !!(p?.itens?.length) && !p.status
}

// =====================================================================
// ORDEM DE FABRICAÇÃO (fase B) — ver ORDEM_FABRICACAO.md
// =====================================================================
// A OF junta itens IGUAIS de pedidos diferentes (linha + produto + cor) para
// irem à máquina de uma vez. Guarda o retrato da liberação; o que a tela mostra
// de "quanto falta" é sempre a quantidade VIVA, lida dos pedidos.
export const STATUS_OF = { LIBERADA: 'liberada', CANCELADA: 'cancelada' }
export const ofViva = (o) => o && o.status !== STATUS_OF.CANCELADA
export const proximoNumeroOF = (ordens) =>
  (ordens || []).reduce((m, o) => Math.max(m, Number(o.numero) || 0), 0) + 1
export const fmtNumeroOF = (n) => `OF ${String(Number(n) || 0).padStart(4, '0')}`

// A OF viva deste item, ou ''. O vínculo `p.ofs` só vale se a OF ainda está
// viva: um vínculo que sobrou de uma OF cancelada não pode prender o item.
export function ofDoItem(p, idx, idsVivos) {
  const id = doMapaDoItem(p?.ofs, p, idx)
  if (!id) return ''
  return !idsVivos || idsVivos.has(id) ? id : ''
}
export const idsDeOFsVivas = (ordens) => new Set((ordens || []).filter(ofViva).map((o) => o.id))

export const chaveGrupoOF = (linha, produto, cores) =>
  `${linha}|${normaliza(produto)}|${chaveCor(cores)}`

// Itens de plástico que ESTÃO PRONTOS PARA UMA OF: triados (pedido com status),
// com linha, com cor, com saldo na linha e sem OF viva. `previsao` já vem
// calculada (a página chama previsaoDe) — a ordem é pelo prazo.
export function itensAguardandoOF(pedidos, itensCad, idsVivos) {
  const out = []
  for (const p of pedidos || []) {
    if (!p?.status) continue
    ;(p.itens || []).forEach((it, i) => {
      if (!itemPedeCor(it, itensCad)) return
      const linha = linhaDoItem(p, i)
      if (!linha) return
      const cores = coresDoItem(p, i)
      if (!corOk(cores)) return
      if (ofDoItem(p, i, idsVivos)) return
      // já estava na fila no dia da virada: termina como está, sem OF
      // (decisão do dono, 16/09/2026)
      if (jaEstavaNaFila(p, i)) return
      const qtd = qtdNaEtapa(p, i, linha)
      if (!(qtd > 0)) return
      out.push({
        p, idx: i, idVenda: p.idVenda, itemKey: keyDoItem(p, i),
        linha, produto: it.produto || '', cores, qtd,
        unidade: unidadeDoMaterial(materialDoItem(it, itensCad)),
        previsao: p.previsao || '',
        chave: chaveGrupoOF(linha, it.produto, cores),
      })
    })
  }
  return out
}

// Plástico que NÃO pode entrar em OF por falta de cor — a tela mostra o
// número para ninguém achar que a lista de espera está completa.
export function plasticoSemCor(pedidos, itensCad) {
  let n = 0
  for (const p of pedidos || []) {
    if (!p?.status) continue
    ;(p.itens || []).forEach((it, i) => {
      if (!itemPedeCor(it, itensCad) || corOk(coresDoItem(p, i))) return
      if (jaEstavaNaFila(p, i)) return      // não vai para OF: a cor não a segura
      const linha = linhaDoItem(p, i)
      if (linha && qtdNaEtapa(p, i, linha) > 0) n++
    })
  }
  return n
}

const ordemPrazo = (a, b) => (a.previsao || '9999').localeCompare(b.previsao || '9999')
  || String(a.idVenda).localeCompare(String(b.idVenda), 'pt-BR', { numeric: true })

// Um grupo por linha + produto + cor. O grupo com a entrega mais urgente vem
// primeiro; dentro dele, os itens também pelo prazo (é a ordem de marcação).
export function agrupaParaOF(itens) {
  const mapa = {}
  for (const x of itens || []) {
    const g = (mapa[x.chave] ??= {
      chave: x.chave, linha: x.linha, produto: x.produto, cores: x.cores,
      unidade: x.unidade, itens: [], total: 0,
    })
    g.itens.push(x)
    g.total = arredondaQtd(g.total + x.qtd)
  }
  const lista = Object.values(mapa)
  for (const g of lista) {
    g.itens.sort(ordemPrazo)
    g.previsao = g.itens[0]?.previsao || ''
    g.pedidos = new Set(g.itens.map((x) => x.idVenda)).size
  }
  return lista.sort((a, b) => ordemPrazo(a, b) || a.produto.localeCompare(b.produto))
}

// ---------- a OF junta VÁRIOS produtos da mesma cor (17/09/2026) ----------
// A OF é a IMPRESSÃO de uma cor numa linha: trocar tinta é o que custa, trocar
// o tamanho da sacola não. Por isso a chave da OF é linha + cor, e dentro dela
// o gestor escolhe QUAIS produtos (tamanhos, modelos, REC) entram — decisão do
// dono em 17/09/2026: "pode misturar tamanhos, não pode misturar cores".
export const chaveOF = (linha, cores) => `${linha}|${chaveCor(cores)}`

// Tamanho no nome do produto do Posseidon ("BOCA PALHAÇO 30X40 REC" → [30, 40]).
// Serve só para ORDENAR: os produtos parecidos ficam vizinhos na marcação.
export function tamanhoDoProduto(nome) {
  const m = String(nome || '').match(/(\d+)\s*[xX]\s*(\d+)/)
  return m ? [Number(m[1]), Number(m[2])] : null
}
export function ordemProdutoOF(a, b) {
  const ta = tamanhoDoProduto(a)
  const tb = tamanhoDoProduto(b)
  if (ta && tb && (ta[0] !== tb[0] || ta[1] !== tb[1])) return (ta[0] - tb[0]) || (ta[1] - tb[1])
  if (!!ta !== !!tb) return ta ? -1 : 1
  return String(a || '').localeCompare(String(b || ''), 'pt-BR')
}

// BLOCOS da espera: um por linha + cor, com os grupos (produtos) dentro. É o
// bloco que vira OF; o grupo é a linha de marcação. O mais urgente primeiro.
export function blocosParaOF(grupos) {
  const mapa = {}
  for (const g of grupos || []) {
    const chave = chaveOF(g.linha, g.cores)
    const b = (mapa[chave] ??= {
      chave, linha: g.linha, cores: g.cores, unidade: g.unidade, grupos: [], total: 0,
    })
    b.grupos.push(g)
    b.total = arredondaQtd(b.total + g.total)
  }
  const lista = Object.values(mapa)
  for (const b of lista) {
    b.grupos.sort((x, y) => ordemProdutoOF(x.produto, y.produto) || x.chave.localeCompare(y.chave))
    b.itens = b.grupos.flatMap((g) => g.itens)
    const datas = b.itens.map((x) => x.previsao || '').filter(Boolean).sort()
    b.previsao = datas[0] || ''
    b.pedidos = new Set(b.itens.map((x) => x.idVenda)).size
  }
  return lista.sort((a, b) => (a.previsao || '9999').localeCompare(b.previsao || '9999')
    || a.chave.localeCompare(b.chave))
}

// Resumo por produto de uma lista de itens da OF: [{ produto, produtoKey, qtd }].
function resumoProdutosOF(itens) {
  const mapa = {}
  for (const x of itens || []) {
    const produto = x.produto || ''
    const key = normaliza(produto)
    const r = (mapa[key] ??= { produto, produtoKey: key, qtd: 0 })
    r.qtd = arredondaQtd(r.qtd + (Number(x.qtd) || 0))
  }
  return Object.values(mapa).sort((a, b) => ordemProdutoOF(a.produto, b.produto))
}

// Os produtos de uma OF. Doc novo tem `produtos`; o antigo (uma OF = um produto)
// tinha `produto` no cabeçalho e nada no item — continua lendo, sem migração.
export function produtosDaOF(o) {
  if (Array.isArray(o?.produtos) && o.produtos.length) return o.produtos
  if (o?.produto) {
    return [{ produto: o.produto, produtoKey: o.produtoKey || normaliza(o.produto), qtd: arredondaQtd(o.total) }]
  }
  return resumoProdutosOF(o?.itens)
}
export const produtoDoItemOF = (o, x) => x?.produto || o?.produto || ''
// Para o cabeçalho: o nome quando é um produto só, a contagem quando são vários.
export function fmtProdutosOF(o) {
  const ps = produtosDaOF(o)
  return ps.length === 1 ? ps[0].produto : `${ps.length} produtos`
}

// Itens da OF quebrados por produto, na ordem de tamanho. `itens` pode ser o
// retrato (`o.itens`, para a ficha) ou a lista viva (situação).
export function itensPorProdutoOF(o, itens) {
  const mapa = {}
  for (const x of itens || []) {
    const produto = produtoDoItemOF(o, x)
    const key = normaliza(produto)
    const g = (mapa[key] ??= { produto, produtoKey: key, itens: [], total: 0, falta: 0, feito: 0, excedente: 0 })
    g.itens.push(x)
    g.total = arredondaQtd(g.total + (Number(x.qtd) || 0))
    g.falta = arredondaQtd(g.falta + (Number(x.falta) || 0))
    g.excedente = arredondaQtd(g.excedente + (Number(x.excedente) || 0))
  }
  const lista = Object.values(mapa)
  for (const g of lista) {
    g.itens.sort(ordemPrazo)
    g.feito = arredondaQtd(Math.max(0, g.total - g.falta))
  }
  return lista.sort((a, b) => ordemProdutoOF(a.produto, b.produto))
}

// O documento da OF. `itens` = só os escolhidos (o gestor pode deixar um para
// a próxima), com a quantidade do momento e o prazo, para a ficha. `grupo` é
// o que dá linha, cor e unidade (o bloco da espera, ou um grupo de produto).
export function docOF({ numero, grupo, escolhidos, quem, agora }) {
  const itens = (escolhidos || []).slice().sort(ordemPrazo).map((x) => ({
    idVenda: x.idVenda, itemKey: x.itemKey, produto: x.produto || grupo?.produto || '',
    qtd: arredondaQtd(x.qtd),
    previsao: x.previsao || '', cliente: x.p?.cliente || '', cidade: x.p?.cidade || '',
  }))
  return {
    numero,
    status: STATUS_OF.LIBERADA,
    linha: grupo.linha,
    material: 'plastico',
    produtos: resumoProdutosOF(itens),
    cores: limpaCores(grupo.cores),
    unidade: grupo.unidade || '',
    itens,
    total: arredondaQtd(itens.reduce((s, x) => s + x.qtd, 0)),
    criadaEm: agora || new Date().toISOString(),
    criadaPor: quem?.nome || '',
    criadaUid: quem?.uid || '',
  }
}

// Mapa `ofs` do pedido com o vínculo novo (ou sem ele, com ordemId = null).
// Substitui o mapa inteiro, como `linhasItens` — nada de merge profundo.
export function ofsComVinculo(p, itemKey, ordemId) {
  const m = { ...(p?.ofs || {}) }
  if (ordemId) m[itemKey] = ordemId
  else delete m[itemKey]
  return m
}

// Onde a OF está AGORA, derivado dos pedidos: quanto falta na linha de cada item.
// Concluída = nada mais na linha (ou o pedido já não existe). Em produção = algo
// já saiu da linha depois da liberação.
export function situacaoDaOF(o, pedidosPorId) {
  if (!o) return null
  if (o.status === STATUS_OF.CANCELADA) {
    return { st: 'cancelada', falta: 0, feito: 0, total: arredondaQtd(o.total), itens: [], produtos: [], excedente: 0 }
  }
  let falta = 0
  let excedente = 0
  const itens = (o.itens || []).map((x) => {
    const p = pedidosPorId?.[x.idVenda]
    const idx = p ? (p.itens || []).findIndex((_, i) => keyDoItem(p, i) === x.itemKey) : -1
    // ⚠️ o que está na LINHA inteiro, não limitado ao liberado: se um reimport
    // aumentou o item, o excedente continua preso a esta OF (o vínculo tira o
    // item da espera) e, limitado, ficaria invisível para sempre. A tela mostra
    // e AVISA; o gestor cancela e solta de novo (decisão do dono, 16/09/2026).
    const aqui = idx >= 0 ? qtdNaEtapa(p, idx, o.linha) : 0
    const exc = arredondaQtd(Math.max(0, aqui - (Number(x.qtd) || 0)))
    falta += aqui
    excedente += exc
    return {
      ...x, p, idx, produto: produtoDoItemOF(o, x),
      falta: arredondaQtd(aqui), excedente: exc, sumiu: idx < 0,
    }
  })
  falta = arredondaQtd(falta)
  excedente = arredondaQtd(excedente)
  const total = arredondaQtd(o.total ?? (o.itens || []).reduce((s, x) => s + (Number(x.qtd) || 0), 0))
  const feito = arredondaQtd(Math.max(0, total - falta))
  const st = falta <= 0 ? 'concluida' : feito > 0 ? 'em_producao' : 'liberada'
  // `produtos`: a mesma lista quebrada por produto — a baixa no quadro e a
  // ficha impressa são por produto, porque é o produto que muda na máquina.
  return { st, falta, feito, total, itens, produtos: itensPorProdutoOF(o, itens), excedente }
}

export const NOME_SITUACAO_OF = {
  liberada: 'Liberada', em_producao: 'Em produção', concluida: 'Concluída', cancelada: 'Cancelada',
}

// ---------- filtros da TRIAGEM por item ----------
// Material e "falta a cor" filtram ITENS, não só pedidos. ⚠️ O card continua
// recebendo o pedido INTEIRO e só esconde o que não passa: o Salvar da Triagem
// regrava `linhasItens`/`acabamentos`/`cores` inteiros, e um pedido recortado
// apagaria a linha dos itens escondidos.
export function itemFaltaCor(p, idx, itensCad) {
  const it = p?.itens?.[idx]
  return !!it && itemPedeCor(it, itensCad) && !corOk(coresDoItem(p, idx))
}

export function itemPassaNaTriagem(p, idx, itensCad, { material = '', faltaCor = false } = {}) {
  const it = p?.itens?.[idx]
  if (!it) return false
  if (material && materialDoItem(it, itensCad) !== material) return false
  if (faltaCor && !itemFaltaCor(p, idx, itensCad)) return false
  return true
}

export function pedidoPassaNaTriagem(p, itensCad, filtro) {
  if (!filtro?.material && !filtro?.faltaCor) return true
  return (p?.itens || []).some((_, i) => itemPassaNaTriagem(p, i, itensCad, filtro))
}

export const itensSemCor = (p, itensCad) =>
  (p?.itens || []).filter((_, i) => itemFaltaCor(p, i, itensCad)).length

// =====================================================================
// ORDEM DE FABRICAÇÃO no QUADRO (fase C)
// =====================================================================
// `config/producao` = { ofExigida, ofDesde, ofPor, ofMarcados }. Com a exigência
// ligada, sacola plástica SEM OF não entra na fila da linha — a não ser que
// estivesse lá no dia da virada (`pedidos.semOF[key] = true`, foto tirada no
// clique que liga a exigência). Virada escalonada, decisão do dono (16/09/2026):
// o que já estava termina como está; o que vem depois precisa de OF.
export const jaEstavaNaFila = (p, idx) => doMapaDoItem(p?.semOF, p, idx) === true

export function precisaDeOF(p, idx, itensCad, cfg) {
  if (!cfg?.ofExigida) return false
  const it = p?.itens?.[idx]
  if (!it || !itemPedeCor(it, itensCad)) return false
  return !jaEstavaNaFila(p, idx)
}

// Como o item entra numa coluna de LINHA do quadro:
//   'of'      → dentro do card da OF viva dele
//   'espera'  → fora do quadro, aguardando OF (conta no aviso)
//   'avulso'  → card do pedido, como sempre foi
export function modoNaLinha(p, idx, itensCad, cfg, idsVivos) {
  if (ofDoItem(p, idx, idsVivos)) return 'of'
  if (precisaDeOF(p, idx, itensCad, cfg)) return 'espera'
  return 'avulso'
}

// Foto da virada: sacolas plásticas que ESTÃO na linha agora, sem OF viva.
// Devolve { idVenda: [itemKey…] }. Pedido sem status ainda está na Triagem —
// não estava na fila, então não entra.
export function marcacaoDaVirada(pedidos, itensCad, idsVivos) {
  const out = {}
  for (const p of pedidos || []) {
    if (!p?.status) continue
    ;(p.itens || []).forEach((it, i) => {
      if (!itemPedeCor(it, itensCad)) return
      const linha = linhaDoItem(p, i)
      if (!linha || !(qtdNaEtapa(p, i, linha) > 0)) return
      if (ofDoItem(p, i, idsVivos) || jaEstavaNaFila(p, i)) return
      ;(out[p.idVenda] ??= []).push(keyDoItem(p, i))
    })
  }
  return out
}

// O CAMINHO DE VOLTA da virada (17/09/2026): o dono quis levar para OF pedidos
// que a foto tinha marcado como "já estava na fila" (os do Sérgio para 01/11,
// lançados antes da exigência). Tirar a marca é só isso — o item volta a
// obedecer a regra geral: com cor entra na espera de OF, sem cor cai no
// aviso "sem cor" da aba de OFs e precisa da Triagem.
// `legadosSemOF` = as sacolas marcadas que AINDA estão na linha, sem OF viva.
export function legadosSemOF(pedidos, itensCad, idsVivos) {
  const out = []
  for (const p of pedidos || []) {
    if (!p?.status) continue
    ;(p.itens || []).forEach((it, i) => {
      if (!itemPedeCor(it, itensCad) || !jaEstavaNaFila(p, i)) return
      const linha = linhaDoItem(p, i)
      if (!linha || !(qtdNaEtapa(p, i, linha) > 0)) return
      if (ofDoItem(p, i, idsVivos)) return
      out.push({ p, idx: i, idVenda: p.idVenda, itemKey: keyDoItem(p, i), temCor: corOk(coresDoItem(p, i)) })
    })
  }
  return out
}
// O mapa `semOF` do pedido sem estas chaves (substitui o mapa inteiro, como
// `linhasItens`). Aceita a chave antiga por posição, que `doMapaDoItem` lê.
export function semOFSem(p, keys) {
  const m = { ...(p?.semOF || {}) }
  for (const k of keys || []) delete m[k]
  return m
}

// Baixa PARCIAL de uma OF: completa o pedido mais urgente antes de passar ao
// próximo. `linhas` = [{ idVenda, idx, aqui, previsao }] (qualquer ordem).
// Devolve só quem recebe alguma coisa, com a quantidade arredondada.
export function distribuiBaixaOF(linhas, qtd) {
  let resta = arredondaQtd(qtd)
  const out = []
  for (const x of (linhas || []).slice().sort(ordemPrazo)) {
    if (resta <= 0) break
    const q = arredondaQtd(Math.min(resta, x.aqui))
    if (q <= 0) continue
    out.push({ ...x, qtd: q })
    resta = arredondaQtd(resta - q)
  }
  return out
}

// ============================================================
// WHATSAPP — central de conversas (ver WHATSAPP.md)
// Helpers PUROS, usados pelo navegador E pelo backend da VPS (backend/ importa
// este arquivo): o que é "um número de pedido" ou "o mesmo telefone" tem que
// ser a mesma resposta nos dois lados, senão a conversa liga ao cliente no
// servidor e não acha no navegador.
// ============================================================

export const somenteDigitos = (v) => String(v || '').replace(/\D/g, '')

// Forma canônica do telefone: só dígitos, com DDI 55 quando é brasileiro sem
// DDI, e COM o nono dígito. ⚠️ O WhatsApp devolve linhas antigas sem o nono
// dígito (5579 8888-0000 em vez de 5579 9 8888-0000) — sem normalizar, o mesmo
// cliente vira dois contatos.
export function chaveTelefone(v) {
  let d = somenteDigitos(v)
  if (!d) return ''
  if ((d.length === 10 || d.length === 11) && !d.startsWith('55')) d = '55' + d
  if (d.startsWith('55') && d.length === 12) {
    const ddd = d.slice(2, 4)
    const resto = d.slice(4)
    if (/^[6-9]/.test(resto)) d = `55${ddd}9${resto}`
  }
  return d
}

// Do JID do WhatsApp (5579999990000@s.whatsapp.net) para a chave. Grupo,
// status e @lid não têm telefone — devolve null e quem chama ignora.
export function telefoneDoJid(jid) {
  if (!jid) return null
  const j = String(jid)
  if (j.endsWith('@g.us') || j === 'status@broadcast' || j.endsWith('@broadcast') || j.endsWith('@lid')) return null
  const d = somenteDigitos(j.split('@')[0].split(':')[0])
  return d.length >= 8 ? chaveTelefone(d) : null
}

export function fmtTelefone(v) {
  const d = chaveTelefone(v)
  if (!d) return ''
  if (d.startsWith('55') && d.length === 13) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  if (d.startsWith('55') && d.length === 12) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`
  return `+${d}`
}

export const TIPOS_CONTATO = ['cliente', 'vendedor', 'motorista', 'fornecedor', 'outro']

// Quem é este número, pelos cadastros (`config/cadastros`): clientes[].telefones,
// vendedores[].telefone, motoristas[].telefone. Devolve null quando ninguém tem
// o número — a conversa aparece como "contato não identificado — vincular".
// Ordem: vendedor e motorista ANTES do cliente — o vendedor às vezes está
// cadastrado também como telefone de um cliente (ele que passou o número), e
// nesse caso quem fala é o vendedor.
export function resolveContato(telefone, cad) {
  const t = chaveTelefone(telefone)
  if (!t) return null
  const igual = (x) => chaveTelefone(x) === t
  const v = (cad?.vendedores || []).find((x) => igual(x?.telefone))
  if (v) return { tipo: 'vendedor', vendedorNome: v.nome || '' }
  const m = (cad?.motoristas || []).find((x) => igual(x?.telefone))
  if (m) return { tipo: 'motorista', motoristaNome: m.nome || '' }
  const c = (cad?.clientes || []).find((x) => (x?.telefones || []).some(igual) || igual(x?.telefone))
  if (c) return { tipo: 'cliente', clienteRazao: c.razao || '', clienteNome: c.nome || c.razao || '' }
  return null
}

// Números de pedido citados no texto ("o 5458", "#5458", "pedido 5.458").
// 4 ou 5 dígitos abaixo de LIMITE_SERIE_CURTA (a numeração da casa); com a
// lista dos pedidos conhecidos, devolve só os que existem — "2026" e "1500"
// aparecem em qualquer frase e não são pedido.
export function numerosDePedidoNoTexto(texto, conhecidos = null) {
  const s = String(texto || '').replace(/(\d)\.(\d{3})\b/g, '$1$2')
  const set = conhecidos ? new Set([...conhecidos].map(String)) : null
  const out = []
  // sem zero à esquerda e sem dígito/hífen colado: "99999-0000" é telefone, não o pedido 0000
  for (const m of s.matchAll(/(?<![\d-])#?([1-9]\d{3,4})(?![\d-])/g)) {
    const n = m[1]
    if (Number(n) >= LIMITE_SERIE_CURTA) continue
    if (set && !set.has(n)) continue
    if (!out.includes(n)) out.push(n)
  }
  return out
}

// ---------- eventos da Evolution API (canal não oficial, por QR code) ----------
// Payload de `messages.upsert`: { event, instance, data: { key: { remoteJid,
// fromMe, id }, pushName, message: {...}, messageTimestamp } }. As chaves de
// `message` dizem o tipo. Tudo defensivo: o formato muda entre versões e um
// campo que falta não pode derrubar o webhook.

const TIPOS_MSG_WA = [
  ['conversation', 'texto'], ['extendedTextMessage', 'texto'],
  ['imageMessage', 'imagem'], ['videoMessage', 'video'], ['audioMessage', 'audio'],
  ['documentMessage', 'documento'], ['documentWithCaptionMessage', 'documento'],
  ['stickerMessage', 'figurinha'], ['locationMessage', 'localizacao'],
  ['contactMessage', 'contato'], ['contactsArrayMessage', 'contato'],
  ['reactionMessage', 'reacao'], ['ptvMessage', 'video'],
]
export const TIPOS_COM_MIDIA = ['imagem', 'video', 'audio', 'documento', 'figurinha']

// desembrulha ephemeral/viewOnce/documentWithCaption, que envolvem a mensagem real
function miolo(msg) {
  let m = msg || {}
  for (let i = 0; i < 4; i++) {
    const w = m.ephemeralMessage || m.viewOnceMessage || m.viewOnceMessageV2 || m.documentWithCaptionMessage || m.editedMessage
    if (!w?.message) break
    m = w.message
  }
  return m
}

export function tipoDaMensagemWa(message) {
  const m = miolo(message)
  for (const [k, tipo] of TIPOS_MSG_WA) if (m[k] != null) return tipo
  return 'outro'
}

export function textoDaMensagemWa(message) {
  const m = miolo(message)
  const t = m.conversation
    || m.extendedTextMessage?.text
    || m.imageMessage?.caption || m.videoMessage?.caption || m.documentMessage?.caption
    || m.reactionMessage?.text
    || (m.locationMessage ? `📍 ${m.locationMessage.name || ''} ${m.locationMessage.address || ''}`.trim() : '')
    || (m.contactMessage ? `👤 ${m.contactMessage.displayName || 'contato'}` : '')
    || ''
  return String(t).trim()
}

export function midiaDaMensagemWa(message) {
  const m = miolo(message)
  const x = m.imageMessage || m.videoMessage || m.audioMessage || m.documentMessage || m.stickerMessage || m.ptvMessage
  if (!x) return null
  return { mime: x.mimetype || '', nomeArquivo: x.fileName || '', segundos: Number(x.seconds) || 0 }
}

function isoDoTimestampWa(ts) {
  const n = typeof ts === 'object' && ts ? Number(ts.low ?? ts.seconds) : Number(ts)
  if (!(n > 0)) return new Date().toISOString()
  return new Date(n > 1e12 ? n : n * 1000).toISOString()
}

// Normaliza QUALQUER evento do webhook para uma forma pequena e estável.
// evento ∈ mensagem | status | conexao | ignorado.
export function normalizaEventoWa(payload) {
  const ev = String(payload?.event || '').toLowerCase().replace(/_/g, '.')
  const d = payload?.data || {}
  const instancia = payload?.instance || ''
  if (ev === 'connection.update') {
    return { evento: 'conexao', instancia, estado: d.state || d.status || '', motivo: d.statusReason ?? null }
  }
  if (ev === 'messages.update') {
    const lista = Array.isArray(d) ? d : [d]
    return {
      evento: 'status', instancia,
      itens: lista.map((x) => ({ waId: x?.keyId || x?.key?.id || '', status: String(x?.status || '').toLowerCase() })).filter((x) => x.waId),
    }
  }
  if (ev !== 'messages.upsert') return { evento: 'ignorado', motivo: `evento ${payload?.event || '?'}` }
  const key = d.key || {}
  const telefone = telefoneDoJid(key.remoteJid)
  if (!telefone) return { evento: 'ignorado', motivo: 'grupo/status/lid' }
  if (d.messageStubType || (!d.message && !d.messageType)) return { evento: 'ignorado', motivo: 'sem conteúdo' }
  const tipo = tipoDaMensagemWa(d.message)
  if (tipo === 'reacao') return { evento: 'ignorado', motivo: 'reação' }
  const midia = midiaDaMensagemWa(d.message)
  return {
    evento: 'mensagem', instancia,
    waId: key.id || '',
    telefone,
    de: key.fromMe ? 'nos' : 'cliente',
    nome: key.fromMe ? '' : String(d.pushName || '').trim(),
    tipo, texto: textoDaMensagemWa(d.message),
    temMidia: TIPOS_COM_MIDIA.includes(tipo),
    mime: midia?.mime || '', nomeArquivo: midia?.nomeArquivo || '', segundos: midia?.segundos || 0,
    quando: isoDoTimestampWa(d.messageTimestamp),
  }
}

// Documento em conversas/{tel}/mensagens/{waId}. `waId` é o id do doc de
// propósito: o webhook pode repetir o mesmo evento, e repetir o id não duplica.
export function docMensagemWa(ev, extra = {}) {
  return {
    de: ev.de, tipo: ev.tipo, texto: ev.texto || '',
    porUid: '', porNome: ev.de === 'nos' ? (extra.porNome || '📱 celular') : (ev.nome || ''),
    waId: ev.waId, statusWa: ev.de === 'nos' ? 'enviada' : 'recebida',
    midiaPath: '', midiaMime: ev.mime || '', nomeArquivo: ev.nomeArquivo || '', segundos: ev.segundos || 0,
    idVenda: '', idVendasSugeridos: extra.idVendasSugeridos || [], demandaId: '',
    quando: ev.quando,
    ...extra,
  }
}

// Campos da conversa que mudam a cada mensagem. `naoLidas` é incrementado por
// quem grava (FieldValue.increment no backend), por isso não sai daqui.
export function resumoConversaWa(ev, contato) {
  const prefixo = ev.tipo === 'texto' ? '' : `[${ev.tipo}] `
  return {
    telefone: ev.telefone,
    contatoNome: contato?.clienteNome || contato?.vendedorNome || contato?.motoristaNome || ev.nome || '',
    tipo: contato?.tipo || '',
    clienteRazao: contato?.clienteRazao || '',
    vendedorNome: contato?.vendedorNome || '',
    motoristaNome: contato?.motoristaNome || '',
    ultimaMsg: (prefixo + (ev.texto || '')).slice(0, 160),
    ultimaEm: ev.quando,
    ultimaDe: ev.de,
  }
}

// Assinatura de quem escreve pelo sistema — padrão da Agência 100K:
// `*Nome:*` + linha em branco + texto. No celular do cliente fica claro quem
// falou, já que o número é um só para o escritório inteiro.
export const assinaTextoWa = (nome, texto) => (nome ? `*${nome}:*\n\n${texto}` : texto)

// O backend da VPS carimba `config/backend.vivoEm` a cada minuto. Passou de
// `limiteMin` sem carimbo, a tela avisa — webhook que cai em silêncio é
// mensagem de cliente que ninguém vê.
export function backendVivo(vivoEm, agora = new Date(), limiteMin = 3) {
  const t = vivoEm ? new Date(vivoEm).getTime() : 0
  if (!(t > 0)) return false
  return (agora.getTime() - t) <= limiteMin * 60 * 1000
}

// =====================================================================
// CONTROLE DE ENTREGA — a planilha do escritório vira tela (07/10/2026)
// =====================================================================
// A fábrica não dá baixa no quadro; quando a nota fiscal sobe, o escritório
// registra numa planilha o que o sistema deveria saber. Esta seção é a ENTRADA
// do escritório: digita o número, declara "pronto" (vai para `expedido`),
// "saiu" e "entregue". Desenho em CONTROLE_ENTREGA.md.
//
// Princípios que o código abaixo cumpre:
//  - é uma baixa NORMAL de etapa (mapa + auditoria no mesmo batch), só que
//    carimbada com `origem: 'escritorio'` — é esse carimbo que depois diz qual
//    setor não está dando baixa;
//  - sem balança não há volume: o que está solto anda por QUANTIDADE (caminho
//    do item legado). NUNCA inventar volume nem peso;
//  - item já embalado anda por VOLUME (os que estão em `expedicao`); o resto
//    solto dele é RECUSADO com motivo — misturar quantidade solta com volumes
//    num item só não tem representação honesta no modelo.

export const ORIGEM_BAIXA = { ESCRITORIO: 'escritorio', FABRICA: 'fabrica', CONCILIACAO: 'conciliacao' }

// Quem usa a tela (os dois eixos, como a aba Entregas): staff + perfil
// expedição + operador com setor expedicao|entrega. Rules já cobrem os campos.
export function podeBaixarNoControle(perfil, setores) {
  if (['dono', 'designer', 'financeiro', 'expedicao'].includes(perfil)) return true
  if (perfil !== 'operador') return false
  const meus = (setores || []).map(normSetor)
  return meus.includes('expedicao') || meus.includes('entrega')
}
// A ENTREGA (que abre a cobrança) é do FINANCEIRO — e do dono (decisão do dono
// em 07/10/2026, revisada no mesmo dia: o designer lança, não entrega).
export const podeEntregarNoControle = (perfil) => ['dono', 'financeiro'].includes(perfil)

// Situação de cada item para o card: o que está na fábrica (solto), o que já
// está embalado esperando o ✓ Expedir, o que está pronto, o que foi entregue.
// `baixavel` = há algo que a baixa do escritório consegue mover; `recusa` =
// quantidade solta de item já embalado (precisa da balança na montagem).
export function situacaoBaixa(p, itensCad) {
  return (p?.itens || []).map((it, i) => {
    const d = distribuicaoDoItem(p, i)
    const linha = linhaDoItem(p, i) || 'triagem'
    const embalado = temVolumes(p, i)
    const volsExp = volumesNaEtapa(p, i, 'expedicao')
    const solta = arredondaQtd((d[linha] || 0) + (d.montagem || 0) + (embalado ? 0 : (d.expedicao || 0)))
    const onde = []
    if (d[linha] > 0) onde.push({ etapa: linha, qtd: arredondaQtd(d[linha]) })
    if (d.montagem > 0) onde.push({ etapa: 'montagem', qtd: arredondaQtd(d.montagem) })
    if (d.expedicao > 0) onde.push({ etapa: 'expedicao', qtd: arredondaQtd(d.expedicao), volumes: volsExp.length })
    return {
      idx: i,
      key: keyDoItem(p, i),
      produto: it.produto || '',
      material: materialDoItem(it, itensCad),
      linha,
      qtdItem: arredondaQtd(it.qtd),
      onde,                                  // onde a parte não pronta está
      pronto: arredondaQtd(d.expedido),      // já em `expedido`
      entregue: arredondaQtd(d.entregue),
      embalado,
      volumesParaExpedir: volsExp,           // ids dos volumes em `expedicao`
      solta,                                 // quantidade solta (sem volume)
      // só o que a baixa consegue mover: solto de item sem volume, ou volumes
      // embalados em expedição
      baixavel: embalado ? volsExp.length > 0 : solta > 0,
      recusa: embalado && solta > 0 ? { qtd: solta, motivo: 'sem-pesagem' } : null,
      concluido: solta <= 0 && volsExp.length === 0,   // nada a fazer neste item
    }
  })
}

// A BAIXA DO ESCRITÓRIO. `idxs` = itens marcados no card (padrão: todos).
// Devolve o mapa de etapas pronto para o updateDoc, os registros de auditoria
// (um por item × etapa de origem, com `origem: 'escritorio'`), os campos que o
// pedido ganha e o que foi recusado. `movidos` vazio = nada a gravar.
// Devolve MAPA, então vai envolvido em `carimbaTempos` (regra da casa).
export function baixaEscritorio(p, idxs, quem, itensCad, agora, { inteiro = false } = {}) {
  const t = agora || new Date().toISOString()
  const alvo = new Set(idxs || (p?.itens || []).map((_, i) => i))
  const sit = situacaoBaixa(p, itensCad)
  const assina = quem?.executorNome || quem?.porNome || ''
  const mapa = {}
  const movidos = []
  const recusados = []
  const registros = []
  const base = (s) => ({
    idVenda: p?.idVenda || '', cliente: p?.cliente || '', itemKey: s.key,
    produto: s.produto, qtdItem: s.qtdItem, linha: linhaDoItem(p, s.idx) || '',
    material: s.material || '', para: 'expedido', quando: t,
    origem: ORIGEM_BAIXA.ESCRITORIO, ...(quem || {}),
  })
  ;(p?.itens || []).forEach((_, i) => {
    const s = sit[i]
    const ant = doMapaDoItem(p?.etapas, p, i)
    const guarda = {
      ...(ant?.desde ? { desde: ant.desde } : {}),
      ...(ant?.tempos ? { tempos: ant.tempos } : {}),
    }
    // LANÇAMENTO INTEIRO (decisão do dono em 07/10/2026): o escritório declara
    // o pedido todo finalizado. A parte solta de um item já embalado vira um
    // volume próprio com a quantidade PEDIDA e `semPesagem: true` — não é o
    // peso da balança, e o campo diz isso; sem ele o resto ficaria preso na
    // fábrica contra o que o escritório acabou de declarar.
    if (alvo.has(i) && s.recusa && inteiro) {
      const base0 = movePorVolume(p, i, s.volumesParaExpedir, 'expedido', assina)
        || { ...(ant || {}), por: assina, em: t }
      mapa[s.key] = {
        ...base0,
        montagem: 0,
        produzido: arredondaQtd((Number(ant?.produzido) || 0) + s.recusa.qtd),
        volumes: [
          ...(base0.volumes || volumesDoItem(p, i).map((v) => ({ id: v.id, qtd: v.qtd, et: v.et }))),
          { id: `${t}-esc`, qtd: s.recusa.qtd, et: 'expedido', semPesagem: true },
        ],
        por: assina, em: t,
      }
      const volsAntes = volumesDoItem(p, i).filter((v) => s.volumesParaExpedir.includes(v.id))
      const qtdVol = arredondaQtd(volsAntes.reduce((sm, v) => sm + v.qtd, 0))
      movidos.push({ idx: i, key: s.key, produto: s.produto, qtd: arredondaQtd(qtdVol + s.recusa.qtd),
        de: [...(volsAntes.length ? ['expedicao'] : []), ...s.onde.filter((o) => o.etapa !== 'expedicao').map((o) => o.etapa)],
        volumes: volsAntes.length + 1, semPesagem: s.recusa.qtd })
      if (volsAntes.length) registros.push({ ...base(s), de: 'expedicao', qtd: qtdVol, volumes: volsAntes.length })
      for (const o of s.onde.filter((o) => o.etapa !== 'expedicao')) registros.push({ ...base(s), de: o.etapa, qtd: o.qtd, semPesagem: true })
      return
    }
    if (alvo.has(i) && s.recusa) recusados.push({ idx: i, key: s.key, produto: s.produto, ...s.recusa })
    if (alvo.has(i) && s.baixavel) {
      if (s.embalado) {
        // item embalado: os volumes em expedição vão para expedido
        const novo = movePorVolume(p, i, s.volumesParaExpedir, 'expedido', assina)
        if (novo) {
          mapa[s.key] = novo
          const vols = volumesDoItem(p, i).filter((v) => s.volumesParaExpedir.includes(v.id))
          const qtd = arredondaQtd(vols.reduce((sm, v) => sm + v.qtd, 0))
          movidos.push({ idx: i, key: s.key, produto: s.produto, qtd, de: ['expedicao'], volumes: vols.length })
          registros.push({ ...base(s), de: 'expedicao', qtd, volumes: vols.length })
          return
        }
      } else {
        // item solto: tudo que está na fábrica vira `expedido`, por quantidade.
        // Um registro por ETAPA de origem — é isso que depois diz de onde o
        // escritório está tendo que tirar o pedido.
        const d = distribuicaoDoItem(p, i)
        mapa[s.key] = {
          montagem: 0, expedicao: 0,
          expedido: arredondaQtd(d.expedido + s.solta),
          entregue: arredondaQtd(d.entregue),
          por: assina, em: t, ...guarda,
        }
        movidos.push({ idx: i, key: s.key, produto: s.produto, qtd: s.solta, de: s.onde.map((o) => o.etapa) })
        for (const o of s.onde) registros.push({ ...base(s), de: o.etapa, qtd: o.qtd })
        return
      }
    }
    // congela o resto no formato novo (como os outros construtores), SEM perder
    // o relógio do item que não se moveu
    if (Array.isArray(ant?.volumes) && ant.volumes.length) { mapa[s.key] = ant; return }
    const d = distribuicaoDoItem(p, i)
    mapa[s.key] = {
      montagem: d.montagem, expedicao: d.expedicao, expedido: d.expedido, entregue: d.entregue,
      por: ant?.por || '', em: ant?.em || '', ...guarda,
    }
  })
  return {
    etapas: carimbaTempos(p, mapa, t),
    registros,
    movidos,
    recusados,
    // o carimbo que a tabela do mês lê para dizer "baixado pelo escritório"
    campos: movidos.length
      ? { baixaEscritorio: { em: t, por: assina, uid: quem?.executorUid || quem?.porUid || '' } }
      : {},
  }
}

// O LANÇAMENTO do Controle de entrega: a nota chegou, o pedido está finalizado
// e SAIU com o motorista. Uma ação só (decisão do dono em 07/10/2026): baixa
// INTEIRA do que ainda estava na fábrica + carimbo do escritório + saída.
// Pedido que a fábrica já tinha baixado também é lançado — é o lançamento,
// não a etapa, que põe o pedido na lista do escritório.
// Devolve null sem motorista: a saída sem quem levou não existe.
// DE ONDE O ESCRITÓRIO PUXOU (Fase E4, 08/10/2026). A baixa em cascata grava um
// registro de auditoria por item × etapa de origem; aqui vira o resumo que o
// carimbo do lançamento guarda, para a lista dizer por pedido o que a fábrica
// deixou de fazer no sistema: [{ etapa, posto, itens }], no nome do posto
// (montagem por material), na ordem do fluxo. [] = a fábrica já tinha
// finalizado tudo (só o carimbo). A auditoria continua sendo a fonte histórica.
export function resumoPuxado(registros) {
  const m = new Map()
  for (const r of registros || []) {
    if (!r?.de) continue
    const posto = ondeProcurar(r.de, r.material)
    const e = m.get(posto) || { etapa: r.de, posto, itens: new Set() }
    e.itens.add(r.itemKey || r.produto || String(m.size))
    m.set(posto, e)
  }
  return [...m.values()]
    .sort((a, b) => ordemEtapaLocal(a.etapa) - ordemEtapaLocal(b.etapa) || a.posto.localeCompare(b.posto))
    .map((e) => ({ etapa: e.etapa, posto: e.posto, itens: e.itens.size }))
}
export const fmtPuxou = (puxou) =>
  (puxou || []).map((x) => `${x.posto} (${x.itens})`).join(', ')

// O rótulo da coluna Origem: fábrica × escritório, e no escritório DE ONDE
// puxou. `puxou` null/undefined = lançamento anterior à E4 (sem detalhe).
export function rotuloOrigem(origem, puxou) {
  if (!origem) return '—'
  if (origem !== ORIGEM_BAIXA.ESCRITORIO) return origem === ORIGEM_BAIXA.CONCILIACAO ? '📄 conciliação' : '🏭 fábrica'
  if (!Array.isArray(puxou)) return '🏢 escritório'
  if (!puxou.length) return '🏢 escritório · só o carimbo'
  return `🏢 escritório · puxou de ${fmtPuxou(puxou)}`
}

export function lancarControle(p, quem, motorista, itensCad, agora) {
  const t = agora || new Date().toISOString()
  const mot = String(motorista || '').trim()
  if (!mot) return null
  const b = baixaEscritorio(p, null, quem, itensCad, t, { inteiro: true })
  const assina = quem?.executorNome || quem?.porNome || ''
  return {
    ...b,
    campos: {
      // carimbo do lançamento (mesmo nome do carimbo da baixa — é o que a
      // lista lê, e o que a rule da expedição libera). `puxou` = de onde o
      // escritório tirou o que a fábrica não baixou (E4).
      baixaEscritorio: { em: t, por: assina, uid: quem?.executorUid || quem?.porUid || '', motorista: mot, puxou: resumoPuxado(b.registros) },
      saidaEm: t, saidaMotorista: mot, saidaPor: assina,
    },
    // etapas só muda se algo se moveu; o pedido já pronto recebe só os campos
    gravaEtapas: b.movidos.length > 0,
  }
}
export const lancadoNoControle = (p) => !!p?.baixaEscritorio?.em

// De onde veio a baixa para `expedido` deste pedido/remessa.
export const origemDaBaixa = (p) =>
  (p?.origem === 'conciliacao-planilha' ? ORIGEM_BAIXA.CONCILIACAO
    : p?.baixaEscritorio?.em ? ORIGEM_BAIXA.ESCRITORIO : ORIGEM_BAIXA.FABRICA)

// ---------- a REMESSA (entregar) — fonte única para Rota e Controle ----------
// Era `gravarEntrega` dentro de Rota.jsx. A parte PURA fica aqui para as duas
// telas gravarem a mesma coisa. `p` pode vir fatiado por `fatiaProntos`
// (`_todos`/`_idxs`) ou inteiro. Devolve null quando não há nada expedido.
export function preparaRemessa(p, motorista, quem, agora) {
  const t = agora || new Date().toISOString()
  const todos = p?._todos || p?.itens || []
  const idxs = p?._idxs || todos.map((_, i) => i)
  const base = { ...p, itens: todos }          // pedido cheio: as contas precisam do total
  const movs = idxs
    .map((i) => ({ idx: i, de: 'expedido', para: 'entregue', qtd: qtdNaEtapa(base, i, 'expedido') }))
    .filter((m) => m.qtd > 0)
  if (!movs.length) return null
  // item embalado baixa VOLUME por volume; o legado continua por quantidade
  const porVolume = movs
    .filter((m) => temVolumes(base, m.idx))
    .map((m) => ({ idx: m.idx, ids: volumesNaEtapa(base, m.idx, 'expedido'), para: 'entregue' }))
    .filter((m) => m.ids.length)
  const porQtd = movs.filter((m) => !temVolumes(base, m.idx))
  // pedido MISTO (um item por volume, outro por quantidade): cada construtor
  // congela o que não é dele, então o de quantidade roda sobre o resultado
  let etapas = base.etapas
  if (porVolume.length) etapas = mapaEtapasMovendoVolumes(base, porVolume, quem)
  if (porQtd.length) etapas = mapaEtapasComQtd({ ...base, etapas }, porQtd, quem)
  if (!porVolume.length && !porQtd.length) return null
  const depois = { ...base, etapas }
  const acabou = pedidoTodoEntregue(depois)
  const n = (p.remessas || 0) + 1
  // `id` fica de fora: é o id do doc de `pedidos`, e gravado aqui dentro ele
  // sobrescrevia o id do doc da remessa na leitura (ver `doDoc`)
  const { _todos, _idxs, _pendentes, id, ...pedido } = p
  return {
    docId: `${p.idVenda}-${n}`,
    n,
    acabou,
    etapas,
    remessa: {
      ...pedido,
      idVenda: p.idVenda,
      itens: movs.map((m) => ({ ...todos[m.idx], qtd: m.qtd, qtdItem: arredondaQtd(todos[m.idx]?.qtd) })),
      remessa: n,
      parcial: !acabou,
      itensPendentes: todos.filter((_, i) => qtdPendente(depois, i) > 0).length,
      motorista: motorista || '',
      entregueEm: t,
    },
  }
}

// ---------- a LISTA (a planilha, derivada do banco) ----------
// Entra TUDO que está pronto e ainda não foi entregue — a baixa da fábrica e o
// lançamento do escritório lado a lado, com a ORIGEM dizendo de quem foi
// (decisão do dono em 07/10/2026, depois de uma versão que mostrava só o
// lançado: "a lista abre toda"). Entregue SAI da lista: o histórico é a aba
// Entregues. Nada disso é coleção: é VISÃO sobre `pedidos`.
//   SERÁ ENTREGUE = na rua (saída marcada — pelo lançamento, pela Rota ou pela carga)
//   PRONTO        = pronto no galpão, ainda sem saída (a fábrica baixou, ninguém lançou)
//   NÃO ENTREGOU  = foi lançado, voltou no caminhão (saída apagada); sai de novo
// 'producao' = ainda na fábrica (Fase E2, 08/10/2026): entra na lista para o
// escritório consultar a FASE sem ir ao quadro. Não tem baixa nem origem.
export const SITUACAO_CONTROLE = { SERA: 'sera', PRONTO: 'pronto', VOLTOU: 'voltou', PRODUCAO: 'producao' }
export const NOME_SITUACAO_CONTROLE = { sera: 'SERÁ ENTREGUE', pronto: 'PRONTO', voltou: 'NÃO ENTREGOU', producao: 'EM PRODUÇÃO' }

// A FASE do pedido para a lista do escritório: as paradas DISTINTAS do que
// ainda não está pronto, no nome do posto ("SILK SCREEN", "Montagem Papel",
// "Expedição"), na ordem do fluxo. Pedido dividido lista todas; item sem linha
// = "Triagem". Pronto/entregue não entram — a situação já diz isso.
export function faseDoPedido(p, itensCad) {
  const vistos = new Map()   // rótulo -> ordem no fluxo
  ;(p?.itens || []).forEach((it, i) => {
    const mat = materialDoItem(it, itensCad)
    for (const par of paradasDoItem(p, i)) {
      if (par.etapa === 'expedido' || par.etapa === 'entregue') continue
      const rotulo = par.etapa === 'triagem' ? 'Triagem' : ondeProcurar(par.etapa, mat)
      // montagem por material: a ordem é a da montagem, desempate pelo nome
      if (!vistos.has(rotulo)) vistos.set(rotulo, ordemEtapaLocal(par.etapa))
    }
  })
  return [...vistos.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([r]) => r)
}

// 'YYYY-MM' pelas partes LOCAIS (em UTC-3 o ISO cai no mês anterior na virada)
export const mesDe = (iso) => {
  const d = diaISO(iso)
  return d ? d.slice(0, 7) : ''
}
const MESES_PT = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO']
// 'OUTUBRO 2026' — o nome que a aba da planilha deles tem
export const rotuloMes = (mes) => {
  const [a, m] = String(mes || '').split('-').map(Number)
  return MESES_PT[m - 1] ? `${MESES_PT[m - 1]} ${a}` : String(mes || '')
}

// quando o pedido ficou pronto: a entrada mais recente em `expedido` entre os
// itens prontos (aproximada quando não há carimbo — como no Localizar)
export function prontoDesde(p) {
  let maior = ''
  let exato = true
  for (const i of idxProntos(p)) {
    const e = entradaNaEtapa(p, i, 'expedido')
    if (e.iso && e.iso > maior) maior = e.iso
    if (!e.exato) exato = false
  }
  return { iso: maior, exato }
}

export function linhasControleEntrega(pedidos, { situacao, origem, clientes, vendedores, itensCad } = {}) {
  const linhas = []
  for (const p of pedidos || []) {
    const prontos = idxProntos(p)
    // ainda na fábrica (nada pronto): entra como EM PRODUÇÃO com a fase, para
    // o escritório consultar — sem baixa, sem origem, sem motorista
    if (!prontos.length) {
      if (!temTrabalhoNaProducao(p)) continue
      linhas.push({
        chave: String(p.idVenda ?? ''),
        situacao: SITUACAO_CONTROLE.PRODUCAO,
        idVenda: String(p.idVenda ?? ''),
        cliente: nomeCliente(p.cliente, clientes),
        cidade: p.cidade || '',
        rota: vendedores ? rotaDe(p, vendedores) : (p.rota || ''),
        vendedor: p.vendedor || '',
        valor: Number(p.valorTotal) || 0,
        origem: '',
        fase: faseDoPedido(p, itensCad),
        previsao: p.previsao || '',
        quando: '', aproximado: false, lancadoEm: '', lancadoPor: '', saidaEm: '', motorista: '',
        itens: 0, itensTotal: (p.itens || []).length, parcial: false,
        remessas: Number(p.remessas) || 0,
        docId: p.id || String(p.idVenda ?? ''),
      })
      continue
    }
    const saiu = saiuParaEntrega(p)
    const lancado = lancadoNoControle(p)
    const lanc = p.baixaEscritorio || {}
    const desde = prontoDesde(p)
    linhas.push({
      chave: String(p.idVenda ?? ''),
      situacao: saiu ? SITUACAO_CONTROLE.SERA : lancado ? SITUACAO_CONTROLE.VOLTOU : SITUACAO_CONTROLE.PRONTO,
      idVenda: String(p.idVenda ?? ''),
      cliente: nomeCliente(p.cliente, clientes),
      cidade: p.cidade || '',
      rota: vendedores ? rotaDe(p, vendedores) : (p.rota || ''),
      vendedor: p.vendedor || '',
      valor: Number(p.valorTotal) || 0,
      origem: origemDaBaixa(p),
      // "quando ficou pronto": o lançamento, se houve; senão a entrada em expedido
      quando: lancado ? (lanc.em || '') : (desde.iso || ''),
      aproximado: !lancado && !desde.exato,
      lancadoEm: lanc.em || '',
      lancadoPor: lanc.por || '',
      // E4: de onde o escritório puxou (null = lançamento antigo, sem detalhe)
      puxou: Array.isArray(lanc.puxou) ? lanc.puxou : null,
      saidaEm: saiu ? p.saidaEm : '',
      motorista: saiu ? (p.saidaMotorista || '') : (lanc.motorista || ''),
      itens: prontos.length,
      itensTotal: (p.itens || []).length,
      parcial: prontos.length < (p.itens || []).length,   // parte ainda na fábrica
      remessas: Number(p.remessas) || 0,                   // entregas parciais já feitas
      // onde está o RESTO, quando parte continua na fábrica
      fase: prontos.length < (p.itens || []).length ? faseDoPedido(p, itensCad) : [],
      previsao: p.previsao || '',
      docId: p.id || String(p.idVenda ?? ''),
    })
  }
  for (const l of linhas) l.mes = mesDe(l.quando)
  // na rua e pronto primeiro (o mais recente no topo); em produção depois, pela
  // previsão de entrega (o mais urgente no topo)
  const emProducao = (l) => (l.situacao === SITUACAO_CONTROLE.PRODUCAO ? 1 : 0)
  return linhas
    .filter((l) => !situacao || l.situacao === situacao)
    .filter((l) => !origem || l.origem === origem)
    .sort((a, b) => emProducao(a) - emProducao(b)
      || (emProducao(a)
        ? (a.previsao || '9999').localeCompare(b.previsao || '9999')
        : (b.quando || '').localeCompare(a.quando || ''))
      || a.idVenda.localeCompare(b.idVenda, undefined, { numeric: true }))
}

// meses que existem nas linhas, do mais novo para o mais velho
export const mesesDoControle = (linhas) =>
  [...new Set((linhas || []).map((l) => l.mes).filter(Boolean))].sort().reverse()

// totais da lista (valor só para quem vê valor — a tela decide se mostra)
export function totaisDoControle(linhas) {
  const t = { linhas: 0, sera: 0, pronto: 0, voltou: 0, producao: 0, valor: 0, escritorio: 0 }
  for (const l of linhas || []) {
    t.linhas++
    t[l.situacao] = (t[l.situacao] || 0) + 1
    t.valor += l.valor || 0
    if (l.origem === ORIGEM_BAIXA.ESCRITORIO) t.escritorio++
  }
  return t
}

// O aviso "já foi entregue" do vendedor é respondido pelo LANÇAMENTO: quando o
// escritório lança o pedido, o aviso aberto fecha no mesmo batch (Fase C).
// Devolve os campos do `updateDoc` em `problemas/{id}`. ⚠️ A rule de
// `problemas` só aceita update de STAFF — a expedição lança, mas o aviso dela
// fica aberto (fechar no mesmo batch derrubaria o lançamento inteiro).
export const avisosEntregaAbertos = (lista) =>
  (lista || []).filter((x) => x?.status === 'aberto' && ehErroEntrega(x.campo))
export function fechaAvisoPeloLancamento(motorista, quem, agora) {
  return {
    status: 'resolvido',
    resolucao: `Lançado no Controle de entrega: finalizado e saiu${motorista ? ` com ${motorista}` : ''}`,
    resolvidoPor: quem?.executorNome || quem?.porNome || '',
    resolvidoEm: agora || new Date().toISOString(),
  }
}
export const podeFecharAviso = (perfil) => ['dono', 'designer', 'financeiro'].includes(perfil)

// ---------- FASE D: baixas do ESCRITÓRIO por setor × mês ----------
// É o número que ataca a CAUSA: cada registro de auditoria com
// `origem: 'escritorio'` é um item que a fábrica não baixou e o escritório
// teve que tirar de algum setor (`de`). Agrupado por setor (a montagem quebra
// por material, como no chão de fábrica) e por mês do lançamento.
// Quantidade sai POR MATERIAL — kg e unidade não somam.
export function resumoBaixasEscritorio(regs, { mes } = {}) {
  const lista = (regs || []).filter((r) => r?.origem === ORIGEM_BAIXA.ESCRITORIO)
  const meses = [...new Set(lista.map((r) => mesDe(r.quando)).filter(Boolean))].sort().reverse()
  const doMes = mes ? lista.filter((r) => mesDe(r.quando) === mes) : lista
  const map = new Map()
  const pedidosTotal = new Set()
  let semPesagem = 0
  for (const r of doMes) {
    const chave = r.de === 'montagem' ? `montagem|${montagemDoMaterial(r.material)}` : (r.de || '?')
    const g = map.get(chave) || {
      chave, etapa: r.de || '', onde: ondeProcurar(r.de, r.material),
      itens: 0, pedidos: new Set(), porMaterial: {}, semPesagem: 0,
    }
    g.itens++
    g.pedidos.add(String(r.idVenda ?? ''))
    pedidosTotal.add(String(r.idVenda ?? ''))
    const mat = r.material || SEM_MATERIAL
    g.porMaterial[mat] = arredondaQtd((g.porMaterial[mat] || 0) + (Number(r.qtd) || 0))
    if (r.semPesagem) { g.semPesagem++; semPesagem++ }
    map.set(chave, g)
  }
  const setores = [...map.values()]
    .map((g) => ({ ...g, pedidos: g.pedidos.size }))
    .sort((a, b) => b.itens - a.itens || ordemEtapaLocal(a.etapa) - ordemEtapaLocal(b.etapa))
  return {
    meses,
    mes: mes || '',
    setores,
    totais: { itens: doMes.length, pedidos: pedidosTotal.size, semPesagem },
  }
}
// "300 un papel · 20 kg plástico" — nunca soma materiais diferentes
export const fmtPorMaterial = (porMaterial) =>
  Object.entries(porMaterial || {})
    .map(([m, q]) => `${fmtQtd(q)} ${unidadeDoMaterial(m) || ''} ${nomeDoMaterial(m) || 'sem material'}`.replace(/\s+/g, ' ').trim())
    .join(' · ')

// ============================================================
// ENTREGUES FATIADA (07/10/2026 — correção 4 da leitura de lentidão)
// `entregues` é histórico e só cresce; cinco telas assinavam a coleção INTEIRA.
// Agora cada tela pede só a fatia que mostra: um período (`entregueEm >=`) e/ou
// as remessas de UM número. Helpers puros aqui; o hook está em
// src/hooks/useEntregues.js.
// ============================================================
export const PERIODOS_ENTREGUES = [
  { id: '30', nome: 'Últimos 30 dias', dias: 30 },
  { id: '90', nome: 'Últimos 90 dias', dias: 90 },
  { id: '365', nome: 'Último ano', dias: 365 },
  { id: 'tudo', nome: 'Todo o histórico', dias: 0 },   // 0 = sem corte
]
export const PERIODO_ENTREGUES_PADRAO = '90'

// ISO do corte de um período (N dias para trás). `entregueEm` é ISO string,
// então a comparação lexicográfica do Firestore é a cronológica.
export function corteDoPeriodo(dias, agora = new Date()) {
  const n = Number(dias)
  if (!(n > 0)) return ''
  return new Date(agora.getTime() - n * MS_DIA).toISOString()
}

// Faixa de PREFIXO para achar as remessas de um número no servidor: o doc novo é
// "5111-1" (e tem campo idVenda "5111"), o antigo é "5111" sem campo. Prefixo,
// não substring: o Firestore não faz "contém"; quem digita o número digita do
// começo. Só dígitos e pelo menos 2 — menos que isso varre a coleção inteira.
export function faixaPrefixoNumero(numero) {
  const s = String(numero ?? '').trim()
  if (!/^\d{2,}$/.test(s)) return null
  return [s, s + '']
}

// junta as fatias (período, por número…) sem repetir documento
export function uneEntregues(...fatias) {
  const m = new Map()
  for (const arr of fatias) for (const e of arr || []) if (e?.id) m.set(e.id, e)
  return [...m.values()]
}

// ============================================================
// CLIENTES EM COLEÇÃO PRÓPRIA (07/10/2026 — correção 5 da leitura de lentidão)
// O de/para de clientes vivia num ARRAY dentro de config/cadastros, junto com
// vendedores, itens e motoristas: todo apelido salvo reenviava o documento
// inteiro a todo aparelho conectado, a captura automática do import só o fazia
// crescer, e o teto de 1 MiB por documento era uma parede à frente. Agora cada
// cliente é um doc em `clientes/{idCliente(razao)}`; o array antigo continua
// sendo LIDO (mesclado, perdendo para a coleção) até a migração pela tela de
// Cadastros apagar o campo. Nenhuma tela precisa saber de onde veio.
// ============================================================

// id do doc = razão social normalizada (é a chave que `achaCliente` sempre
// usou). `/` não pode em id do Firestore; tamanho cortado por segurança.
export function idCliente(razao) {
  const n = normaliza(razao).replace(/\//g, '_').slice(0, 400)
  if (!n || n === '.' || n === '..' || /^__.*__$/.test(n)) return null
  return n
}

// o que vai para o documento: só os campos do cliente (sem `id`/`_legado`)
export function dadosCliente(c) {
  const { id, _legado, ...resto } = c || {}
  return { ...resto, razao: String(c?.razao || '').trim(), nome: String(c?.nome || '').trim() }
}

// coleção + array antigo, sem repetir: a COLEÇÃO ganha (pode ter apelido mais
// novo); quem só existe no array sai marcado `_legado` — é o que a tela de
// Cadastros usa para saber que ainda há o que migrar e para apagar no lugar
// certo. Ordem: por nome de exibição (ou razão), para a lista ser legível.
export function mesclaClientes(colecao, legado) {
  const m = new Map()
  for (const c of colecao || []) {
    const k = idCliente(c?.razao)
    if (k && !m.has(k)) m.set(k, c)
  }
  for (const c of legado || []) {
    const k = idCliente(c?.razao)
    if (k && !m.has(k)) m.set(k, { ...c, _legado: true })
  }
  return [...m.values()].sort((a, b) =>
    normaliza(a.nome || a.razao).localeCompare(normaliza(b.nome || b.razao)))
}

// o que falta copiar do array antigo para a coleção (o que já está lá ganha)
export function clientesParaMigrar(colecao, legado) {
  const ja = new Set((colecao || []).map((c) => idCliente(c?.razao)).filter(Boolean))
  const out = new Map()
  for (const c of legado || []) {
    const k = idCliente(c?.razao)
    if (k && !ja.has(k) && !out.has(k)) out.set(k, dadosCliente(c))
  }
  return [...out.entries()].map(([id, dados]) => ({ id, dados }))
}

// ============================================================
// AVISO AO CLIENTE PELO ESMERO (07/10/2026)
// Quando o escritório LANÇA o pedido no Controle de entrega (finalizado e saiu),
// o JC pede ao Esmero — o CRM/WhatsApp da Totali — que avise o cliente. Quem
// fala com o cliente é o Esmero (a mensagem fica na conversa, onde a vendedora
// vê); daqui sai só o pedido do aviso, com o texto pronto. Configuração em
// `config/esmero` = { url, ativo, textoSaida }. O resultado fica no pedido em
// `whatsSaida` = { status, em, por, detalhe, cliente, numero, texto } — é o chip
// da tela e o que permite "Reenviar". Helpers puros aqui; a chamada HTTP está
// em src/lib/esmero.js.
// ============================================================
export const EVENTO_AVISO_SAIDA = 'saiu_para_entrega'
export const STATUS_WHATS = { ENVIADO: 'enviado', ERRO: 'erro', DESLIGADO: 'desligado' }
export const TEXTO_AVISO_SAIDA_PADRAO =
  'Olá, {cliente}! Aqui é da JC Sacolas. Seu pedido {pedido} saiu para entrega{motorista}. Qualquer dúvida, é só responder esta mensagem.'

// Preenche o modelo: {cliente} (apelido ou razão), {pedido} (nº), {motorista}
// (" com Fulano" — some, com o espaço, quando não há), {cidade}. Chave que o
// modelo não conhece fica como está, para a pessoa ver que digitou errado.
export function textoAvisoSaida(modelo, { cliente, pedido, motorista, cidade } = {}) {
  const m = String(modelo || TEXTO_AVISO_SAIDA_PADRAO)
  return m
    .replace(/\{cliente\}/g, String(cliente || '').trim() || 'cliente')
    .replace(/\{pedido\}/g, pedido != null ? `#${String(pedido).trim()}` : '')
    .replace(/\{motorista\}/g, motorista ? ` com ${String(motorista).trim()}` : '')
    .replace(/\{cidade\}/g, String(cidade || '').trim())
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

// O que vai para o Esmero no lançamento. `telefone` sai do cadastro de clientes
// do JC quando existe (é o casamento mais seguro); sem ele o Esmero casa pela
// razão social. Devolve null quando a integração está desligada ou sem URL.
export function montaAvisoSaida(p, { motorista, clientes, cfg } = {}) {
  if (!cfg?.ativo || !String(cfg.url || '').trim()) return null
  if (!p?.idVenda) return null
  const c = achaCliente(p.cliente, clientes)
  return {
    url: String(cfg.url).trim().replace(/\/+$/, ''),
    corpo: {
      evento: EVENTO_AVISO_SAIDA,
      pedido: {
        numero: String(p.idVenda),
        cliente: String(p.cliente || '').trim(),
        cidade: String(p.cidade || '').trim() || null,
        motorista: String(motorista || '').trim() || null,
        telefone: String(c?.telefone || '').trim() || null,
      },
      texto: textoAvisoSaida(cfg.textoSaida, {
        cliente: nomeCliente(p.cliente, clientes), pedido: p.idVenda, motorista, cidade: p.cidade,
      }),
    },
  }
}

// Traduz a resposta do Esmero (ou a falha de rede) no registro `whatsSaida`.
// `motivo` é o código do Esmero; `detalhe` é a frase para a tela.
const MOTIVO_WHATS = {
  cliente_nao_encontrado: 'cliente não encontrado no Esmero (confira a razão social lá)',
  cliente_sem_telefone: 'cliente sem telefone no Esmero',
  sem_numero: 'nenhum número de WhatsApp do Esmero está conectado',
  falhou_envio: 'o WhatsApp não aceitou a mensagem',
}
export function registroWhatsSaida(resposta, { quem, texto, agora } = {}) {
  const em = agora || new Date().toISOString()
  const por = quem?.executorNome || quem?.porNome || quem?.nome || ''
  if (resposta?.ok) {
    return {
      status: STATUS_WHATS.ENVIADO, em, por, texto: texto || '',
      cliente: resposta.cliente?.nome || '', telefone: resposta.cliente?.telefone || '',
      numero: resposta.numero || '', mensagemId: resposta.mensagemId || '',
    }
  }
  const motivo = resposta?.motivo || resposta?.erro || 'erro'
  return {
    status: STATUS_WHATS.ERRO, em, por, texto: texto || '',
    motivo: String(motivo),
    detalhe: MOTIVO_WHATS[motivo] || String(resposta?.detalhe || resposta?.erro || 'não foi possível avisar'),
  }
}

// Frase curta do chip no Controle/Localizar
export function resumoWhatsSaida(w) {
  if (!w?.status) return ''
  if (w.status === STATUS_WHATS.ENVIADO) return `WhatsApp enviado${w.cliente ? ` para ${w.cliente}` : ''}${w.numero ? ` pelo ${w.numero}` : ''}`
  return `WhatsApp não enviado: ${w.detalhe || w.motivo || 'erro'}`
}
