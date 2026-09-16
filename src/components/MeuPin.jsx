import { useEffect, useState } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { conferePin, hashPin, problemaDoPin } from '../utils.js'

// "Meu PIN" — o funcionário troca o PIN do tablet entrando com o PRÓPRIO login.
// O escritório cria o primeiro; depois da troca só ele sabe.
//
// Pede o PIN ATUAL de propósito: a sessão dele pode ficar aberta num celular
// emprestado, e trocar o PIN sem saber o atual seria tomar a assinatura dele.
// Esqueceu o atual? Quem redefine é o escritório (Usuários › Editar) — por isso
// a regra não deixa o próprio usuário CRIAR o documento, só trocar o hash.
export default function MeuPin({ onFechar }) {
  const { user } = useAuth()
  const [pin, setPin] = useState(undefined) // undefined = carregando, null = não existe

  useEffect(() => {
    if (!user?.uid) return undefined
    return onSnapshot(doc(db, 'pins', user.uid),
      (s) => setPin(s.exists() ? s.data() : null),
      () => setPin(null))
  }, [user?.uid])

  async function salvar(atual, novo) {
    if (!(await conferePin(user.uid, atual, pin?.hash))) {
      throw new Error('O PIN atual não confere.')
    }
    await updateDoc(doc(db, 'pins', user.uid), {
      hash: await hashPin(user.uid, novo),
      definidoEm: new Date().toISOString(),
      definidoPor: user.uid,
    })
  }

  return <CorpoMeuPin pin={pin} onSalvar={salvar} onFechar={onFechar} />
}

export function CorpoMeuPin({ pin, onSalvar, onFechar }) {
  const [atual, setAtual] = useState('')
  const [novo, setNovo] = useState('')
  const [novo2, setNovo2] = useState('')
  const [erro, setErro] = useState('')
  const [feito, setFeito] = useState(false)
  const [busy, setBusy] = useState(false)

  async function trocar() {
    setErro('')
    const p = problemaDoPin(novo)
    if (p) { setErro(p); return }
    if (novo !== novo2) { setErro('A confirmação não é igual ao PIN novo.'); return }
    if (novo === atual) { setErro('O PIN novo é igual ao atual.'); return }
    setBusy(true)
    try {
      await onSalvar(atual, novo)
      setFeito(true)
    } catch (e) {
      setErro(e.code === 'permission-denied'
        ? 'Sem permissão para trocar o PIN. Fale com o escritório.'
        : (e.message || 'Não foi possível trocar o PIN.'))
    } finally {
      setBusy(false)
    }
  }

  const soNumero = (fn) => (e) => fn(e.target.value.replace(/\D/g, '').slice(0, 4))
  const campo = (rotulo, valor, fn, auto) => (
    <div className="field">
      <label>{rotulo}</label>
      <input type="password" inputMode="numeric" autoComplete="off" maxLength={4}
        value={valor} onChange={soNumero(fn)} autoFocus={auto} className="pin-input" />
    </div>
  )

  let corpo
  if (pin === undefined) {
    corpo = <div className="fin-modal-sub">Carregando…</div>
  } else if (!pin) {
    corpo = (
      <div className="fin-explica">
        Você ainda não tem PIN do tablet. Peça ao escritório para criar o primeiro
        (Usuários › Editar) — depois você troca aqui.
      </div>
    )
  } else if (!pin.ativo) {
    corpo = (
      <div className="fin-explica">
        Seu PIN está <b>desligado</b>: o tablet não aceita baixa em seu nome.
        Fale com o escritório.
      </div>
    )
  } else if (feito) {
    corpo = (
      <div className="fin-explica">
        ✓ <b>PIN trocado.</b> A partir de agora use o novo no tablet. Não conte para
        ninguém: cada baixa com ele sai no seu nome.
      </div>
    )
  } else {
    corpo = (
      <>
        <div className="fin-modal-sub">
          É o PIN que você digita no tablet para dar baixa no seu nome.
          Esqueceu o atual? O escritório redefine.
        </div>
        {erro && <div className="login-err" style={{ marginBottom: 10 }}>{erro}</div>}
        {campo('PIN atual', atual, setAtual, true)}
        {campo('PIN novo (4 números)', novo, setNovo)}
        {campo('Repita o PIN novo', novo2, setNovo2)}
      </>
    )
  }

  const podeTrocar = pin && pin.ativo && !feito
  return (
    <div className="assist-overlay" onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="fin-modal" style={{ width: 'min(420px, 94vw)' }}>
        <div className="fin-modal-head">
          <b>🔢 Meu PIN do tablet</b>
          <button className="btn" onClick={onFechar}>✕</button>
        </div>
        <div className="fin-modal-body">{corpo}</div>
        <div className="fin-modal-pe">
          <button className="btn" onClick={onFechar} disabled={busy}>
            {podeTrocar ? 'Cancelar' : 'Fechar'}
          </button>
          {podeTrocar && (
            <button className="btn primary" onClick={trocar}
              disabled={busy || atual.length !== 4 || novo.length !== 4 || novo2.length !== 4}>
              {busy ? 'Trocando…' : 'Trocar PIN'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
