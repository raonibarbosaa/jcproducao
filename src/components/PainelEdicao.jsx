import { useEffect, useRef } from 'react'

// Formulário de edição que se TRAZ PARA A TELA ao abrir.
// Sem isso o formulário aparece no topo da página enquanto o usuário está lá
// embaixo, no card em que acabou de clicar: nada visível acontece e a sensação
// é de botão quebrado.
//
// A posição é resolvida por `scrollIntoView` + `scroll-margin-top` (no CSS de
// .painel-edicao), e NÃO por conta na mão com getBoundingClientRect: o
// formulário entra ACIMA da lista, empurra todo o conteúdo para baixo e o
// navegador reajusta a rolagem (scroll anchoring) depois que a conta já foi
// feita — o resultado era rolar para o lado errado. O scroll-margin-top é o
// que impede o topo do formulário de ficar embaixo do cabeçalho sticky.
export default function PainelEdicao({ children }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // rolagem suave, salvo para quem pediu menos movimento no sistema
    const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' })

    // Rede de segurança: em ambiente onde a animação suave não roda, o
    // scrollIntoView com 'smooth' não sai do lugar e o usuário fica de novo com
    // "cliquei e nada aconteceu" — que é justamente o bug que isto conserta.
    // Se depois da animação o formulário ainda estiver fora de vista, vai direto.
    const confere = setTimeout(() => {
      const r = el.getBoundingClientRect()
      if (r.top < 0 || r.top > window.innerHeight - 60) el.scrollIntoView({ block: 'start' })
    }, 700)

    // pisca uma vez: confirma o que mudou mesmo para quem já estava vendo a área
    el.classList.add('edicao-destaque')
    const pisca = setTimeout(() => el.classList.remove('edicao-destaque'), 1200)
    return () => { clearTimeout(confere); clearTimeout(pisca) }
  }, [])

  return <div className="painel-edicao" ref={ref}>{children}</div>
}
