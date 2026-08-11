import { MODO_COR, MODO_NM, SIGLA_LINHA } from '../utils.js'

// Selo quadrado da linha de produção (S / G / Gr), na cor da linha — o mesmo
// símbolo que o designer marca na Triagem. Fica colado no nome do produto em
// todas as telas por onde o item anda, para o chão de fábrica reconhecer de
// onde aquele produto veio sem precisar ler nada.
// Na impressão vira quadrado branco com borda preta (ver @media print).
export default function SeloLinha({ linha }) {
  if (!linha || !SIGLA_LINHA[linha]) return null
  return (
    <span className="selo-linha" style={{ background: MODO_COR[linha] }} title={MODO_NM[linha]}>
      {SIGLA_LINHA[linha]}
    </span>
  )
}
