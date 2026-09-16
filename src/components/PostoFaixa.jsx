import { useEffect, useRef, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  conferePin, pinsDoPosto, restaDoPosto, fmtResta,
  POSTO_MINUTOS, POSTO_TENTATIVAS, POSTO_ESPERA_S,
} from '../utils.js'

// O TABLET do setor: uma conta só logada, vários funcionários dando baixa.
// Quem faz a baixa se identifica tocando no nome e digitando o PIN; fica ATIVO
// por POSTO_MINUTOS sem mexer em nada (cada baixa renova) e sai com um toque.
//
// O estado vive na página (Producao), não no quadro: o quadro some e volta
// quando a fila esvazia, e com ele iria embora quem estava identificado.
export function usePosto(ligado) {
  const [pins, setPins] = useState({})
  const [executor, setExecutor] = useState(null)   // { uid, nome, ultimo }
  const [agora, setAgora] = useState(Date.now())

  useEffect(() => {
    if (!ligado) return undefined
    return onSnapshot(collection(db, 'pins'),
      (snap) => setPins(Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]))),
      (e) => console.error('pins do posto:', e))
  }, [ligado])

  // relógio só enquanto alguém está ativo — é ele que expira o nome
  useEffect(() => {
    if (!executor) return undefined
    const t = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [executor])

  const resta = executor ? restaDoPosto(executor.ultimo, agora) : 0
  useEffect(() => {
    if (executor && resta <= 0) setExecutor(null)
  }, [executor, resta])

  // PIN desligado (ou removido) no escritório enquanto a pessoa está ativa:
  // sai na hora. Ninguém fica ativo antes de os pins chegarem, então doc
  // ausente aqui quer dizer apagado mesmo.
  useEffect(() => {
    if (executor && pins[executor.uid]?.ativo !== true) setExecutor(null)
  }, [executor, pins])

  return {
    ligado,
    pins,
    // conferido de novo no clique: o intervalo de 1 s pode estar atrasado
    executor: executor && restaDoPosto(executor.ultimo) > 0 ? executor : null,
    resta,
    entrar: (uid, nome) => { setAgora(Date.now()); setExecutor({ uid, nome, ultimo: Date.now() }) },
    sair: () => setExecutor(null),
    renova: () => setExecutor((e) => (e ? { ...e, ultimo: Date.now() } : e)),
  }
}

export default function PostoFaixa({ posto, setores }) {
  const [escolhido, setEscolhido] = useState(null)   // { uid, nome, hash } pedindo PIN
  const lista = pinsDoPosto(posto.pins, setores)
  // primeiro nome basta — até aparecerem dois "João"; aí vai o sobrenome junto
  const repetidos = new Set(lista.map((f) => primeiroNome(f.nome))
    .filter((n, i, a) => a.indexOf(n) !== i))
  const rotulo = (n) => (repetidos.has(primeiroNome(n)) ? nomeCurto(n) : primeiroNome(n))
  const { executor, resta } = posto

  return (
    <div className={`posto-faixa no-print${executor ? ' ativo' : ''}`}>
      {executor ? (
        <div className="posto-ativo">
          <span className="posto-quem">
            ✋ <b>{executor.nome}</b> está dando baixa
            <small title={`Sai sozinho depois de ${POSTO_MINUTOS} min sem uso`}> · sai em {fmtResta(resta)}</small>
          </span>
          <button className="btn posto-sair" onClick={posto.sair}>Sair</button>
        </div>
      ) : (
        <div className="posto-pede">👆 Toque no seu nome para dar baixa</div>
      )}
      <div className="posto-nomes">
        {lista.length === 0 && (
          <span className="posto-vazio">
            Ninguém com PIN neste setor. O escritório cadastra em Usuários › Editar.
          </span>
        )}
        {lista.map((f) => (
          <button key={f.uid}
            className={`posto-nome${executor?.uid === f.uid ? ' on' : ''}`}
            onClick={() => executor?.uid !== f.uid && setEscolhido(f)}>
            <span className="posto-ini">{iniciais(f.nome)}</span>
            {rotulo(f.nome)}
          </button>
        ))}
      </div>
      {escolhido && (
        <TecladoPin pessoa={escolhido}
          onCancelar={() => setEscolhido(null)}
          onOk={() => { posto.entrar(escolhido.uid, escolhido.nome); setEscolhido(null) }} />
      )}
    </div>
  )
}

const iniciais = (n) => String(n || '?').trim().split(/\s+/).filter(Boolean)
  .map((x, i, a) => (i === 0 || i === a.length - 1 ? x[0] : '')).join('').toUpperCase().slice(0, 2)
const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0] || '—'
const nomeCurto = (n) => {
  const p = String(n || '').trim().split(/\s+/).filter(Boolean)
  return p.length > 1 ? `${p[0]} ${p[p.length - 1]}` : (p[0] || '—')
}

// Teclado grande: no tablet, o teclado do sistema cobre metade da tela e ainda
// mostra letras. Errou POSTO_TENTATIVAS vezes seguidas, espera um pouco — sem
// isso, adivinhar o PIN do colega é questão de paciência.
export function TecladoPin({ pessoa, onOk, onCancelar }) {
  const [dig, setDig] = useState('')
  const [erro, setErro] = useState('')
  const [bloqueadoAte, setBloqueadoAte] = useState(0)
  const [, tick] = useState(0)
  const erros = useRef(0)
  const conferindo = useRef(false)

  const falta = Math.max(0, Math.ceil((bloqueadoAte - Date.now()) / 1000))
  useEffect(() => {
    if (!falta) return undefined
    const t = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(t)
  }, [falta])

  async function tecla(n) {
    if (falta || conferindo.current) return
    const novo = (dig + n).slice(0, 4)
    setDig(novo)
    setErro('')
    if (novo.length < 4) return
    conferindo.current = true
    const certo = await conferePin(pessoa.uid, novo, pessoa.hash)
    conferindo.current = false
    if (certo) { erros.current = 0; onOk(); return }
    erros.current += 1
    setDig('')
    if (erros.current >= POSTO_TENTATIVAS) {
      erros.current = 0
      setBloqueadoAte(Date.now() + POSTO_ESPERA_S * 1000)
      setErro(`PIN errado ${POSTO_TENTATIVAS} vezes. Aguarde.`)
    } else {
      setErro('PIN errado. Tente de novo.')
    }
  }

  return (
    <div className="assist-overlay" onClick={(e) => e.target === e.currentTarget && onCancelar()}>
      <div className="fin-modal posto-teclado">
        <div className="fin-modal-head">
          <b>{pessoa.nome}</b>
          <button className="btn" onClick={onCancelar}>✕</button>
        </div>
        <div className="fin-modal-body">
          <div className="posto-bolinhas" aria-label={`${dig.length} de 4 números`}>
            {[0, 1, 2, 3].map((i) => <span key={i} className={i < dig.length ? 'on' : ''} />)}
          </div>
          <div className="posto-msg">
            {falta ? `Aguarde ${falta}s` : (erro || 'Digite seu PIN')}
          </div>
          <div className="posto-teclas">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
              <button key={n} disabled={!!falta} onClick={() => tecla(n)}>{n}</button>
            ))}
            <button className="posto-tecla-lado" onClick={onCancelar}>Cancelar</button>
            <button disabled={!!falta} onClick={() => tecla('0')}>0</button>
            <button className="posto-tecla-lado" disabled={!dig} onClick={() => setDig((d) => d.slice(0, -1))}>⌫</button>
          </div>
        </div>
      </div>
    </div>
  )
}
