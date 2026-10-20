// CHEQUES — a regra de origem, situação e destino de cada folha (20/10/2026).
// Desenho completo e o porquê de cada decisão: CHEQUES.md
//
// ⚠️ ESTE ARQUIVO É PORTÁTIL. Ele serve ao JC (Firestore + React) e vai ser
// copiado para o TotaliFinance (Express + Prisma). Por isso:
//   - NÃO importa nada: nem Firebase, nem React, nem `utils.js`;
//   - datas entram e saem como texto ISO ('2026-10-20' ou ISO completo);
//   - valores são número em reais, arredondados em CENTAVOS inteiros;
//   - quem grava é a tela: aqui só se calcula, valida e monta o objeto.
// Quem precisar de algo do JC (apelido de cliente, busca por nome parecido)
// INJETA a função — ver `filtraCheques`.
//
// O que é gravado e o que é derivado:
//   gravado  = a folha, a origem, o `historico` (só cresce) e a cópia da
//              situação atual (`situacao`), que existe para o servidor filtrar;
//   derivado = quantas vezes voltou, se pode reapresentar, se veio de repasse,
//              há quantos dias está depositado, os totais. Nada disso é campo:
//              total desnormalizado diverge em silêncio.

// ============================================================
// AS SITUAÇÕES
// ============================================================
export const SITUACOES_CHEQUE = {
  carteira: { nm: 'Em carteira', desc: 'Está na gaveta da empresa' },
  depositado: { nm: 'Depositado', desc: 'Foi ao banco, esperando compensar' },
  compensado: { nm: 'Compensado', desc: 'O dinheiro caiu na conta' },
  devolvido: { nm: 'Devolvido', desc: 'O banco ou o fornecedor devolveu' },
  repassado: { nm: 'Repassado', desc: 'Foi entregue a um fornecedor' },
  resgatado: { nm: 'Resgatado', desc: 'O cliente pagou de outro jeito e levou a folha' },
  cancelado: { nm: 'Cancelado', desc: 'Lançado errado' },
}
export const nomeSituacao = (st) => SITUACOES_CHEQUE[st]?.nm || st || '—'

// As que alguém ainda tem que mexer. É por elas que a tela assina a coleção
// (`where('situacao', 'in', SITUACOES_VIVAS)`): o resto é arquivo e só é lido
// quando alguém procura.
export const SITUACOES_VIVAS = ['carteira', 'depositado', 'devolvido']
export const ehViva = (st) => SITUACOES_VIVAS.includes(st)

// Para onde cada situação pode ir. O CANCELAMENTO fica fora da tabela porque
// vale de qualquer lugar (ver `podeIr`): um lançamento errado pode ser
// descoberto depois que a folha já "foi ao banco" no sistema.
// ⚠️ `compensado → devolvido` existe de propósito: o banco devolve cheque já
// creditado (fraude, assinatura), e sem esse caminho o sistema diria que o
// dinheiro está na conta quando não está.
export const TRANSICOES_CHEQUE = {
  carteira: ['depositado', 'repassado', 'resgatado'],
  depositado: ['compensado', 'devolvido'],
  compensado: ['devolvido'],
  devolvido: ['depositado', 'carteira', 'repassado', 'resgatado'],
  repassado: ['devolvido'],
  resgatado: [],
  cancelado: [],
}

// os nomes das AÇÕES, que não são o nome da situação de destino:
// devolvido → depositado é "reapresentar", não "depositar"
export function nomeAcao(de, para) {
  if (para === 'depositado') return de === 'devolvido' ? 'Reapresentar' : 'Depositar'
  if (para === 'carteira') return 'Voltou para a gaveta'
  return {
    compensado: 'Compensado', devolvido: de === 'repassado' ? 'Voltou do fornecedor' : 'Devolvido',
    repassado: 'Repassar', resgatado: 'Resgatado', cancelado: 'Cancelar',
  }[para] || para
}

// ============================================================
// ALÍNEAS — o motivo oficial da devolução (regras da compensação do BACEN)
// ============================================================
// `reapresenta` diz se a MESMA folha pode voltar ao banco depois daquela
// devolução. ⚠️ Depois da alínea 12 (sem fundos na 2ª) não pode: o banco não
// aceita mais, e o caminho passa a ser resgatar com o cliente ou protestar.
export const ALINEAS = [
  { id: '11', nm: 'Sem fundos — 1ª apresentação', semFundos: true, reapresenta: true },
  { id: '12', nm: 'Sem fundos — 2ª apresentação', semFundos: true, reapresenta: false },
  { id: '13', nm: 'Conta encerrada', reapresenta: false },
  { id: '14', nm: 'Prática espúria', reapresenta: false },
  { id: '20', nm: 'Folha cancelada pelo correntista', reapresenta: false },
  { id: '21', nm: 'Sustação / contra-ordem', reapresenta: false },
  { id: '22', nm: 'Divergência ou falta de assinatura', reapresenta: true },
  { id: '25', nm: 'Talonário cancelado pelo banco', reapresenta: false },
  { id: '28', nm: 'Sustado por furto ou roubo', reapresenta: false },
  { id: '31', nm: 'Erro formal de preenchimento', reapresenta: true },
  { id: '35', nm: 'Cheque fraudado', reapresenta: false },
  { id: '44', nm: 'Cheque prescrito', reapresenta: false },
  { id: '48', nm: 'Acima de R$ 100 sem beneficiário', reapresenta: true },
  { id: '49', nm: 'Remessa nula', reapresenta: true },
  // 'outra' não trava: quem sabe o motivo é a pessoa, e ela escreve
  { id: 'outra', nm: 'Outro motivo', reapresenta: true },
]
export const alinea = (id) => ALINEAS.find((a) => a.id === String(id || ''))
export const nomeAlinea = (id) => {
  const a = alinea(id)
  return a ? (a.id === 'outra' ? a.nm : `${a.id} · ${a.nm}`) : ''
}

