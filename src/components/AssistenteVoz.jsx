import { useState, useRef } from 'react'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import { responderPergunta } from '../utils.js'

// reconhecimento de voz: bom no Chrome, instável no Safari.
// A SÍNTESE de voz (falar a resposta) funciona nos dois.
const SR = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null

export default function AssistenteVoz({ pedidos }) {
  const { vendedores } = useCadastros()
  const [aberto, setAberto] = useState(false)
  const [ouvindo, setOuvindo] = useState(false)
  const [transcricao, setTranscricao] = useState('')
  const [resposta, setResposta] = useState('')
  const [texto, setTexto] = useState('')
  const recRef = useRef(null)

  function falar(msg) {
    setResposta(msg)
    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(msg)
      u.lang = 'pt-BR'
      window.speechSynthesis.speak(u)
    } catch { /* síntese indisponível: a resposta fica só na tela */ }
  }

  function responder(pergunta) {
    setTranscricao(pergunta)
    falar(responderPergunta(pergunta, pedidos, vendedores))
  }

  function ouvir() {
    if (!SR) {
      falar('O reconhecimento de voz não está disponível neste navegador. Use o campo de texto.')
      return
    }
    try {
      const rec = new SR()
      rec.lang = 'pt-BR'
      rec.interimResults = false
      rec.maxAlternatives = 1
      rec.onstart = () => { setOuvindo(true); setTranscricao(''); setResposta('') }
      rec.onresult = (e) => responder(e.results[0][0].transcript)
      rec.onerror = () => { setOuvindo(false); falar('Não consegui ouvir. Tente de novo.') }
      rec.onend = () => setOuvindo(false)
      recRef.current = rec
      window.speechSynthesis?.cancel()
      rec.start()
    } catch {
      setOuvindo(false)
    }
  }

  function enviarTexto(e) {
    e.preventDefault()
    if (!texto.trim()) return
    responder(texto.trim())
    setTexto('')
  }

  return (
    <>
      <button className="assist-fab"
        aria-label={aberto ? 'Fechar assistente de voz' : 'Abrir assistente de voz'}
        title="Assistente de voz"
        onClick={() => setAberto((v) => !v)}>
        🎤
      </button>

      {aberto && (
        <div className="assist-panel" role="dialog" aria-label="Assistente de voz">
          <div className="assist-head">
            <b>🎤 Assistente de voz</b>
            <button className="assist-x" aria-label="Fechar assistente" onClick={() => setAberto(false)}>✕</button>
          </div>

          <button className="btn primary assist-mic" onClick={ouvir} disabled={ouvindo}
            aria-label="Tocar e falar a pergunta">
            {ouvindo ? '🔴 Ouvindo…' : '🎤 Tocar e falar'}
          </button>

          {!SR && (
            <div className="assist-aviso">
              Reconhecimento de voz indisponível neste navegador — digite abaixo (a resposta sai em áudio).
            </div>
          )}

          <form onSubmit={enviarTexto} className="assist-form">
            <input value={texto} onChange={(e) => setTexto(e.target.value)}
              placeholder="ou digite: quantos pedidos do Sérgio?"
              aria-label="Digite sua pergunta" />
            <button className="btn" type="submit">Perguntar</button>
          </form>

          {transcricao && <div className="assist-pergunta">Você: “{transcricao}”</div>}

          {resposta && (
            <div className="assist-resposta" aria-live="polite">
              {resposta}
              <button className="assist-repetir" aria-label="Repetir resposta em áudio"
                onClick={() => falar(resposta)}>🔊 repetir</button>
            </div>
          )}

          <div className="assist-dicas">
            Ex.: “quantos pedidos pra entregar”, “quantos pedidos do Sérgio”,
            “quantas sacolas na rota 01”, “quanto vou receber na rota 02 do Sérgio”.
          </div>
        </div>
      )}
    </>
  )
}
