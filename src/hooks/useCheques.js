// A coleção `cheques` — uma FOLHA por documento (CHEQUES.md, C3).
//
// Conta de leituras (regra 1.1 da skill de desempenho), com a decisão do
// Raoni de 26/10/2026 de abrir com a CARTEIRA INTEIRA:
//   vivas (carteira + depositados + devolvidos) ≈ 300/mês × até 4 meses de
//   pré-datado ≈ 1.200 docs × 2 perfis × ~10 aberturas/dia ≈ 24 mil/dia no
//   pior caso. O cache persistente corta isso quando a aba volta em menos de
//   ~30 min. Foi escolhido sabendo o custo; se a cota apertar, o remédio é
//   janelar a carteira pelo "bom para" (o desenho está no CHEQUES.md).
// O ARQUIVO (compensado, repassado, resgatado, cancelado) só é lido quando
// alguém pede: ele só cresce, e assiná-lo na abertura pagaria o passado
// inteiro todo dia (regra 1.3).
import { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, query, where, runTransaction, writeBatch, getDocs } from 'firebase/firestore'
import { db } from '../firebase.js'
import { doDoc } from '../utils.js'
import { SITUACOES_VIVAS, SITUACOES_CHEQUE, aplicaEvento, corrigeCheque, marcaResgate, desisteResgate,
  efeitoNoCaixa, movimentoDoCheque } from '../lib/cheques.js'

const col = () => collection(db, 'cheques')
export const SITUACOES_ARQUIVO = Object.keys(SITUACOES_CHEQUE).filter((s) => !SITUACOES_VIVAS.includes(s))

function assina(situacoes, set) {
  return onSnapshot(query(col(), where('situacao', 'in', situacoes)),
    (snap) => set({ lista: snap.docs.map(doDoc), pronto: !(snap.metadata.fromCache && snap.empty), erro: '' }),
    (e) => {
      console.error('cheques:', e)
      set((s) => ({ ...s, pronto: false, erro: e?.code || e?.message || 'erro' }))
    })
}

const VAZIO = { lista: [], pronto: false, erro: '' }

export function useChequesVivos(ligado = true) {
  const [estado, setEstado] = useState(VAZIO)
  useEffect(() => (ligado ? assina(SITUACOES_VIVAS, setEstado) : undefined), [ligado])
  return estado
}

// o arquivo, só enquanto `ligado` (o "incluir os encerrados" do Localizar e a
// aba de repassados). Desligado = lista vazia, sem leitura.
export function useChequesArquivo(ligado = false) {
  const [estado, setEstado] = useState(VAZIO)
  useEffect(() => {
    if (!ligado) { setEstado(VAZIO); return undefined }
    return assina(SITUACOES_ARQUIVO, setEstado)
  }, [ligado])
  return estado
}

// Gravar o lote: um writeBatch com todas as folhas — ou o lote inteiro entra,
// ou nada entra (o "2 de 4" não pode mentir). `loteId` sai de um doc novo para
// ser único sem consulta.
export function novoLoteId() {
  return doc(col()).id
}
export async function gravaLote(cheques) {
  const b = writeBatch(db)
  for (const c of cheques) b.set(doc(col()), c)
  await b.commit()
}

// Cheques já gravados com alguma dessas chaves — inclusive os do ARQUIVO, que a
// tela não tem carregados. `in` aceita 30 valores por consulta.
export async function chequesComChaves(chaves) {
  const unicas = [...new Set((chaves || []).filter(Boolean))]
  const achados = []
  for (let i = 0; i < unicas.length; i += 30) {
    const snap = await getDocs(query(col(), where('chave', 'in', unicas.slice(i, i + 30))))
    achados.push(...snap.docs.map(doDoc))
  }
  return achados
}

