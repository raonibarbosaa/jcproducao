import { normaliza } from '../utils.js'

// Pinta no texto o pedaço que foi digitado — o mesmo serviço que o ⌘F do
// navegador prestava. Comparação sem acento e sem caixa (é o que `normaliza`
// faz), mas o recorte é feito no texto ORIGINAL, pelas posições: devolver o
// texto normalizado deixaria o cliente sem acento na tela.
export default function Realce({ texto, termo }) {
  const t = String(texto ?? '')
  const q = normaliza(termo || '')
  if (!q) return t
  const i = normaliza(t).indexOf(q)
  // a busca é tolerante (nome parecido); quando o pedaço não está literalmente
  // no texto não há o que sublinhar, e o card já está na lista por outro motivo
  if (i < 0) return t
  return <>{t.slice(0, i)}<mark className="hl">{t.slice(i, i + q.length)}</mark>{t.slice(i + q.length)}</>
}