// ============================================================
// BANCOS (código COMPE)
// ============================================================
// Lista curta dos que aparecem por aqui; banco fora dela entra digitado.
export const BANCOS = [
  { codigo: '001', nome: 'Banco do Brasil' },
  { codigo: '003', nome: 'Banco da Amazônia' },
  { codigo: '004', nome: 'Banco do Nordeste' },
  { codigo: '033', nome: 'Santander' },
  { codigo: '041', nome: 'Banrisul' },
  { codigo: '047', nome: 'Banese' },
  { codigo: '070', nome: 'BRB' },
  { codigo: '077', nome: 'Inter' },
  { codigo: '085', nome: 'Ailos' },
  { codigo: '104', nome: 'Caixa Econômica' },
  { codigo: '133', nome: 'Cresol' },
  { codigo: '136', nome: 'Unicred' },
  { codigo: '237', nome: 'Bradesco' },
  { codigo: '260', nome: 'Nubank' },
  { codigo: '290', nome: 'PagBank' },
  { codigo: '323', nome: 'Mercado Pago' },
  { codigo: '336', nome: 'C6 Bank' },
  { codigo: '341', nome: 'Itaú' },
  { codigo: '389', nome: 'Mercantil do Brasil' },
  { codigo: '422', nome: 'Safra' },
  { codigo: '748', nome: 'Sicredi' },
  { codigo: '756', nome: 'Sicoob' },
]
// '47', '047' e '0047' são o mesmo banco: a Zeus mostra sem o zero
export function nomeBanco(codigo) {
  const c = semZeros(codigo)
  return BANCOS.find((b) => semZeros(b.codigo) === c)?.nome || ''
}

// ============================================================
// PEQUENOS AUXILIARES (locais de propósito: o arquivo não importa nada)
// ============================================================
const soDigitos = (v) => String(v ?? '').replace(/\D/g, '')
// '' continua '' (campo vazio); '000' vira '0' (o número zero existe)
const semZeros = (v) => {
  const d = soDigitos(v)
  return d ? d.replace(/^0+(?=\d)/, '') : ''
}
export const centavos = (v) => Math.round((Number(v) || 0) * 100)
export const arredondaReais = (v) => centavos(v) / 100

// texto em MAIÚSCULAS, sem acento e com espaço único — para comparar nomes
export function normalizaTexto(txt) {
  if (!txt && txt !== 0) return ''
  return String(txt).trim().toUpperCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')
}

