// Rodapé com crédito da Totali. Logo oficial (versão branca, p/ fundo escuro).
import totaliLogo from '../assets/totali-branca.png'

export default function Footer() {
  return (
    <footer className="app-footer no-print">
      <span className="af-frase">Solução desenvolvida por</span>
      <img src={totaliLogo} className="af-img" alt="Totali Soluções Contábeis" />
    </footer>
  )
}
