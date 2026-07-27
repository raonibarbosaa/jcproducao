import { useState, useRef } from 'react'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import { responderPergunta } from '../utils.js'

// reconhecimento de voz: bom no Chrome, instável no Safari.
// A SÍNTESE de voz (falar a resposta) funciona nos dois.
const SR = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null

// Acessibilidade (empresário com baixíssima visão): um BOTÃO GIGANTE que muda
// de COR e de TEXTO por fase, com feedback visual bem grande.
//   parado  → dourado  · "TOQUE E FALE"           (toque = começa a ouvir)
//   ouvindo → verde    · "ESTOU OUVINDO…"          (pulsando; toque = para)
//   pronto  → azul     · "OUVIR A RESPOSTA"        (resposta na tela; toque = lê em voz)
//   falando → roxo     · "LENDO A RESPOSTA…"       (pulsando; toque = para)
export default function AssistenteVoz({ pedidos }) {
  const { vendedores, clientes } = useCadastros()
  const [aberto, setAberto] = useState(false)
  const [fase, setFase] = useState('parado')      // parado | ouvindo | pronto | falando
  const [transcricao, setTranscricao] = useState('')
  const [resposta, setResposta] = useState('')
  const [texto, setTexto] = useState('')
  const recRef = useRef(null)

  function falar(msg) {
    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(msg)
      u.lang = 'pt-BR'
      u.rate = 0.95           // um tiquinho mais devagar, mais claro
      u.onstart = () => setFase('falando')
      u.onend = () => setFase('pronto')
      u.onerror = () => setFase('pronto')
      window.speechSynthesis.speak(u)
    } catch {
      setFase('pronto')       // sem síntese: a resposta fica só na tela (grande)
    }
  }

  function responder(pergunta) {
    setTranscricao(pergunta)
    setResposta(responderPergunta(pergunta, pedidos, vendedores, clientes))
    setFase('pronto')         // mostra a resposta grande; toque no botão lê em voz
  }

  function ouvir() {
    setTranscricao(''); setResposta('')
    try { window.speechSynthesis?.cancel() } catch { /* noop */ }
    if (!SR) {
      const m = 'O reconhecimento de voz não está disponível neste navegador. Digite a pergunta no campo de texto.'
      setResposta(m); setFase('pronto'); falar(m)
      return
    }
    try {
      const rec = new SR()
      rec.lang = 'pt-BR'
      rec.interimResults = true      // mostra na tela o que vai ouvindo
      rec.maxAlternatives = 1
      rec.onstart = () => setFase('ouvindo')
      rec.onresult = (e) => {
        let txt = ''
        for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript
        setTranscricao(txt)
        if (e.results[e.results.length - 1].isFinal) responder(txt)
      }
      rec.onerror = () => setFase(resposta ? 'pronto' : 'parado')
      rec.onend = () => setFase((f) => (f === 'ouvindo' ? (resposta ? 'pronto' : 'parado') : f))
      recRef.current = rec
      rec.start()
    } catch {
      setFase('parado')
    }
  }

  // O "mesmo botão" que o usuário pediu: uma ação por fase.
  function acaoPrincipal() {
    if (fase === 'ouvindo') {                       // ouvindo → para de ouvir
      try { recRef.current?.stop() } catch { /* noop */ }
      setFase(resposta ? 'pronto' : 'parado')
      return
    }
    if (fase === 'falando') {                        // lendo → para de ler
      try { window.speechSynthesis?.cancel() } catch { /* noop */ }
      setFase('pronto')
      return
    }
    if (fase === 'pronto' && resposta) { falar(resposta); return }  // lê a resposta (muda p/ roxo)
    ouvir()                                          // parado → começa a ouvir (muda p/ verde)
  }

  function enviarTexto(e) {
    e.preventDefault()
    if (!texto.trim()) return
    responder(texto.trim())
    setTexto('')
  }

  function fechar() {
    try { recRef.current?.stop() } catch { /* noop */ }
    try { window.speechSynthesis?.cancel() } catch { /* noop */ }
    setAberto(false); setFase('parado')
  }

  // rótulo/ícone do botão gigante por fase
  const temResp = !!resposta
  const BTN = ({
    parado:  { ic: '🎤', txt: 'TOQUE E FALE', sub: 'diga a sua pergunta' },
    ouvindo: { ic: '🎙️', txt: 'ESTOU OUVINDO…', sub: 'toque para parar' },
    pronto:  temResp
      ? { ic: '🔊', txt: 'OUVIR A RESPOSTA', sub: 'toque para ler em voz' }
      : { ic: '🎤', txt: 'TOQUE E FALE', sub: 'diga a sua pergunta' },
    falando: { ic: '🔊', txt: 'LENDO A RESPOSTA…', sub: 'toque para parar' },
  })[fase]

  return (
    <>
      <button className="assist-fab"
        aria-label={aberto ? 'Fechar assistente de voz' : 'Abrir assistente de voz'}
        title="Assistente de voz"
        onClick={() => (aberto ? fechar() : setAberto(true))}>
        🎤
      </button>

      {aberto && (
        <div className="assist-overlay" onClick={fechar}>
          <div className={`assist-panel fase-${fase}`} role="dialog"
            aria-label="Assistente de voz" onClick={(e) => e.stopPropagation()}>
            <div className="assist-head">
              <b>🎤 Assistente de voz</b>
              <button className="assist-x" aria-label="Fechar assistente" onClick={fechar}>✕ fechar</button>
            </div>

            {/* o que está sendo ouvido / a pergunta */}
            {transcricao && (
              <div className="assist-pergunta">
                Você perguntou:<br /><span>“{transcricao}”</span>
              </div>
            )}

            {/* a resposta, em texto GRANDE */}
            {resposta && (
              <div className="assist-resposta" aria-live="polite">{resposta}</div>
            )}

            {/* BOTÃO GIGANTE — a "forma grande em cor" que muda por fase */}
            <button className={`assist-big fase-${fase}`} onClick={acaoPrincipal}
              aria-label={`${BTN.txt}. ${BTN.sub}.`} aria-live="assertive">
              <span className="ab-ic" aria-hidden="true">{BTN.ic}</span>
              <span className="ab-txt">{BTN.txt}</span>
              <span className="ab-sub">{BTN.sub}</span>
            </button>

            {/* nova pergunta quando já existe resposta */}
            {resposta && fase !== 'ouvindo' && (
              <button className="assist-nova" onClick={ouvir} aria-label="Fazer uma nova pergunta">
                🎤 Nova pergunta
              </button>
            )}

            {!SR && (
              <div className="assist-aviso">
                Reconhecimento de voz indisponível neste navegador — digite abaixo (a resposta sai em áudio).
              </div>
            )}

            <form onSubmit={enviarTexto} className="assist-form">
              <input value={texto} onChange={(e) => setTexto(e.target.value)}
                placeholder="ou digite sua pergunta"
                aria-label="Digite sua pergunta" />
              <button className="btn" type="submit">Perguntar</button>
            </form>

            <div className="assist-dicas">
              Ex.: “quantos pedidos pra entregar”, “quais clientes da rota 01 do Sérgio”,
              “quantas sacolas na rota 01”, “quanto vou receber na rota 02 do Sérgio”.
            </div>
          </div>
        </div>
      )}
    </>
  )
}
