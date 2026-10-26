// O cadastro de FORNECEDORES — um documento só, `configFinanceiro/fornecedores`.
// Por que um documento e não coleção: ver o topo de `src/lib/fornecedores.js`.
// Conta de leituras: 1 por abertura da tela, de 2 perfis (dono e financeiro).
//
// ⚠️ Fica FORA do CadastrosContext de propósito: o contexto é lido por todo
// perfil, e esta regra só deixa dono e financeiro lerem — assinar ali daria
// permission-denied para o resto da fábrica a cada login.
import { useEffect, useState } from 'react'
import { doc, onSnapshot, runTransaction } from 'firebase/firestore'
import { db } from '../firebase.js'
import { problemasDoFornecedor } from '../lib/fornecedores.js'

export const refFornecedores = () => doc(db, 'configFinanceiro', 'fornecedores')

export function useFornecedores(ligado = true) {
  const [estado, setEstado] = useState({ lista: [], pronto: false, erro: '' })
  useEffect(() => {
    if (!ligado) return undefined
    return onSnapshot(refFornecedores(),
      (snap) => {
        // ⚠️ "veio do cache e não existe" NÃO é lista vazia: é lista que ainda
        // não chegou (regra 1.7). Até o servidor responder, a tela espera.
        const pronto = !(snap.metadata.fromCache && !snap.exists())
        setEstado({ lista: snap.exists() ? (snap.data().lista || []) : [], pronto, erro: '' })
      },
      (e) => {
        console.error('fornecedores:', e)
        setEstado((s) => ({ ...s, pronto: false, erro: e?.code || e?.message || 'erro' }))
      })
  }, [ligado])
  return estado
}

// Grava a lista por TRANSAÇÃO: lê a versão do servidor, aplica `mudar` sobre
// ELA e grava. Duas razões:
//   - nunca regrava a partir de uma lista que a tela ainda não recebeu (lista
//     vazia + "salvar" apagaria o cadastro inteiro);
//   - dono e financeiro editando ao mesmo tempo não perdem a mudança um do outro.
// `conferir(listaDoServidor)` roda dentro da transação e pode barrar (ex.: CNPJ
// que outra pessoa acabou de cadastrar).
export async function gravaFornecedores(mudar, { por = '', porUid = '', conferir } = {}) {
  const ref = refFornecedores()
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    const atual = snap.exists() ? (snap.data().lista || []) : []
    if (conferir) conferir(atual)
    tx.set(ref, { lista: mudar(atual), atualizadoEm: new Date().toISOString(), atualizadoPor: por, atualizadoUid: porUid })
  })
}

// a conferência padrão de um salvamento: os erros de `problemasDoFornecedor`
// contra a lista do SERVIDOR, não a da tela
export const conferirFornecedor = (form, idAtual) => (lista) => {
  const { erros } = problemasDoFornecedor(form, lista, idAtual)
  if (erros.length) throw new Error(erros.join(' '))
}
