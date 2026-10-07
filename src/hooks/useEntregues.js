// A COLEÇÃO `entregues` EM FATIAS (correção 4, 07/10/2026).
//
// É histórico: só cresce, e cinco telas a assinavam inteira — a cada abertura
// da aba (as abas são lazy, desmontar = perder tudo). Este hook assina só o que
// a tela precisa, e as fontes se somam:
//   - `periodoDias`  → remessas com `entregueEm` nos últimos N dias (0/vazio = nenhuma)
//   - `numero`       → as remessas de UM pedido, pelo prefixo do número, nas DUAS
//                      formas do doc (id "5111-1" com campo idVenda, e o antigo "5111")
//   - `tudo`         → a coleção inteira (o "Todo o histórico" e a busca por texto,
//                      que o Firestore não sabe fazer no servidor)
// Nenhuma consulta exige índice composto: cada uma é faixa num campo só.
//
// ⚠️ MeusPedidos NÃO usa isto: a regra do vendedor exige `where('vendedor','==')`,
// e a consulta dele já vem fatiada por natureza. O Financeiro também não: a fila
// "a cobrar" é "entrega sem cobrança", e um corte por data esconderia dívida.
import { useEffect, useMemo, useState } from 'react'
import { collection, documentId, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase.js'
import { doDoc, corteDoPeriodo, faixaPrefixoNumero, uneEntregues } from '../utils.js'

function assina(q, rotulo, set, marcaNegado) {
  return onSnapshot(q,
    (snap) => { set(snap.docs.map(doDoc)); marcaNegado(false) },
    (e) => {
      console.error(`entregues (${rotulo}):`, e)
      // ⚠️ o erro de permissão é TRATADO, não engolido: a tela diz que a busca
      // está incompleta em vez de responder "não achei" para o que existe
      if (e?.code === 'permission-denied') marcaNegado(true)
    })
}

export function useEntregues({ periodoDias = 0, numero = '', tudo = false } = {}) {
  const [doPeriodo, setDoPeriodo] = useState([])
  const [doNumeroId, setDoNumeroId] = useState([])
  const [doNumeroCampo, setDoNumeroCampo] = useState([])
  const [negado, setNegado] = useState(false)
  const faixa = faixaPrefixoNumero(numero)
  const prefixo = faixa ? faixa[0] : ''
  const dias = tudo ? 0 : (Number(periodoDias) || 0)

  // período / tudo — fonte 1 (independente do número: digitar não a derruba)
  useEffect(() => {
    if (!tudo && !dias) { setDoPeriodo([]); return undefined }
    const col = collection(db, 'entregues')
    const q = tudo ? col : query(col, where('entregueEm', '>=', corteDoPeriodo(dias)))
    return assina(q, tudo ? 'tudo' : `${dias} dias`, setDoPeriodo, setNegado)
  }, [tudo, dias])

  // por número — fonte 2 (as duas formas do documento)
  useEffect(() => {
    if (!prefixo || tudo) { setDoNumeroId([]); setDoNumeroCampo([]); return undefined }
    const col = collection(db, 'entregues')
    const [a, b] = faixaPrefixoNumero(prefixo)
    const us = [
      assina(query(col, where(documentId(), '>=', a), where(documentId(), '<=', b)), `id ${prefixo}`, setDoNumeroId, setNegado),
      assina(query(col, where('idVenda', '>=', a), where('idVenda', '<=', b)), `idVenda ${prefixo}`, setDoNumeroCampo, setNegado),
    ]
    return () => us.forEach((u) => u())
  }, [prefixo, tudo])

  const entregues = useMemo(() => uneEntregues(doPeriodo, doNumeroId, doNumeroCampo),
    [doPeriodo, doNumeroId, doNumeroCampo])
  return { entregues, negado }
}
