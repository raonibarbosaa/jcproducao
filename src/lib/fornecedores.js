// FORNECEDORES — o cadastro de para quem o cheque é repassado (CHEQUES.md, C2).
//
// ⚠️ PORTÁTIL, como `cheques.js`: só importa dele. Os campos são o subconjunto
// do `Supplier` do TotaliFinance (nome, documento, telefone, contato, obs,
// ativo), para os dois casarem quando o controle de cheques for para lá.
//
// Onde mora no JC: UM documento, `configFinanceiro/fornecedores` = { lista }.
// É lista pequena, lida inteira, só pelo financeiro — coleção cobraria uma
// leitura por fornecedor a cada abertura (regra 1.2 da skill de desempenho; o
// caso dos 1.334 clientes que estouraram a cota em 08/10/2026).
//
// O id NUNCA sai do nome: é ele que fica gravado no cheque repassado, e renomear
// o fornecedor não pode desligar os cheques que já foram para ele. Pelo mesmo
// motivo não existe excluir — fornecedor que não se usa mais é DESATIVADO: some
// da seleção do repasse e continua respondendo "para onde foi" nos cheques antigos.
import { docValido, fmtDoc, normalizaTexto } from './cheques.js'

const soDigitos = (v) => String(v ?? '').replace(/\D/g, '')

// id curto e estável. `agora` e `sorteio` entram de fora para o teste.
export function idFornecedor(agora = Date.now(), sorteio = Math.random()) {
  return `forn_${Number(agora).toString(36)}${Math.floor(sorteio * 1296).toString(36).padStart(2, '0')}`
}

// o que vem do formulário, limpo. Documento sai formatado quando é CPF/CNPJ
// completo; o que não tem 11 nem 14 dígitos fica como digitado (e a validação
// acusa).
export function dadosFornecedor(form) {
  const doc = String(form?.documento ?? '').trim()
  const dig = soDigitos(doc)
  return {
    nome: String(form?.nome ?? '').trim().replace(/\s+/g, ' '),
    documento: dig.length === 11 || dig.length === 14 ? fmtDoc(dig) : doc,
    telefone: String(form?.telefone ?? '').trim(),
    contato: String(form?.contato ?? '').trim(),
    obs: String(form?.obs ?? '').trim(),
  }
}

// { erros, avisos }. Erro impede salvar; aviso a pessoa confirma.
//   - documento repetido é ERRO: CNPJ é a identidade da empresa, dois cadastros
//     para o mesmo CNPJ partem o histórico de repasses em dois;
//   - nome repetido é AVISO: duas empresas diferentes podem ter o mesmo nome
//     fantasia, e quem sabe é a pessoa.
// `idAtual` = o fornecedor que está sendo editado (não se compara consigo).
export function problemasDoFornecedor(f, lista = [], idAtual = '') {
  const erros = []; const avisos = []
  const nome = String(f?.nome || '').trim()
  if (!nome) erros.push('Informe o nome do fornecedor.')
  const dig = soDigitos(f?.documento)
  if (dig && !docValido(dig)) erros.push('CNPJ/CPF com dígito errado — confira o número.')
  const outros = (lista || []).filter((x) => x.id !== idAtual)
  if (dig) {
    const mesmoDoc = outros.find((x) => soDigitos(x.documento) === dig)
    if (mesmoDoc) erros.push(`Esse CNPJ/CPF já está cadastrado em "${mesmoDoc.nome}"${mesmoDoc.ativo === false ? ' (inativo — reative em vez de criar outro)' : ''}.`)
  }
  if (nome) {
    const mesmoNome = outros.find((x) => normalizaTexto(x.nome) === normalizaTexto(nome))
    if (mesmoNome) avisos.push(`Já existe um fornecedor chamado "${mesmoNome.nome}"${mesmoNome.ativo === false ? ' (inativo)' : ''}.`)
  }
  return { erros, avisos }
}

// A lista nova depois de salvar. Novo ganha id e quem criou; editado mantém o
// id, o `ativo` e quem criou — só os dados mudam.
export function salvaFornecedor(lista, form, idAtual, { id, agora, por } = {}) {
  const dados = dadosFornecedor(form)
  const em = agora || new Date().toISOString()
  const atual = (lista || [])
  if (!idAtual) {
    return [...atual, { id: id || idFornecedor(), ...dados, ativo: true, criadoEm: em, criadoPor: por || '', atualizadoEm: em }]
  }
  if (!atual.some((x) => x.id === idAtual)) throw new Error('fornecedor não encontrado na lista')
  return atual.map((x) => (x.id === idAtual ? { ...x, ...dados, atualizadoEm: em, atualizadoPor: por || '' } : x))
}

// `ativo` ausente (registro antigo) conta como ativo, como nos motoristas
export const fornecedorAtivo = (f) => f?.ativo !== false

export function alternaAtivoFornecedor(lista, id, { agora, por } = {}) {
  const em = agora || new Date().toISOString()
  return (lista || []).map((x) => (x.id === id
    ? { ...x, ativo: !fornecedorAtivo(x), atualizadoEm: em, atualizadoPor: por || '' }
    : x))
}

export const fornecedoresAtivos = (lista) => (lista || []).filter(fornecedorAtivo)

// ativos primeiro, depois pelo nome
export const ordenaFornecedores = (lista) =>
  [...(lista || [])].sort((a, b) =>
    Number(!fornecedorAtivo(a)) - Number(!fornecedorAtivo(b))
    || normalizaTexto(a.nome).localeCompare(normalizaTexto(b.nome)))

export const achaFornecedor = (lista, id) => (lista || []).find((x) => x.id === id) || null

// o nome para mostrar no cheque: o do cadastro (atual, se foi renomeado) e,
// sem cadastro, o nome que ficou gravado no próprio repasse
export const nomeFornecedor = (lista, id, gravado = '') => achaFornecedor(lista, id)?.nome || gravado || ''
