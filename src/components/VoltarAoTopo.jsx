import { useEffect, useState } from 'react'

const APARECE_APOS = 400   // px de rolagem

// Botão "voltar ao topo", em todas as telas. As listas do sistema são longas
// (209 pedidos, dezenas de cadastros) e os filtros e o botão de novo cadastro
// ficam todos no alto — sem isso, é rolagem na mão até em cima toda vez.
// `desviaDaVoz` sobe o botão quando o 🎤 do assistente está na tela, para os
// dois não ficarem um em cima do outro.
export default function VoltarAoTopo({ desviaDaVoz }) {
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    const aoRolar = () => setVisivel(window.scrollY > APARECE_APOS)
    aoRolar()
    window.addEventListener('scroll', aoRolar, { passive: true })
    return () => window.removeEventListener('scroll', aoRolar)
  }, [])

  if (!visivel) return null

  return (
    <button
      className={`topo-fab no-print${desviaDaVoz ? ' com-voz' : ''}`}
      title="Voltar ao topo"
      aria-label="Voltar ao topo da página"
      onClick={() => window.scrollTo({
        top: 0,
        // rolagem suave, salvo para quem pediu menos movimento no sistema
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      })}
    >
      ↑
    </button>
  )
}