// Mudar a situação de UMA OU VÁRIAS folhas por TRANSAÇÃO: lê cada cheque no
// servidor, aplica o evento sobre a versão de LÁ e grava. Duas pessoas mexendo
// no mesmo cheque não apagam o histórico uma da outra (o `historico` é
// regravado inteiro, e sobre uma cópia velha o evento do outro sumiria).
// Qualquer folha com problema barra todas — mudança pela metade numa seleção
// deixaria a pessoa sem saber quais foram.
//
// C6b — FOLHA LIGADA A UMA PARCELA: na MESMA transação, compensar/repassar cria
// o recebimento (`movimentos`) e voltar/recolher/cancelar o CANCELA (os três
// campos de cancelamento, que é o que a rule de `movimentos` deixa mudar). Ou a
// folha muda E o caixa acompanha, ou nada acontece — parcela "recebida" com o
// cheque devolvido seria exatamente o buraco que esta fase fecha.
export async function aplicaEmLote(ids, ev, { agora, hoje } = {}) {
  const em = agora || new Date().toISOString()
  await runTransaction(db, async (tx) => {
    const refs = ids.map((id) => doc(db, 'cheques', id))
    const snaps = await Promise.all(refs.map((r) => tx.get(r)))
    const passos = snaps.map((s, i) => {
      if (!s.exists()) throw new Error(`cheque ${ids[i]} não existe mais`)
      const antes = { ...s.data(), id: s.id }
      const r = aplicaEvento(antes, ev, { agora: em, hoje })
      if (!r.ok) throw new Error(`nº ${antes.numero}: ${r.problemas.map((p) => p.msg).join('; ')}`)
      return { antes, patch: { ...r.patch }, caixa: efeitoNoCaixa(antes, ev) }
    })
    passos.forEach(({ antes, patch, caixa }, i) => {
      if (caixa?.cancelar) {
        tx.update(doc(db, 'movimentos', caixa.cancelar),
          { cancelado: true, canceladoPor: ev.por || '', canceladoEm: em })
        patch.movimentoId = null
      }
      if (caixa?.criar) {
        const ref = doc(collection(db, 'movimentos'))
        // o cheque já com a mudança: a obs do repasse diz o fornecedor novo
        tx.set(ref, movimentoDoCheque({ ...antes, ...patch }, caixa.criar, { por: ev.por, porUid: ev.porUid, agora: em }))
        patch.movimentoId = ref.id
      }
      tx.update(refs[i], patch)
    })
  })
}

export async function corrigeNoServidor(id, mudancas, quem) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'cheques', id)
    const s = await tx.get(ref)
    if (!s.exists()) throw new Error('cheque não existe mais')
    const r = corrigeCheque({ ...s.data(), id: s.id }, mudancas, quem)
    if (!r.ok) throw new Error(r.problemas.map((p) => p.msg).join('; '))
    tx.update(ref, r.patch)
  })
}

// Os cheques REPASSADOS de um período — aba Repassados (C4). Consulta por
// `repassadoEm` (data do último repasse, nunca apagada): um campo só, sem
// índice composto. Vem junto a folha que voltou do fornecedor depois — o recibo
// daquele dia a incluiu, e a tela precisa mostrá-la.
// `corte` vazio = todos os repassados que já existiram (o "tudo" da tela).
export function useChequesRepassados(ligado = false, corte = '') {
  const [estado, setEstado] = useState(VAZIO)
  useEffect(() => {
    if (!ligado) { setEstado(VAZIO); return undefined }
    return onSnapshot(query(col(), where('repassadoEm', '>=', corte || '0000-00-00')),
      (snap) => setEstado({ lista: snap.docs.map(doDoc), pronto: !(snap.metadata.fromCache && snap.empty), erro: '' }),
      (e) => {
        console.error('cheques repassados:', e)
        setEstado((s) => ({ ...s, pronto: false, erro: e?.code || e?.message || 'erro' }))
      })
  }, [ligado, corte])
  return estado
}

// Os cheques dos pedidos que o LOCALIZAR está mostrando (C5). Só roda para quem
// vê dinheiro (`ligado`) e só com pedidos na tela: `idVenda in [...]`, de 30
// em 30 (limite do `in`). Cada folha achada é uma leitura — poucas por busca.
// Devolve um Map idVenda → cheques.
export function useChequesDosPedidos(ids, ligado = false) {
  const chave = [...new Set((ids || []).map(String).filter(Boolean))].sort().join(',')
  const [estado, setEstado] = useState({ porPedido: new Map(), erro: '' })
  useEffect(() => {
    const lista = chave ? chave.split(',') : []
    if (!ligado || !lista.length) { setEstado({ porPedido: new Map(), erro: '' }); return undefined }
    const partes = []
    for (let i = 0; i < lista.length; i += 30) partes.push(lista.slice(i, i + 30))
    const achados = partes.map(() => [])
    const junta = () => {
      const m = new Map()
      for (const c of achados.flat()) {
        const k = String(c.idVenda)
        if (!m.has(k)) m.set(k, [])
        m.get(k).push(c)
      }
      setEstado({ porPedido: m, erro: '' })
    }
    const us = partes.map((ps, i) => onSnapshot(query(col(), where('idVenda', 'in', ps)),
      (snap) => { achados[i] = snap.docs.map(doDoc); junta() },
      (e) => {
        console.error('cheques do pedido:', e)
        setEstado((s) => ({ ...s, erro: e?.code || e?.message || 'erro' }))
      }))
    return () => us.forEach((u) => u())
  }, [chave, ligado])
  return estado
}

