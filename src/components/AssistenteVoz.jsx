import { useState, useRef, useEffect } from 'react'
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
  const { vendedores, clientes, itens } = useCadastros()
  const [aberto, setAberto] = useState(false)
  const [fase, setFase] = useState('parado')      // parado | ouvindo | pronto | falando
  const [transcricao, setTranscricao] = useState('')
  const [resposta, setResposta] = useState('')
  const [texto, setTexto] = useState('')
  const recRef = useRef(null)
  const ultimaRef = useRef('')       // último texto ouvido (interim ou final)
  const processadoRef = useRef(false) // já viramos o texto em resposta?
  const vozRef = useRef(null)        // voz pt-BR escolhida (quando existir)
  const audioOkRef = useRef(false)   // já destravamos o áudio num gesto?

  // escolhe uma voz em português (as vozes chegam de forma assíncrona)
  useEffect(() => {
    const ss = typeof window !== 'undefined' ? window.speechSynthesis : null
    if (!ss) return
    const carrega = () => {
      const vs = ss.getVoices() || []
      vozRef.current = vs.find((v) => /pt[-_]?BR/i.test(v.lang)) || vs.find((v) => /^pt/i.test(v.lang)) || null
    }
    carrega()
    ss.addEventListener?.('voiceschanged', carrega)
    return () => ss.removeEventListener?.('voiceschanged', carrega)
  }, [])

  // Destrava o áudio da SESSÃO num gesto do usuário (iOS/Chrome mobile bloqueiam
  // fala que não venha de um toque). Fala um utterance MUDO uma única vez —
  // feito ao ABRIR o painel (sem microfone ativo, sem interferir no reconhecimento).
  function destravarAudio() {
    const ss = window.speechSynthesis
    if (!ss) return
    try {
      ss.resume()
      if (!audioOkRef.current && !ss.speaking) {
        const u = new SpeechSynthesisUtterance(' ')
        u.volume = 0
        ss.speak(u)
        audioOkRef.current = true
      }
    } catch { /* noop */ }
  }

  function falar(msg) {
    const ss = window.speechSynthesis
    if (!ss || !msg) { setFase('pronto'); return }
    try {
      ss.resume()
      const u = new SpeechSynthesisUtterance(msg)
      u.lang = 'pt-BR'
      if (vozRef.current) u.voice = vozRef.current
      u.rate = 0.95           // um tiquinho mais devagar, mais claro
      u.onstart = () => setFase('falando')
      u.onend = () => setFase('pronto')
      u.onerror = () => setFase('pronto')
      if (ss.speaking || ss.pending) {
        // tem fala em curso: cancela e fala com um respiro (cancel→speak
        // imediato é engolido pelo Chrome)
        ss.cancel()
        setTimeout(() => { try { ss.speak(u) } catch { setFase('pronto') } }, 140)
      } else {
        // caminho normal: fala SÍNCRONO dentro do gesto (essencial no iOS/mobile)
        ss.speak(u)
      }
      // watchdog: se a fala não começar, volta pro estado "ouvir de novo"
      setTimeout(() => { if (!ss.speaking && !ss.pending) setFase('pronto') }, 1800)
    } catch {
      setFase('pronto')       // sem síntese: a resposta fica só na tela (grande)
    }
  }

  // vira a pergunta em resposta E JÁ LÊ EM VOZ (automático).
  function responder(pergunta) {
    processadoRef.current = true
    const r = responderPergunta(pergunta, pedidos, vendedores, clientes, itens)
    setTranscricao(pergunta)
    setResposta(r)
    falar(r)                  // lê a resposta automaticamente (muda p/ roxo)
  }

  function ouvir() {
    setTranscricao(''); setResposta('')
    ultimaRef.current = ''
    processadoRef.current = false
    try { window.speechSynthesis?.cancel() } catch { /* noop */ }
    if (!SR) {
      const m = 'O reconhecimento de voz não está disponível neste navegador. Digite a pergunta no campo de texto.'
      setResposta(m); falar(m)
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
        ultimaRef.current = txt
        setTranscricao(txt)
        // se o navegador marcou como final, já responde (e lê)
        if (e.results[e.results.length - 1].isFinal && !processadoRef.current) responder(txt)
      }
      rec.onerror = () => { if (!processadoRef.current) setFase(resposta ? 'pronto' : 'parado') }
      rec.onend = () => {
        // ao parar (manual ou pausa da fala): se ainda não respondeu, usa o que ouviu
        if (processadoRef.current) return
        const txt = ultimaRef.current.trim()
        if (txt) responder(txt)               // → lê automaticamente
        else setFase((f) => (f === 'ouvindo' ? 'parado' : f))
      }
      recRef.current = rec
      rec.start()
    } catch {
      setFase('parado')
    }
  }

  // O "mesmo botão": uma ação por fase. Sempre destrava o áudio (é um gesto).
  function acaoPrincipal() {
    destravarAudio()
    if (fase === 'ouvindo') {                       // ouvindo → PARA e JÁ LÊ a resposta
      try { recRef.current?.stop() } catch { /* noop */ }
      const txt = ultimaRef.current.trim()
      // dispara a leitura AQUI (dentro do gesto) — mobile exige gesto p/ falar
      if (txt && !processadoRef.current) responder(txt)
      return
    }
    if (fase === 'falando') {                        // lendo → para de ler
      try { window.speechSynthesis?.cancel() } catch { /* noop */ }
      setFase('pronto')
      return
    }
    if (fase === 'pronto' && resposta) { falar(resposta); return }  // ouvir de novo
    ouvir()                                          // parado → começa a ouvir (muda p/ verde)
  }

  function enviarTexto(e) {
    e.preventDefault()
    destravarAudio()
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
    ouvindo: { ic: '🎙️', txt: 'ESTOU OUVINDO…', sub: 'toque para parar e ouvir a resposta' },
    pronto:  temResp
      ? { ic: '🔊', txt: 'OUVIR DE NOVO', sub: 'toque para ler a resposta outra vez' }
      : { ic: '🎤', txt: 'TOQUE E FALE', sub: 'diga a sua pergunta' },
    falando: { ic: '🔊', txt: 'LENDO A RESPOSTA…', sub: 'toque para parar' },
  })[fase]

  return (
    <>
      <button className="assist-fab"
        aria-label={aberto ? 'Fechar assistente de voz' : 'Abrir assistente de voz'}
        title="Assistente de voz"
        onClick={() => { if (aberto) { fechar() } else { destravarAudio(); setAberto(true) } }}>
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

            <div className="assist-aviso">🔊 Se não ouvir a resposta, aumente o volume do aparelho.</div>

            <div className="assist-dicas">
              Ex.: “quantas sacolas por produto no mês”, “quantas etiquetas por produto no mês”,
              “quantas alças por produto no mês”, “quais produtos de papel”,
              “quantas sacolas da [produto] no mês”, “quantos pedidos pra entregar”.
            </div>
          </div>
        </div>
      )}
    </>
  )
}
