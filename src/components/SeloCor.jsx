import { fmtCores, hexCor, limpaCores } from '../utils.js'

// Cor da impressão do plástico, colada no produto como o SeloLinha: bolinha(s)
// com a cor + o nome. O NOME vai junto de propósito — na impressora P&B a
// bolinha preta e a vermelha saem iguais, e é pela cor que a sacola vai para a
// máquina certa.
export default function SeloCor({ cores }) {
  const lista = limpaCores(cores)
  if (!lista.length) return null
  return (
    <span className="selo-cor" title={`Impressão: ${fmtCores(lista)}`}>
      {lista.map((id) => (
        <span key={id} className="selo-cor-bola"
          style={{ background: hexCor(id) }} />
      ))}
      <span className="selo-cor-nm">{fmtCores(lista)}</span>
    </span>
  )
}