// Os cheques que UM cliente já passou — para o lançamento oferecer as contas
// dele (C6a). Leitura única (não fica escutando): `clienteChave` é um campo
// só, sem índice composto, e lê só as folhas daquele cliente.
export async function chequesDoCliente(chave) {
  if (!chave) return []
  const snap = await getDocs(query(col(), where('clienteChave', '==', chave)))
  return snap.docs.map(doDoc)
}

// As folhas com estes NÚMEROS no banco inteiro — a busca do Localizar (C6c).
// `numeroChave in [...]`: um campo, sem índice composto; lê só as folhas
// daqueles números (o número repete entre clientes — vêm todas). É o que acha
// o 246 já compensado ou repassado sem carregar o arquivo.
// E os cheques dos CLIENTES que o texto achou no cadastro (`clienteChave in
// [...]`), para "rubi" trazer também a folha da RUBI que já está com o
// fornecedor. As duas consultas se somam; cada uma lê só o que casa.
//   busca = { numeros: [...], clientes: [clienteChave, ...] }
export function useChequesDaBusca(busca, ligado = true) {
  const nums = [...new Set((busca?.numeros || []).filter(Boolean))].slice(0, 30).sort().join(',')
  const clis = [...new Set((busca?.clientes || []).filter(Boolean))].slice(0, 30).sort().join('|')
  const [porNum, setPorNum] = useState([])
  const [porCli, setPorCli] = useState([])
  const [erro, setErro] = useState('')
  const assinaUma = (campo, valores, set) => onSnapshot(query(col(), where(campo, 'in', valores)),
    (snap) => { set(snap.docs.map(doDoc)); setErro('') },
    (e) => { console.error(`cheques por ${campo}:`, e); setErro(e?.code || e?.message || 'erro') })
  useEffect(() => {
    if (!ligado || !nums) { setPorNum([]); return undefined }
    return assinaUma('numeroChave', nums.split(','), setPorNum)
  }, [nums, ligado])
  useEffect(() => {
    if (!ligado || !clis) { setPorCli([]); return undefined }
    return assinaUma('clienteChave', clis.split('|'), setPorCli)
  }, [clis, ligado])
  return useMemo(() => ({ lista: [...porNum, ...porCli], pronto: true, erro }), [porNum, porCli, erro])
}

// Os RESGATES A BUSCAR (C6d): folhas com o fornecedor que o cliente quer de
// volta. `resgatePedidoEm > ''` — um campo; folha sem o campo (ou null) fica de
// fora. É pouca coisa e precisa estar sempre à vista: lida na abertura da aba.
export function useResgatesPendentes(ligado = true) {
  const [estado, setEstado] = useState(VAZIO)
  useEffect(() => {
    if (!ligado) { setEstado(VAZIO); return undefined }
    return onSnapshot(query(col(), where('resgatePedidoEm', '>', '')),
      (snap) => setEstado({ lista: snap.docs.map(doDoc), pronto: true, erro: '' }),
      (e) => {
        console.error('resgates pendentes:', e)
        setEstado((s) => ({ ...s, erro: e?.code || e?.message || 'erro' }))
      })
  }, [ligado])
  return estado
}

// marcar / desistir do resgate, por transação sobre a versão do servidor
export async function resgateNoServidor(id, desistir, ev) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'cheques', id)
    const s = await tx.get(ref)
    if (!s.exists()) throw new Error('cheque não existe mais')
    const r = (desistir ? desisteResgate : marcaResgate)({ ...s.data(), id: s.id }, ev)
    if (!r.ok) throw new Error(r.problemas.map((p) => p.msg).join('; '))
    tx.update(ref, r.patch)
  })
}
