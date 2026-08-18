import { useEffect, useRef, useState } from 'react'
import { collection, onSnapshot, doc, getDoc, setDoc, deleteDoc, updateDoc, deleteField } from 'firebase/firestore'
import { db } from '../firebase.js'
import { fmtData, fmtMoeda, ORIGEM_NM, nomeCliente, keyDoItem, valorDosItens, linhaDoItem,
  mapaEtapasComQtd, mapaEtapasMovendoVolumes, temVolumes, volumesNaEtapa,
  arredondaQtd, casaBusca, normaliza, doDoc } from '../utils.js'
import SeloLinha from '../components/SeloLinha.jsx'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'

export default function Entregues() {
  const [itens, setItens] = useState([])
  const { clientes } = useCadastros()
  const { perfil, nome } = useAuth()
  const podeCancelar = perfil === 'dono' || perfil === 'designer'
  const podeBaixa = perfil === 'dono' || perfil === 'financeiro'   // baixa financeira
  const [busca, setBusca] = useState('')
  const [motoristaFiltro, setMotoristaFiltro] = useState('')
  const [soPendentes, setSoPendentes] = useState(false)
  const [salvando, setSalvando] = useState('')

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'entregues'), (snap) => {
      // ⚠️ `id` DEPOIS do spread, e não antes. O doc da remessa nasce de um
      // `...pedido` que já carrega o campo `id` (o id do doc em `pedidos`), então
      // com `{id: d.id, ...d.data()}` o campo gravado SOBRESCREVIA o id do
      // documento: `p.id` virava "5001" quando o doc é "5001-1". Cancelar a
      // entrega apagava `entregues/5001`, que não existe — o Firestore não
      // reclama de apagar o que não há, então a quantidade voltava para o pedido
      // e o card CONTINUAVA na tela. E duas remessas do mesmo pedido ficavam com
      // a mesma `key` no React, que aí desenha card trocado.
      setItens(snap.docs.map(doDoc))
    })
    return unsub
  }, [])

  // motoristas que aparecem no histórico (inclui inativos/antigos)
  const motoristasNasEntregas = [...new Set(itens.map((p) => p.motorista).filter(Boolean))].sort()

  // Devolve os itens desta REMESSA para o pedido e apaga o registro da entrega.
  // `destino` é a etapa em que eles voltam — hoje sempre 'expedicao': a
  // mercadoria está de novo na mão da fábrica, e é de lá que ela entra numa
  // carga nova.
  //
  // ⚠️ Item embalado anda por VOLUME, não por quantidade solta. Devolver tudo
  // por quantidade era no-op silencioso nesses itens: `mapaEtapasComQtd`
  // PRESERVA a entrada que tem volumes (para não apagar o que a balança pesou),
  // então o registro da entrega sumia e o item continuava marcado como entregue.
  function devolve(base, voltando, de, destino) {
    const movs = []
    voltando.forEach((it, n) => {
      const k = it.key || keyDoItem({ itens: voltando }, n)
      const idx = (base.itens || []).findIndex((x, i) => (x.key || keyDoItem(base, i)) === k)
      if (idx >= 0) movs.push({ idx, de, para: destino, qtd: arredondaQtd(it.qtd) })
    })
    // Sem casar nenhum item, gravar o mapa apagaria as etapas do pedido inteiro.
    // Melhor parar e dizer — que é o oposto do que esta tela fazia.
    if (!movs.length) throw new Error('Nao achei os itens desta remessa dentro do pedido - nada foi alterado.')
    // pedido misto (um item embalado, outro nao) e normal: aplica os dois, cada
    // um congelando o que nao e dele
    const comVol = movs
      .filter((m) => temVolumes(base, m.idx))
      .map((m) => ({ idx: m.idx, ids: volumesNaEtapa(base, m.idx, de), para: destino }))
      .filter((m) => m.ids.length)
    const semVol = movs.filter((m) => !temVolumes(base, m.idx))
    let etapas = base.etapas
    if (comVol.length) etapas = mapaEtapasMovendoVolumes(base, comVol, nome)
    if (semVol.length) etapas = mapaEtapasComQtd({ ...base, etapas }, semVol, nome)
    return etapas
  }

  async function devolverAoPedido(p, destino) {
    const { id, entregueEm, motorista, pago, pagoPor, pagoEm,
            remessa, parcial, itensPendentes, ...pedido } = p
    const voltando = pedido.itens || []            // itens DESTA remessa (qtd = o que saiu)
    const agora = new Date().toISOString()
    const ref = doc(db, 'pedidos', String(p.idVenda))
    const atual = await getDoc(ref)

    if (atual.exists()) {
      // entrega parcial: o resto ficou em producao, entao o pedido existe e o
      // que volta e a quantidade que esta como `entregue`
      await updateDoc(ref, { etapas: devolve(atual.data(), voltando, 'entregue', destino) })
    } else if (pedido.etapas) {
      // O pedido saiu inteiro e foi apagado de `pedidos`. As `etapas` guardadas
      // na remessa sao o retrato de ANTES da entrega - recriar a partir delas
      // traz de volta os VOLUMES (o que a montagem pesou), que a reconstrucao
      // por quantidade perderia calada.
      const itens = voltando.map((it) => ({ ...it, qtd: arredondaQtd(it.qtdItem ?? it.qtd) }))
      const antes = { ...pedido, itens }
      await setDoc(ref, {
        ...antes,
        etapas: devolve(antes, voltando, 'expedido', destino),
        remessas: remessa ? remessa - 1 : 0,
      })
    } else {
      // remessa antiga (ou da conciliacao), sem retrato das etapas: reconstroi
      // por quantidade. O que nao veio nesta remessa foi entregue em outra e
      // continua `entregue` - senao reapareceria na producao.
      const itens = voltando.map((it) => ({ ...it, qtd: arredondaQtd(it.qtdItem ?? it.qtd) }))
      const etapas = {}
      itens.forEach((it, i) => {
        const k = it.key || keyDoItem({ itens }, i)
        const devolvido = arredondaQtd(voltando[i].qtd)
        const total = arredondaQtd(it.qtd)
        etapas[k] = {
          montagem: 0, expedicao: 0, expedido: 0,
          entregue: Math.max(0, arredondaQtd(total - devolvido)),
          por: nome || '', em: agora,
        }
        etapas[k][destino] = arredondaQtd((etapas[k][destino] || 0) + devolvido)
      })
      await setDoc(ref, { ...pedido, itens, etapas, remessas: remessa ? remessa - 1 : 0 })
    }
    await deleteDoc(doc(db, 'entregues', p.id))
  }

  // CANCELAR A ENTREGA = a mercadoria esta de volta com a fabrica, entao ela
  // volta para a EXPEDICAO (a coluna do quadro), nao para `expedido`. Em
  // `expedido` ela apareceria na Rota como pronta para sair de novo, sem
  // ninguem ter conferido o que voltou no caminhao.
  //
  // O botao "Retornar para Expedicao" (que so aparecia em pedido de grafica)
  // foi fundido aqui: com o mesmo destino, eram a mesma acao com dois nomes.
  async function cancelarEntrega(p) {
    if (!confirm(
      `Cancelar a entrega do pedido #${p.idVenda} - ${nomeCliente(p.cliente, clientes)}`
      + `${p.remessa > 1 ? ` (remessa ${p.remessa})` : ''}?\n\n`
      + `${p.itens?.length || 0} item(ns) voltam para a EXPEDICAO, no quadro de producao, `
      + `e este registro sai do historico de entregas.`)) return
    setSalvando(p.id)
    try {
      await devolverAoPedido(p, 'expedicao')
    } catch (e) {
      // ⚠️ Antes esta funcao nao tinha try/catch: qualquer falha morria no
      // console e a tela ficava igual, como se o clique nao tivesse valido.
      console.error('Erro ao cancelar entrega:', e)
      alert('Nao foi possivel cancelar a entrega: ' + (e.code || e.message))
    } finally { setSalvando('') }
  }

  // baixa financeira: confirma o pagamento e fecha a remessa
  async function darBaixa(p) {
    await updateDoc(doc(db, 'entregues', p.id), {
      pago: true, pagoPor: nome || '', pagoEm: new Date().toISOString(),
    })
  }
  async function desfazerBaixa(p) {
    if (!confirm(`Reabrir o pagamento do pedido #${p.idVenda}? Ele volta para "pendente".`)) return
    await updateDoc(doc(db, 'entregues', p.id), {
      pago: false, pagoPor: deleteField(), pagoEm: deleteField(),
    })
  }

  // número do pedido é dígito: casa por pedaço exato (5111 não pode trazer 5118).
  // O resto vai pela busca tolerante das outras telas (nome parecido, apelido).
  const termo = busca.trim()
  const lista = itens
    .filter((p) =>
      !termo ||
      String(p.idVenda).includes(termo) ||
      casaBusca(termo, p.cliente, nomeCliente(p.cliente, clientes), p.cidade)
    )
    .filter((p) => {
      if (!motoristaFiltro) return true
      if (motoristaFiltro === '__sem__') return !p.motorista
      return p.motorista === motoristaFiltro
    })
    .filter((p) => !soPendentes || !p.pago)
    .sort((a, b) => new Date(b.entregueEm) - new Date(a.entregueEm))

  // Total: com entrega parcial o mesmo pedido aparece em várias remessas, então o
  // valor do pedido só pode ser contado UMA vez (enquanto não houver valor por item).
  const valorRemessa = (p) => valorDosItens(p, (p.itens || []).map((_, i) => i))
  let totalMes = 0
  const jaContado = new Set()
  for (const p of lista) {
    const v = valorRemessa(p)
    if (v !== null) { totalMes += v; continue }
    if (!jaContado.has(p.idVenda)) { jaContado.add(p.idVenda); totalMes += Number(p.valorTotal) || 0 }
  }
  const nPendentes = itens.filter((p) => !p.pago).length

  // O PEDIDO PROCURADO — digitou o número, é ELE que a pessoa quer ver. A lista
  // já vem filtrada, mas com entrega parcial o mesmo número vira várias remessas
  // e o cliente certo pode estar no meio de homônimos: sem marcar qual é, sobra
  // procurar com o ⌘F do navegador (foi o que o dono acabou fazendo).
  // Só marca quando o termo é NÚMERO e casa com o id inteiro — "MODAS" não tem
  // alvo, tem resultado, e pintar tudo de destaque não destaca nada.
  const ehNumero = /^\d+$/.test(termo)
  const alvo = ehNumero ? String(Number(termo)) : ''
  const ehAlvo = (p) => !!alvo && String(p.idVenda) === alvo
  const nAlvo = lista.filter(ehAlvo).length
  const idxAlvo = lista.findIndex(ehAlvo)
  // ⚠️ o alvo pode existir e estar escondido por OUTRO filtro (só pendentes,
  // motorista). Dizer "não existe" nesse caso manda a pessoa procurar o pedido
  // em outra tela quando ele está bem ali, atrás de um checkbox.
  const alvoEscondido = !!alvo && nAlvo === 0 && itens.some(ehAlvo)

  // leva o primeiro à vista: o card pode estar abaixo da dobra com 248 entregas
  const refAlvo = useRef(null)
  useEffect(() => {
    if (!alvo || !refAlvo.current) return
    refAlvo.current.scrollIntoView({ block: 'center',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [alvo, nAlvo])

  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">Entregues
          <small>{lista.length} pedidos · {fmtMoeda(totalMes)}{nPendentes > 0 ? ` · ${nPendentes} pendente(s) de baixa` : ''}</small>
        </h1>
        <div className="spacer" />
        {(podeBaixa || nPendentes > 0) && (
          <label className="filter-pill">
            <input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} />
            Só pendentes de baixa
          </label>
        )}
        {motoristasNasEntregas.length > 0 && (
          <select className="btn" style={{ minWidth: 170 }}
            value={motoristaFiltro} onChange={(e) => setMotoristaFiltro(e.target.value)}>
            <option value="">🚚 Todos os motoristas</option>
            {motoristasNasEntregas.map((m, i) => <option key={i} value={m}>{m}</option>)}
            <option value="__sem__">— sem motorista —</option>
          </select>
        )}
        <input className="btn" style={{ minWidth: 200 }} placeholder="Buscar cliente/cidade/ID…"
          value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {termo && (
        <div className="qv-resumo">
          {lista.length} de {itens.length} entrega(s) · busca "{termo}"
          {ehNumero && (nAlvo
            ? ` · pedido #${alvo} destacado abaixo${nAlvo > 1 ? ` (${nAlvo} remessas)` : ''}`
            : alvoEscondido
              ? ` · o pedido #${alvo} está entregue, mas escondido pelos outros filtros`
              : ` · nenhuma entrega com o número ${termo}`)}
        </div>
      )}

      {lista.length === 0 ? (
        <div className="empty"><div className="big">{termo ? '🔎' : '📦'}</div>
          {termo
            ? <>Nenhuma entrega encontrada para "{termo}".
                <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-faint)' }}>
                  Se o pedido ainda não foi entregue, ele está na Produção ou na Rota — não aqui.
                </div></>
            : 'Nenhuma entrega registrada ainda.'}
        </div>
      ) : (
        <div className="cards">
          {lista.map((p, n) => (
            <div key={p.id} className={`card em_dia${ehAlvo(p) ? ' card-alvo' : ''}`}
              ref={n === idxAlvo ? refAlvo : null}>
              <div className="card-top">
                <div className="cliente"><Realce texto={nomeCliente(p.cliente, clientes)} termo={termo} /></div>
                <div className="idv">#<Realce texto={String(p.idVenda)} termo={termo} />
                  {p.remessa > 1 ? ` · remessa ${p.remessa}` : ''}</div>
              </div>
              <div className="meta-row">
                {p.origem && <span className={`chip origem-${p.origem.toLowerCase()}`}>{ORIGEM_NM[p.origem] || p.origem}</span>}
                <span className="chip">{p.vendedor}</span>
                <span className="chip">{p.cidade || '—'}</span>
                {p.parcial && (
                  <span className="chip rota-warn" title="O resto do pedido ficou em produção">
                    📦 entrega parcial · faltaram {p.itensPendentes} item(ns)
                  </span>
                )}
                {p.motorista && <span className="chip">🚚 {p.motorista}</span>}
                <span className="chip" style={{ color: 'var(--ok)' }}>✓ {fmtData(p.entregueEm)}</span>
                {p.pago
                  ? <span className="chip" style={{ borderColor: 'var(--ok)', color: 'var(--ok)' }} title={`Baixa por ${p.pagoPor || '—'}${p.pagoEm ? ` em ${fmtData(p.pagoEm)}` : ''}`}>💰 pago</span>
                  : <span className="chip rota-warn">⏳ pendente de baixa</span>}
              </div>
              <ul className="itens">
                {p.itens?.map((it, i) => (
                  <li key={i}><span><SeloLinha linha={linhaDoItem(p, i)} />{it.produto}</span><span className="q">{it.qtd}</span></li>
                ))}
              </ul>
              <div className="valor" style={{ marginTop: 8 }}>
                {valorRemessa(p) !== null
                  ? fmtMoeda(valorRemessa(p))
                  : <>{fmtMoeda(p.valorTotal)} {p.parcial && <small style={{ color: 'var(--text-faint)', fontWeight: 400 }}>total do pedido</small>}</>}
              </div>
              {(podeCancelar || podeBaixa) && (
                <div className="modo-btns" style={{ marginTop: 10 }}>
                  {podeBaixa && (
                    p.pago
                      ? <button className="modo-btn" onClick={() => desfazerBaixa(p)}>↩ desfazer baixa</button>
                      : <button className="modo-btn" onClick={() => darBaixa(p)} style={{ color: 'var(--ok)', borderColor: 'var(--ok)' }}>💰 Dar baixa (pago)</button>
                  )}
                  {podeCancelar && (
                    <button className="modo-btn" disabled={!!salvando}
                      onClick={() => cancelarEntrega(p)} style={{ color: 'var(--danger)' }}
                      title="A entrega nao aconteceu: os itens voltam para a Expedicao no quadro de producao">
                      {salvando === p.id ? 'Devolvendo…' : '↩ Cancelar entrega (volta p/ Expedição)'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// Pinta no texto o pedaço que foi digitado — o mesmo serviço que o ⌘F do
// navegador prestava. Comparação sem acento e sem caixa (é o que `normaliza`
// faz), mas o recorte é feito no texto ORIGINAL, pelas posições: devolver o
// texto normalizado deixaria o cliente sem acento na tela.
function Realce({ texto, termo }) {
  const t = String(texto ?? '')
  const q = normaliza(termo || '')
  if (!q) return t
  const i = normaliza(t).indexOf(q)
  // a busca é tolerante (nome parecido); quando o pedaço não está literalmente
  // no texto não há o que sublinhar, e o card já está na lista por outro motivo
  if (i < 0) return t
  return <>{t.slice(0, i)}<mark className="hl">{t.slice(i, i + q.length)}</mark>{t.slice(i + q.length)}</>
}