// ---------- DATAS ----------
// ⚠️ 'YYYY-MM-DD' passado ao `new Date()` é lido como UTC: em UTC-3 vira o dia
// ANTERIOR. Aqui a data é sempre montada pelas PARTES locais.
export function diaDe(v) {
  if (!v) return ''
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.slice(0, 10)) && v.length <= 10) return v
  const d = v instanceof Date ? v : new Date(v)
  if (isNaN(d)) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function partes(iso) {
  const [a, m, d] = String(iso || '').slice(0, 10).split('-').map(Number)
  return a && m && d ? { a, m, d } : null
}
const ultimoDiaDoMes = (a, m) => new Date(a, m, 0).getDate()   // m em 1..12
const montaISO = (a, m, d) =>
  `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

export function somaDias(iso, dias) {
  const p = partes(iso)
  if (!p) return ''
  const dt = new Date(p.a, p.m - 1, p.d + (Number(dias) || 0))
  return montaISO(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
}

// N meses depois, mirando sempre o DIA da data base.
// ⚠️ É calculado a partir da PRIMEIRA data, nunca da anterior: "todo dia 31"
// passa por fevereiro como 28/29 e volta a 31 em março. Encadeando, o 31 viraria
// 28 para sempre depois do primeiro fevereiro.
export function somaMeses(iso, meses) {
  const p = partes(iso)
  if (!p) return ''
  const total = (p.m - 1) + (Number(meses) || 0)
  const a = p.a + Math.floor(total / 12)
  const m = ((total % 12) + 12) % 12 + 1
  return montaISO(a, m, Math.min(p.d, ultimoDiaDoMes(a, m)))
}

export function diasEntre(de, ate) {
  const a = partes(de); const b = partes(ate)
  if (!a || !b) return 0
  return Math.round((new Date(b.a, b.m - 1, b.d) - new Date(a.a, a.m - 1, a.d)) / 86400000)
}

// ---------- CPF / CNPJ ----------
// Confere os dígitos verificadores: é o erro de digitação mais comum, e é
// por esse documento que se acha o emitente quando o cheque volta.
export function docValido(doc) {
  const d = soDigitos(doc)
  if (d.length === 11) return cpfValido(d)
  if (d.length === 14) return cnpjValido(d)
  return false
}
function cpfValido(d) {
  if (/^(\d)\1+$/.test(d)) return false
  const dv = (n) => {
    let s = 0
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}
function cnpjValido(d) {
  if (/^(\d)\1+$/.test(d)) return false
  const dv = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const s = pesos.reduce((acc, p, i) => acc + Number(d[i]) * p, 0)
    const r = s % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13])
}
export function fmtDoc(doc) {
  const d = soDigitos(doc)
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return String(doc || '')
}

// ============================================================
// A CHAVE DA FOLHA: banco + agência + conta + número
// ============================================================
// ⚠️ O número sozinho REPETE entre clientes — a Localização da Zeus mostrou o
// 47470 em dois clientes e o 47478 em três. A identidade é a folha inteira,
// normalizada: só dígitos e sem zero à esquerda (047 = 47, 0036 = 36,
// 03/100.483-1 = 31004831).
// Faltando qualquer pedaço a chave é '' — e chave vazia não acusa repetição
// com ninguém: comparar meia chave diria que folhas diferentes são a mesma.
export function chaveCheque(f) {
  const banco = semZeros(f?.banco?.codigo ?? f?.banco)
  const ag = semZeros(f?.agencia)
  const conta = semZeros(f?.conta)
  const num = semZeros(f?.numero)
  if (!banco || !ag || !conta || !num) return ''
  return `${banco}|${ag}|${conta}|${num}`
}

// o número na forma de comparar (sem zeros à esquerda)
export const numeroNormal = (n) => semZeros(n)

// ============================================================
// LANÇAR EM LOTE — as folhas de um parcelamento
// ============================================================
// O próximo número da sequência, PRESERVANDO os zeros: 000123 → 000124.
// Número que não termina em dígito não tem sequência — devolve vazio e a
// pessoa digita (melhor pedir do que inventar).
export function numeroSeguinte(inicial, passos = 1) {
  const txt = String(inicial ?? '').trim()
  const m = txt.match(/^(.*?)(\d+)$/)
  if (!m) return ''
  const [, prefixo, digitos] = m
  const n = BigInt(digitos) + BigInt(Number(passos) || 0)
  return prefixo + n.toString().padStart(digitos.length, '0')
}

// A divisão do total em N folhas. A sobra dos centavos vai na PRIMEIRA, como em
// `geraParcelas` do Financeiro: 1.000,00 em 3 = 333,34 + 333,33 + 333,33, e o
// lote fecha. Dividido por igual, sobraria um centavo que ninguém acha.
export function divideValor(total, quantas) {
  const qtd = Math.max(1, Math.floor(Number(quantas) || 1))
  const cents = centavos(total)
  const base = Math.floor(cents / qtd)
  const resto = cents - base * qtd
  return Array.from({ length: qtd }, (_, i) => (base + (i === 0 ? resto : 0)) / 100)
}

// As datas "bom para" das N folhas.
//   { tipo: 'dias', dias: 30 } → 1ª, 1ª+30, 1ª+60…
//   { tipo: 'mes' }            → todo mês no mesmo dia da 1ª (fim de mês ajusta)
export function datasDoLote(primeira, quantas, intervalo = { tipo: 'dias', dias: 30 }) {
  const qtd = Math.max(1, Math.floor(Number(quantas) || 1))
  if (!partes(primeira)) return Array(qtd).fill('')
  return Array.from({ length: qtd }, (_, i) =>
    intervalo?.tipo === 'mes'
      ? somaMeses(primeira, i)
      : somaDias(primeira, i * (Number(intervalo?.dias) || 0)))
}

// Gera as linhas do lote a partir do que a pessoa digitou. Cada linha sai
// EDITÁVEL na tela — número que pula, valor diferente, uma folha de outro
// emitente no meio. Isto é conta sobre o que foi digitado, não chute: não é o
// atalho que preenche quantidade que ninguém conferiu.
//   valor: { modo: 'total'|'folha', valor }
export function geraFolhas({ quantas, valor, primeiroBomPara, intervalo, numeroInicial, base = {} }) {
  const qtd = Math.max(1, Math.floor(Number(quantas) || 1))
  const valores = valor?.modo === 'total'
    ? divideValor(valor.valor, qtd)
    : Array(qtd).fill(arredondaReais(valor?.valor))
  const datas = datasDoLote(primeiroBomPara, qtd, intervalo)
  return Array.from({ length: qtd }, (_, i) => ({
    ...folhaBase(base),
    loteN: i + 1,
    loteTotal: qtd,
    numero: numeroInicial ? numeroSeguinte(numeroInicial, i) : '',
    valor: valores[i],
    bomPara: datas[i],
  }))
}

// os campos do PAPEL (o que vem igual para todas as folhas do mesmo talão)
function folhaBase(b) {
  return {
    banco: { codigo: String(b?.banco?.codigo ?? b?.banco ?? ''), nome: b?.banco?.nome || nomeBanco(b?.banco?.codigo ?? b?.banco) },
    agencia: String(b?.agencia ?? ''),
    conta: String(b?.conta ?? ''),
    emitente: { nome: String(b?.emitente?.nome ?? ''), doc: String(b?.emitente?.doc ?? '') },
    terceiro: !!b?.terceiro,
  }
}

export const somaFolhas = (folhas) =>
  (folhas || []).reduce((s, f) => s + centavos(f.valor), 0) / 100

// O que está errado numa folha. Lista de { campo, msg } — vazia = pode gravar.
export function problemasDaFolha(f) {
  const p = []
  if (!semZeros(f?.banco?.codigo ?? f?.banco)) p.push({ campo: 'banco', msg: 'falta o banco' })
  if (!soDigitos(f?.agencia)) p.push({ campo: 'agencia', msg: 'falta a agência' })
  if (!soDigitos(f?.conta)) p.push({ campo: 'conta', msg: 'falta a conta' })
  if (!soDigitos(f?.numero)) p.push({ campo: 'numero', msg: 'falta o número do cheque' })
  if (!(centavos(f?.valor) > 0)) p.push({ campo: 'valor', msg: 'valor tem que ser maior que zero' })
  if (!partes(f?.bomPara)) p.push({ campo: 'bomPara', msg: 'falta a data (bom para)' })
  if (!String(f?.emitente?.nome || '').trim()) p.push({ campo: 'emitente', msg: 'falta o nome do emitente' })
  // o documento é opcional (cheque antigo lançado à mão pode não ter), mas o
  // que for digitado tem que estar certo
  if (soDigitos(f?.emitente?.doc) && !docValido(f.emitente.doc)) {
    p.push({ campo: 'doc', msg: 'CPF/CNPJ do emitente com dígito errado' })
  }
  return p
}

// Folhas que repetem a chave — DENTRO do lote ou de algum cheque já gravado.
// Devolve { [índice]: [{ origem: 'lote'|'existente', indice?|cheque? }] }.
// ⚠️ AVISA, não bloqueia: a mesma folha pode voltar legitimamente (cancelada e
// relançada), e quem decide é a pessoa com o papel na mão. Cheque CANCELADO não
// acusa: lançar de novo depois de cancelar é exatamente o caminho de correção.
export function repetidasNoLote(folhas, existentes = []) {
  const porChave = new Map()
  for (const c of existentes) {
    if (c?.situacao === 'cancelado') continue
    const ch = c?.chave || chaveCheque(c)
    if (!ch) continue
    if (!porChave.has(ch)) porChave.set(ch, [])
    porChave.get(ch).push(c)
  }
  const fora = {}
  const vistos = new Map()
  ;(folhas || []).forEach((f, i) => {
    const ch = chaveCheque(f)
    if (!ch) return
    const achados = []
    if (vistos.has(ch)) achados.push({ origem: 'lote', indice: vistos.get(ch) })
    else vistos.set(ch, i)
    for (const c of porChave.get(ch) || []) achados.push({ origem: 'existente', cheque: c })
    if (achados.length) fora[i] = achados
  })
  return fora
}

// O cabeçalho do lote. `hoje` entra de fora para o teste não depender do relógio.
export function problemasDoCabecalho(cab, hoje) {
  const p = []
  if (!cab?.empresa) p.push({ campo: 'empresa', msg: 'escolha a empresa que recebeu' })
  if (!String(cab?.cliente || '').trim()) p.push({ campo: 'cliente', msg: 'falta o cliente que entregou o cheque' })
  if (!partes(cab?.recebidoEm)) p.push({ campo: 'recebidoEm', msg: 'falta a data do recebimento' })
  else if (hoje && cab.recebidoEm > diaDe(hoje)) {
    p.push({ campo: 'recebidoEm', msg: 'a data do recebimento está no futuro' })
  }
  return p
}

// ============================================================
// OS EVENTOS — a vida do cheque
// ============================================================
// `cheque.historico` só cresce. Cada evento:
//   { n, em, data, por, porUid, de, para, ...campos do destino, obs }
//   em   = quando foi REGISTRADO (ISO completo, relógio de quem lançou)
//   data = quando ACONTECEU (o dia do depósito, do extrato, do repasse) —
//          pode ser no passado: o financeiro registra hoje o que o extrato
//          mostrou ontem, e o cheque antigo da Zeus entra com a data dele.

export const historicoDe = (c) => (Array.isArray(c?.historico) ? c.historico : [])

// A verdade é o histórico; `situacao` é a cópia gravada para o servidor
// filtrar. `situacaoBate` é a conferência que a tela faz — se divergir, a tela
// mostra o histórico e avisa, em vez de escolher um dos dois em silêncio.
export function situacaoPeloHistorico(c) {
  const h = historicoDe(c)
  for (let i = h.length - 1; i >= 0; i--) if (h[i]?.para) return h[i].para
  return ''
}
export const situacaoBate = (c) => !historicoDe(c).length || situacaoPeloHistorico(c) === c?.situacao

export const devolucoesDe = (c) => historicoDe(c).filter((e) => e?.para === 'devolvido')
export const ultimaDevolucao = (c) => devolucoesDe(c).slice(-1)[0] || null

// Pode a MESMA folha voltar ao banco? Olha TODAS as devoluções, inclusive as que
// aconteceram na mão do fornecedor: a apresentação conta para a folha, não para
// quem depositou. Duas devoluções por falta de fundos = acabou, mesmo que a
// segunda tenha sido marcada como 11 por engano.
export function podeReapresentar(c) {
  const devs = devolucoesDe(c)
  for (const d of devs) {
    const a = alinea(d.alinea)
    if (a && !a.reapresenta) {
      return { ok: false, motivo: `devolvido pela alínea ${nomeAlinea(a.id)}: o banco não aceita a mesma folha de novo` }
    }
  }
  const semFundos = devs.filter((d) => alinea(d.alinea)?.semFundos).length
  if (semFundos >= 2) {
    return { ok: false, motivo: 'já voltou duas vezes sem fundos: o banco não aceita a 3ª apresentação' }
  }
  return { ok: true, motivo: '' }
}

// Se o cheque está devolvido porque o FORNECEDOR trouxe de volta, devolve o
// destino do repasse — é a outra ponta: a JC voltou a dever a esse fornecedor.
export function devolvidoPeloFornecedor(c) {
  if (c?.situacao !== 'devolvido') return null
  const ult = ultimaDevolucao(c)
  if (!ult || ult.de !== 'repassado') return null
  const rep = historicoDe(c).filter((e) => e?.para === 'repassado').slice(-1)[0]
  return rep ? { fornecedorId: rep.fornecedorId || '', fornecedorNome: rep.fornecedorNome || '', data: rep.data || '' } : null
}

// A transição em si. O cancelamento vale de qualquer situação viva ou não
// (menos de cancelado): o lançamento errado pode ser descoberto tarde.
export function podeIr(c, para) {
  const de = c?.situacao || ''
  if (!SITUACOES_CHEQUE[para]) return { ok: false, motivo: 'situação desconhecida' }
  if (para === 'cancelado') {
    return de === 'cancelado' ? { ok: false, motivo: 'já está cancelado' } : { ok: true, motivo: '' }
  }
  if (!(TRANSICOES_CHEQUE[de] || []).includes(para)) {
    return { ok: false, motivo: `de "${nomeSituacao(de)}" não dá para ir para "${nomeSituacao(para)}"` }
  }
  // voltar ao banco depende das devoluções — e vale também para quem passou
  // pela gaveta antes (devolvido → carteira → depositado), senão a gaveta
  // virava um atalho para reapresentar o que não pode
  if (para === 'depositado' && devolucoesDe(c).length) {
    const r = podeReapresentar(c)
    if (!r.ok) return r
  }
  return { ok: true, motivo: '' }
}

// O que cada destino exige. Lista de { campo, msg }.
export function problemasDoEvento(c, ev) {
  const p = []
  const para = ev?.para
  const pode = podeIr(c, para)
  if (!pode.ok) p.push({ campo: 'para', msg: pode.motivo })
  if (!partes(ev?.data)) p.push({ campo: 'data', msg: 'falta a data' })
  if (!ev?.porUid) p.push({ campo: 'porUid', msg: 'falta quem registrou' })
  if (para === 'depositado' && !ev?.conta) p.push({ campo: 'conta', msg: 'escolha a conta do depósito' })
  if (para === 'devolvido') {
    if (!alinea(ev?.alinea)) p.push({ campo: 'alinea', msg: 'escolha o motivo da devolução (alínea)' })
    else if (ev.alinea === 'outra' && !String(ev?.obs || '').trim()) {
      p.push({ campo: 'obs', msg: 'escreva o motivo da devolução' })
    }
  }
  if (para === 'repassado') {
    if (!ev?.fornecedorId && !String(ev?.fornecedorNome || '').trim()) {
      p.push({ campo: 'fornecedor', msg: 'escolha o fornecedor' })
    }
    if (!ev?.empresaPagadora) p.push({ campo: 'empresaPagadora', msg: 'diga qual empresa está pagando' })
  }
  // cancelar apaga o cheque de todas as listas: sem o porquê, ninguém entende
  // depois por que ele sumiu
  if (para === 'cancelado' && !String(ev?.obs || '').trim()) {
    p.push({ campo: 'obs', msg: 'escreva por que está cancelando' })
  }
  return p
}

// Avisos: a ação PODE seguir, mas a pessoa precisa saber. Lista de textos.
export function avisosDoEvento(c, ev, hoje) {
  const av = []
  const dia = diaDe(ev?.data || hoje)
  if (ev?.para === 'depositado' && c?.bomPara && dia && dia < c.bomPara) {
    // pré-datado depositado antes da data combinada é a reclamação mais comum
    // de cliente — e na Justiça vira indenização
    const n = diasEntre(dia, c.bomPara)
    av.push(`Este cheque é bom para ${fmtDiaCurto(c.bomPara)}: faltam ${n} dia(s). Depositar antes da data combinada pode gerar reclamação do cliente.`)
  }
  if (ev?.para === 'repassado') {
    const devs = devolucoesDe(c).length
    if (devs) av.push(`Esta folha já voltou ${devs} vez(es). O fornecedor vai receber um cheque que já foi devolvido.`)
    if (ev.empresaPagadora && c?.empresa && ev.empresaPagadora !== c.empresa) {
      av.push('Cheque recebido por uma empresa pagando conta da outra: fica marcado como ENTRE EMPRESAS para a contabilidade.')
    }
  }
  if ((ev?.para === 'depositado' || ev?.para === 'repassado') && c?.bomPara && dia) {
    // o cheque prescreve 6 meses depois do prazo de apresentação (30/60 dias);
    // passando de ~6 meses do bom para, o banco pode devolver pela alínea 44
    if (diasEntre(c.bomPara, dia) > 180) av.push('Passou de 6 meses da data do cheque: ele pode estar prescrito (alínea 44).')
  }
  return av
}

// Aplica o evento. Devolve { ok, problemas, avisos, patch, cheque }.
//   patch  = só os campos que mudam — é o que a tela manda no `updateDoc`;
//   cheque = o cheque inteiro já com a mudança (para a tela e os testes).
// Não aplica nada quando há problema: meia mudança gravada é pior que nenhuma.
export function aplicaEvento(c, ev, { agora, hoje } = {}) {
  const problemas = problemasDoEvento(c, ev)
  const avisos = problemas.length ? [] : avisosDoEvento(c, ev, hoje)
  if (problemas.length) return { ok: false, problemas, avisos, patch: null, cheque: c }
  const h = historicoDe(c)
  const evento = limpa({
    n: h.length + 1,
    em: agora || new Date().toISOString(),
    data: diaDe(ev.data),
    por: ev.por || '',
    porUid: ev.porUid,
    de: c.situacao || '',
    para: ev.para,
    conta: ev.para === 'depositado' ? ev.conta : undefined,
    alinea: ev.para === 'devolvido' ? String(ev.alinea) : undefined,
    // quem devolveu: o banco, ou o fornecedor que tinha recebido o cheque
    origemDevolucao: ev.para === 'devolvido' ? (c.situacao === 'repassado' ? 'fornecedor' : 'banco') : undefined,
    fornecedorId: ev.para === 'repassado' ? (ev.fornecedorId || '') : undefined,
    fornecedorNome: ev.para === 'repassado' ? String(ev.fornecedorNome || '').trim() : undefined,
    empresaPagadora: ev.para === 'repassado' ? ev.empresaPagadora : undefined,
    referencia: ev.para === 'repassado' ? String(ev.referencia || '').trim() : undefined,
    obs: String(ev.obs || '').trim() || undefined,
  })
  const patch = {
    situacao: ev.para,
    situacaoEm: evento.em,
    historico: [...h, evento],
  }
  // a conta do depósito acompanha o cheque enquanto ele está no banco; o
  // destino, enquanto está com o fornecedor. Fora disso ficam vazios, mas o
  // HISTÓRICO guarda todos os depósitos e repasses que já houve.
  if (ev.para === 'depositado') patch.contaDeposito = ev.conta
  else if (ev.para !== 'compensado' && ev.para !== 'devolvido') patch.contaDeposito = ''
  if (ev.para === 'repassado') {
    patch.destino = {
      fornecedorId: evento.fornecedorId, fornecedorNome: evento.fornecedorNome,
      empresaPagadora: evento.empresaPagadora, referencia: evento.referencia || '', data: evento.data,
    }
  } else if (ev.para !== 'devolvido') {
    patch.destino = null
  }
  // devolvido mantém `destino` e `contaDeposito`: são justamente o "de onde
  // voltou" que a fila de devolvidos precisa mostrar
  return { ok: true, problemas: [], avisos, patch, cheque: { ...c, ...patch } }
}

// Corrigir um dado digitado errado. Vira evento `corrigido` com o ANTES e o
// DEPOIS — editar em silêncio apagaria o que estava escrito, e é justamente o
// dado da folha que se confere quando o cheque volta.
export const CAMPOS_CORRIGIVEIS = [
  'banco', 'agencia', 'conta', 'numero', 'valor', 'bomPara', 'emitente', 'terceiro',
  'cliente', 'idVenda', 'recebidoEm', 'obs',
]
export function corrigeCheque(c, mudancas, { por, porUid, agora, obs } = {}) {
  const antes = {}; const depois = {}
  for (const campo of CAMPOS_CORRIGIVEIS) {
    if (!(campo in (mudancas || {}))) continue
    let v = mudancas[campo]
    if (campo === 'valor') v = arredondaReais(v)
    if (campo === 'banco') v = { codigo: String(v?.codigo ?? v ?? ''), nome: v?.nome || nomeBanco(v?.codigo ?? v) }
    if (JSON.stringify(v) === JSON.stringify(c?.[campo])) continue
    antes[campo] = c?.[campo] ?? null
    depois[campo] = v
  }
  if (!Object.keys(depois).length) return { ok: false, problemas: [{ campo: '', msg: 'nada mudou' }], patch: null, cheque: c }
  if (!porUid) return { ok: false, problemas: [{ campo: 'porUid', msg: 'falta quem registrou' }], patch: null, cheque: c }
  const novo = { ...c, ...depois }
  const problemas = problemasDaFolha(novo)
  if (problemas.length) return { ok: false, problemas, patch: null, cheque: c }
  const h = historicoDe(c)
  const em = agora || new Date().toISOString()
  const evento = limpa({
    n: h.length + 1, em, data: diaDe(em), por: por || '', porUid,
    // corrigir não muda a situação: de e para iguais
    de: c.situacao || '', para: c.situacao || '', tipo: 'corrigido', antes, depois,
    obs: String(obs || '').trim() || undefined,
  })
  const patch = { ...depois, chave: chaveCheque(novo), historico: [...h, evento] }
  return { ok: true, problemas: [], patch, cheque: { ...c, ...patch } }
}

// ============================================================
// O CHEQUE NOVO (o que a tela grava no lançamento)
// ============================================================
// cab = { empresa, cliente, idVenda, recebidoEm, obs, tardio, inicial? }
//   tardio  = o cheque já existia antes do sistema (veio da Zeus) — o evento
//             de entrada diz isso, senão parece que a JC recebeu aquilo hoje;
//   inicial = { para, conta?, alinea?, fornecedor..., data } — a situação em
//             que a folha JÁ ESTÁ (cheque antigo que já foi ao banco). Cada
//             folha pode trazer o seu próprio `inicial`.
// Devolve { ok, problemas: [{ indice, campo, msg }], cheques: [doc...] }.
// ⚠️ Tudo ou nada: com qualquer folha com problema, não devolve nenhuma — lote
// gravado pela metade deixaria o "2 de 4" mentindo.
export function chequesDoLote(cab, folhas, { loteId, por, porUid, agora, hoje } = {}) {
  const problemas = []
  for (const pr of problemasDoCabecalho(cab, hoje)) problemas.push({ indice: -1, ...pr })
  if (!porUid) problemas.push({ indice: -1, campo: 'porUid', msg: 'falta quem registrou' })
  if (!(folhas || []).length) problemas.push({ indice: -1, campo: 'folhas', msg: 'nenhuma folha no lote' })
  ;(folhas || []).forEach((f, i) => {
    for (const pr of problemasDaFolha(f)) problemas.push({ indice: i, ...pr })
  })
  if (problemas.length) return { ok: false, problemas, cheques: [] }

  const em = agora || new Date().toISOString()
  const total = folhas.length
  const cheques = []
  for (let i = 0; i < total; i++) {
    const f = folhas[i]
    const base = {
      empresa: cab.empresa,
      ...folhaBase(f),
      numero: String(f.numero ?? '').trim(),
      valor: arredondaReais(f.valor),
      bomPara: diaDe(f.bomPara),
      chave: '',
      cliente: String(cab.cliente).trim(),
      idVenda: String(cab.idVenda || '').trim(),
      recebidoEm: diaDe(cab.recebidoEm),
      lote: loteId || '',
      loteN: i + 1,
      loteTotal: total,
      situacao: 'carteira',
      situacaoEm: em,
      contaDeposito: '',
      destino: null,
      historico: [limpa({
        n: 1, em, data: diaDe(cab.recebidoEm), por: por || '', porUid,
        de: '', para: 'carteira',
        obs: cab.tardio ? 'lançado depois (veio da Zeus)' : 'lançado',
      })],
      tardio: !!cab.tardio,
      obs: String(f.obs ?? cab.obs ?? '').trim(),
      criadoEm: em, criadoPor: por || '', criadoUid: porUid,
    }
    base.chave = chaveCheque(base)
    let c = base
    const ini = f.inicial || cab.inicial
    if (ini && ini.para && ini.para !== 'carteira') {
      // cheque antigo que já estava noutra situação: entra pela gaveta e anda
      // até lá com as regras de sempre — sem atalho que deixasse um cheque
      // "compensado" que nunca foi depositado
      for (const passo of passosAte(ini)) {
        const r = aplicaEvento(c, { ...passo, por, porUid }, { agora: em, hoje })
        if (!r.ok) {
          for (const pr of r.problemas) problemas.push({ indice: i, ...pr })
          break
        }
        c = r.cheque
      }
    }
    cheques.push(c)
  }
  if (problemas.length) return { ok: false, problemas, cheques: [] }
  return { ok: true, problemas: [], cheques }
}

// O caminho da gaveta até a situação em que o cheque antigo JÁ está.
//   compensado → depositado, compensado
//   devolvido  → depositado, devolvido   (ou repassado, devolvido: voltou do fornecedor)
//   o resto    → um passo só
// `dataDeposito` / `repasse` trazem os dados do passo do meio quando a pessoa
// sabe; sem eles vale a data e a conta do próprio `inicial`.
export function passosAte(ini) {
  const deposito = { para: 'depositado', conta: ini.conta, data: ini.dataDeposito || ini.data }
  if (ini.para === 'compensado') return [deposito, ini]
  if (ini.para === 'devolvido') {
    return ini.de === 'repassado'
      ? [{ para: 'repassado', ...(ini.repasse || {}), data: ini.repasse?.data || ini.data }, ini]
      : [deposito, ini]
  }
  return [ini]
}

// ============================================================
// SELEÇÃO EM LOTE — o que vale para TODAS as marcadas
// ============================================================
// Marcar uma em carteira e uma compensada não oferece "depositar". O
// reapresentar entra só se TODAS puderem voltar ao banco.
export function acoesComuns(cheques) {
  const lista = cheques || []
  if (!lista.length) return []
  return Object.keys(SITUACOES_CHEQUE).filter((para) => lista.every((c) => podeIr(c, para).ok))
}

// ============================================================
// LEITURAS PARA A TELA
// ============================================================
export const PRAZO_COMPENSACAO_DIAS = 2

// quantos dias faltam para o bom para (negativo = já passou)
export const diasParaBomPara = (c, hoje) => (c?.bomPara ? diasEntre(diaDe(hoje), c.bomPara) : null)
export const podeDepositarHoje = (c, hoje) => c?.situacao === 'carteira' && (diasParaBomPara(c, hoje) ?? 0) <= 0

// há quantos dias está no banco sem ninguém marcar compensado. O "dia do
// depósito" é o do ÚLTIMO depósito — reapresentado conta de novo.
export function diasDepositado(c, hoje) {
  if (c?.situacao !== 'depositado') return null
  const dep = historicoDe(c).filter((e) => e?.para === 'depositado').slice(-1)[0]
  return dep?.data ? diasEntre(dep.data, diaDe(hoje)) : null
}
// Passou do prazo normal e ninguém marcou: não é para presumir compensado
// (decisão do Raoni), é para alguém olhar o extrato.
export const compensacaoAtrasada = (c, hoje) => (diasDepositado(c, hoje) ?? 0) > PRAZO_COMPENSACAO_DIAS

export const entreEmpresas = (c) =>
  !!(c?.destino?.empresaPagadora && c?.empresa && c.destino.empresaPagadora !== c.empresa)

// as outras folhas do mesmo parcelamento, na ordem do lote
export function irmasDoLote(c, cheques) {
  if (!c?.lote) return []
  return (cheques || []).filter((x) => x.lote === c.lote && x.id !== c.id)
    .sort((a, b) => (a.loteN || 0) - (b.loteN || 0))
}

const soma = (lista) => ({ qtd: lista.length, valor: somaFolhas(lista) })

// Os números do cabeçalho. Cancelados não entram em nada.
export function totaisCheques(cheques, hoje, diasDeposito = 7) {
  const dia = diaDe(hoje)
  const vivos = (cheques || []).filter((c) => c?.situacao !== 'cancelado')
  const carteira = vivos.filter((c) => c.situacao === 'carteira')
  const limite = somaDias(dia, diasDeposito)
  const mes = dia.slice(0, 7)
  return {
    carteira: soma(carteira),
    // inclui o que já passou da data e continua na gaveta: é dinheiro parado
    depositarAte: soma(carteira.filter((c) => c.bomPara && c.bomPara <= limite)),
    depositados: soma(vivos.filter((c) => c.situacao === 'depositado')),
    devolvidos: soma(vivos.filter((c) => c.situacao === 'devolvido')),
    repassadosNoMes: soma(vivos.filter((c) =>
      c.situacao === 'repassado' && String(c.destino?.data || '').slice(0, 7) === mes)),
  }
}

// Repassados por fornecedor — a resposta de "para onde foram os cheques".
// Agrupa pelo id do cadastro; sem id (nome digitado), pelo nome normalizado.
export function agrupaPorFornecedor(cheques) {
  const grupos = new Map()
  for (const c of cheques || []) {
    if (c?.situacao !== 'repassado' || !c.destino) continue
    const chave = c.destino.fornecedorId || `nome:${normalizaTexto(c.destino.fornecedorNome)}`
    if (!grupos.has(chave)) {
      grupos.set(chave, { fornecedorId: c.destino.fornecedorId || '', fornecedorNome: c.destino.fornecedorNome || '', cheques: [] })
    }
    grupos.get(chave).cheques.push(c)
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, ...soma(g.cheques), cheques: ordenaPorBomPara(g.cheques) }))
    .sort((a, b) => b.valor - a.valor || a.fornecedorNome.localeCompare(b.fornecedorNome))
}

export const ordenaPorBomPara = (lista) =>
  [...(lista || [])].sort((a, b) =>
    String(a.bomPara || '9999').localeCompare(String(b.bomPara || '9999'))
    || numeroNormal(a.numero).localeCompare(numeroNormal(b.numero), undefined, { numeric: true }))

// ============================================================
// BUSCA
// ============================================================
// Termo só com dígitos procura o NÚMERO DO CHEQUE (pedaço exato, sem zeros à
// esquerda) e o número do PEDIDO — e lista TODOS os que batem: o número repete
// entre clientes, então "achar o cheque" pelo número não existe.
// Texto procura cliente e emitente. `casaTexto(termo, ...textos)` pode ser
// injetado: no JC é o `casaBusca` (nome parecido); o padrão daqui é cada
// palavra aparecer, sem acento.
//   f = { termo, situacoes: [], empresa, banco, terceiro, recebidoDe, recebidoAte,
//         bomParaDe, bomParaAte, nomeCliente(razao) }
export function casaTextoSimples(termo, ...textos) {
  const palavras = normalizaTexto(termo).split(' ').filter(Boolean)
  if (!palavras.length) return true
  const alvo = normalizaTexto(textos.filter(Boolean).join(' '))
  return !!alvo && palavras.every((p) => alvo.includes(p))
}

export function filtraCheques(cheques, f = {}, casaTexto = casaTextoSimples) {
  const termo = String(f.termo || '').trim()
  const soNumero = /^[\d\s.\-/]+$/.test(termo)
  const num = soNumero ? semZeros(termo) : ''
  const nomeCli = f.nomeCliente || ((r) => r)
  return (cheques || []).filter((c) => {
    if (f.situacoes?.length && !f.situacoes.includes(c.situacao)) return false
    if (f.empresa && c.empresa !== f.empresa) return false
    if (f.banco && semZeros(c.banco?.codigo) !== semZeros(f.banco)) return false
    if (f.terceiro && !c.terceiro) return false
    if (f.recebidoDe && String(c.recebidoEm || '') < f.recebidoDe) return false
    if (f.recebidoAte && String(c.recebidoEm || '') > f.recebidoAte) return false
    if (f.bomParaDe && String(c.bomPara || '') < f.bomParaDe) return false
    if (f.bomParaAte && String(c.bomPara || '') > f.bomParaAte) return false
    if (!termo) return true
    if (soNumero) {
      return (!!num && semZeros(c.numero).includes(num)) || String(c.idVenda || '').includes(soDigitos(termo))
    }
    return casaTexto(termo, c.cliente, nomeCli(c.cliente), c.emitente?.nome, c.destino?.fornecedorNome)
  })
}

// ---------- formatação curta (a tela tem a dela; esta é para os avisos) ----------
function fmtDiaCurto(iso) {
  const p = partes(iso)
  return p ? `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.a}` : '—'
}

// tira os `undefined` — o Firestore recusa campo undefined, e o Prisma grava
// null onde o desenho quer "não se aplica"
function limpa(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
}
