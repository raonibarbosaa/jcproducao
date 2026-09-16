import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, addDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  EMPRESAS, EMPRESA_PADRAO, nomeEmpresa, FORMAS_PGTO, nomeForma,
  contasDaEmpresa, nomeConta, arredondaMoeda, hojeISO,
  entregasParaCobrar, itensDoPedidoInteiro, valorDeTabela, fatorDesconto,
  geraParcelas, situacaoDaCobranca, SITUACAO_COBRANCA, cobrancasVivas,
  movimentosVivos, totaisReceber,
  fmtMoeda, fmtData, fmtDia, fmtDataHora, nomeCliente, casaBusca, doDoc, veFinanceiro,
} from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import SubTabs from '../components/SubTabs.jsx'
import Realce from '../components/Realce.jsx'

// ============================================================
// FINANCEIRO — CONTAS A RECEBER (Fase 1). Desenho: FINANCEIRO.md
//
// Antes disto o sistema tinha um INTERRUPTOR (`entregues.pago`), não um
// financeiro: não havia quanto, quando, como, o que falta nem em qual banco
// caiu. Aqui a entrega vira COBRANÇA (com parcelas e vencimento) e o dinheiro
// vira MOVIMENTO (o livro-caixa, que a conciliação de OFX vai usar depois).
//
// ⚠️ A cobrança NÃO guarda "quanto já recebi". O saldo é somado no render a
// partir dos movimentos — total desnormalizado diverge em silêncio.
// ============================================================
export default function Financeiro({ pedidos }) {
  const { perfil, nome, user } = useAuth()
  const { clientes, itens: itensCad } = useCadastros()
  const [entregues, setEntregues] = useState([])
  const [cobrancas, setCobrancas] = useState([])
  const [movimentos, setMovimentos] = useState([])
  const [empresa, setEmpresa] = useState(EMPRESA_PADRAO)
  const [aba, setAba] = useState('cobrar')
  const [lancando, setLancando] = useState(null)   // entrega (ou {manual:true}) no modal
  const [recebendo, setRecebendo] = useState(null) // { cob, parcela }

  useEffect(() => {
    const un = [
      onSnapshot(collection(db, 'entregues'), (s) => setEntregues(s.docs.map(doDoc)),
        (e) => console.error('entregues:', e)),
      onSnapshot(collection(db, 'cobrancas'), (s) => setCobrancas(s.docs.map(doDoc)),
        (e) => console.error('cobrancas:', e)),
      onSnapshot(collection(db, 'movimentos'), (s) => setMovimentos(s.docs.map(doDoc)),
        (e) => console.error('movimentos:', e)),
    ]
    return () => un.forEach((f) => f())
  }, [])

  // A empresa é EIXO: cada aba enxerga só os lançamentos dela.
  const cobrancasEmp = useMemo(
    () => cobrancas.filter((c) => (c.empresa || EMPRESA_PADRAO) === empresa),
    [cobrancas, empresa])
  const movimentosEmp = useMemo(
    () => movimentos.filter((m) => (m.empresa || EMPRESA_PADRAO) === empresa),
    [movimentos, empresa])

  // ⚠️ a fila "a cobrar" desconta sobre TODAS as cobranças, não só as da
  // empresa da tela: uma cobrança lançada na empresa errada tem que continuar
  // travando a entrega, senão ela seria cobrada duas vezes.
  const aCobrar = useMemo(
    () => entregasParaCobrar(entregues, cobrancas, pedidos, itensCad),
    [entregues, cobrancas, pedidos, itensCad])

  const totais = totaisReceber(cobrancasEmp, movimentosEmp)
  const vencidas = cobrancasVivas(cobrancasEmp)
    .filter((c) => situacaoDaCobranca(c, movimentosEmp).st === 'vencida').length

  if (!veFinanceiro(perfil)) {
    return <div className="empty">Esta tela é do financeiro e do dono.</div>
  }

  const abas = [
    { id: 'cobrar', label: 'A cobrar', badge: empresa === 'sacolas' && aCobrar.length ? aCobrar.length : 0 },
    { id: 'aberto', label: 'Em aberto', badge: vencidas || 0 },
    { id: 'caixa', label: 'Recebimentos' },
  ]

  return (
    <>
      <div className="page-title">
        <h2>Financeiro</h2>
        <small>Contas a receber · {nomeEmpresa(empresa)}</small>
      </div>

      <div className="fin-topo no-print">
        <div className="modo-btns">
          {EMPRESAS.map((e) => (
            <button key={e.id}
              className={'modo-btn' + (empresa === e.id ? ' ativo' : '')}
              onClick={() => setEmpresa(e.id)}
              style={empresa === e.id
                ? { background: 'var(--accent)', color: '#1a1205', borderColor: 'var(--accent)' }
                : null}>
              {e.nome}
            </button>
          ))}
        </div>
        <div className="fin-cards">
          <Card rot="A receber" v={totais.aberto} />
          <Card rot="Vencido" v={totais.vencido} cor="var(--danger)" />
          <Card rot="Recebido no mês" v={totais.recebidoNoMes} cor="var(--ok)" />
        </div>
      </div>

      <SubTabs abas={abas} ativa={aba} onTrocar={setAba} />

      {aba === 'cobrar' && (
        <AbaCobrar lista={aCobrar} empresa={empresa} clientes={clientes}
          onLancar={setLancando} />
      )}
      {aba === 'aberto' && (
        <AbaAberto cobrancas={cobrancasEmp} movimentos={movimentosEmp} clientes={clientes}
          nome={nome} onReceber={setRecebendo} />
      )}
      {aba === 'caixa' && (
        <AbaCaixa movimentos={movimentosEmp} empresa={empresa} clientes={clientes} nome={nome} />
      )}

      {lancando && (
        <ModalCobranca entrega={lancando} empresa={empresa} pedidos={pedidos}
          entregues={entregues} cobrancas={cobrancas} itensCad={itensCad}
          clientes={clientes} nome={nome} uid={user?.uid}
          onFechar={() => setLancando(null)} />
      )}
      {recebendo && (
        <ModalReceber alvo={recebendo} empresa={empresa} nome={nome} uid={user?.uid}
          clientes={clientes} onFechar={() => setRecebendo(null)} />
      )}
    </>
  )
}

const Card = ({ rot, v, cor }) => (
  <div className="fin-card">
    <span>{rot}</span>
    <b style={cor ? { color: cor } : null}>{fmtMoeda(v)}</b>
  </div>
)

// ============================================================
// ABA 1 — A COBRAR: a fila de trabalho do dia
// ============================================================
// corte da fila. Não é para esconder: é para a tela não montar mil cards de uma
// vez. O rodapé DIZ quantas ficaram de fora — lista truncada em silêncio passa
// por lista completa (a mesma regra do LIMITE_BUSCA no Localizar).
const LIMITE_FILA = 60

export function AbaCobrar({ lista, empresa, clientes, onLancar }) {
  const [busca, setBusca] = useState('')
  const [tudo, setTudo] = useState(false)

  // As entregas nascem no sistema de produção, que é da JC Sacolas. Dizer isso é
  // melhor do que mostrar uma lista vazia e deixar a pessoa achar que quebrou.
  if (empresa !== 'sacolas') {
    return (
      <div className="fin-vazio">
        <p><b>As entregas vêm do sistema de produção da JC Sacolas.</b></p>
        <p>A JC Plástico não tem pedidos aqui — a cobrança dela é lançada à mão,
          com cliente, valor e vencimento.</p>
        <button className="btn" onClick={() => onLancar({ manual: true })}>
          + Lançar cobrança à mão
        </button>
      </div>
    )
  }

  const termo = busca.trim()
  const vis = lista.filter((e) => !termo
    || String(e.idVenda).includes(termo)
    || casaBusca(termo, e.cliente, nomeCliente(e.cliente, clientes), e.cidade))
  const mostrando = tudo ? vis : vis.slice(0, LIMITE_FILA)

  return (
    <>
      <div className="toolbar no-print">
        <input className="fin-busca" placeholder="Pedido, cliente ou cidade…"
          value={busca} onChange={(ev) => setBusca(ev.target.value)} />
        <span className="chip">{vis.length} entrega(s) sem cobrança</span>
        <button className="btn" onClick={() => onLancar({ manual: true })}>
          + Cobrança à mão
        </button>
      </div>

      {!vis.length && (
        <div className="fin-vazio">
          {lista.length
            ? <p>Nenhuma entrega casa com “{termo}”.</p>
            : <p><b>Tudo cobrado.</b> Toda entrega já virou cobrança.</p>}
        </div>
      )}

      <div className="cards">
        {mostrando.map((e) => (
          <div className="card fin-linha" key={e.id}>
            <div className="fin-linha-top">
              <b><Realce texto={`#${e.idVenda}`} termo={termo} /></b>
              <span className="fin-cli">
                <Realce texto={nomeCliente(e.cliente, clientes)} termo={termo} />
              </span>
              {e.remessa > 1 || e.parcial
                ? <span className="chip">remessa {e.remessa || 1}</span> : null}
              {e.cidade ? <span className="chip">{e.cidade}</span> : null}
            </div>
            <div className="fin-linha-meta">
              <span>entregue em {fmtData(e.entregueEm)}</span>
              {e.motorista ? <span>🚚 {e.motorista}</span> : null}
              <span>{(e.itens || []).length} item(ns)</span>
            </div>
            <div className="fin-linha-fim">
              {e.sugestao?.valor != null
                ? (
                  <span className="fin-valor">
                    {fmtMoeda(e.sugestao.valor)}
                    {e.sugestao.exato
                      ? null
                      : <em title={`Rateado pelo valor de tabela, com o desconto do pedido (${Math.round((1 - e.sugestao.fator) * 100)}%)`}>
                        {' '}rateado
                      </em>}
                  </span>
                )
                : (
                  <span className="fin-semvalor" title={e.sugestao?.motivo === 'sem-preco'
                    ? 'Falta preço de algum produto no cadastro de Itens — sem a tabela inteira não dá para ratear.'
                    : 'A planilha não trouxe valor para este pedido.'}>
                    ⚠ valor a digitar
                  </span>
                )}
              <button className="btn" onClick={() => onLancar(e)}>Lançar cobrança</button>
            </div>
          </div>
        ))}
      </div>

      {vis.length > mostrando.length && (
        <div className="fin-corte">
          Mostrando {mostrando.length} de {vis.length} entregas sem cobrança.
          <button className="mini-btn" onClick={() => setTudo(true)}>ver todas</button>
        </div>
      )}
    </>
  )
}

// ============================================================
// ABA 2 — EM ABERTO: quem me deve, por vencimento
// ============================================================
export function AbaAberto({ cobrancas, movimentos, clientes, nome, onReceber }) {
  const [busca, setBusca] = useState('')
  const [soVencidas, setSoVencidas] = useState(false)
  const [verFechadas, setVerFechadas] = useState(false)
  const [abertoId, setAbertoId] = useState('')

  const hoje = hojeISO()
  const termo = busca.trim()
  const comSit = cobrancas
    .map((c) => ({ c, s: situacaoDaCobranca(c, movimentos, hoje) }))
    .filter(({ c, s }) => verFechadas || (s.st !== 'quitada' && s.st !== 'cancelada'))
    .filter(({ s }) => !soVencidas || s.st === 'vencida')
    .filter(({ c }) => !termo
      || String(c.idVenda || '').includes(termo)
      || casaBusca(termo, c.cliente, nomeCliente(c.cliente, clientes)))
    // sem vencimento em aberto (quitada) vai para o fim
    .sort((a, b) => String(a.s.proxima || '9999').localeCompare(String(b.s.proxima || '9999')))

  async function cancelarCobranca(c, s) {
    // ⚠️ cobrança com dinheiro atrás não pode sumir em silêncio
    const aviso = s.recebido > 0
      ? `\n\n⚠️ ATENÇÃO: já entraram ${fmtMoeda(s.recebido)} nesta cobrança. `
        + `Os recebimentos CONTINUAM no caixa — cancele-os um a um se eles também não valem.`
      : ''
    if (!confirm(`Cancelar a cobrança de ${nomeCliente(c.cliente, clientes)}`
      + `${c.idVenda ? ` (pedido #${c.idVenda})` : ''}, no valor de ${fmtMoeda(c.valor)}?`
      + `\n\nEla sai da lista e a entrega volta a poder ser cobrada.${aviso}`)) return
    await updateDoc(doc(db, 'cobrancas', c.id), {
      status: 'cancelada', canceladaPor: nome || '', canceladaEm: new Date().toISOString(),
    })
  }

  return (
    <>
      <div className="toolbar no-print">
        <input className="fin-busca" placeholder="Pedido ou cliente…"
          value={busca} onChange={(e) => setBusca(e.target.value)} />
        <label className="filter-pill">
          <input type="checkbox" checked={soVencidas}
            onChange={(e) => setSoVencidas(e.target.checked)} />
          Só vencidas
        </label>
        <label className="filter-pill">
          <input type="checkbox" checked={verFechadas}
            onChange={(e) => setVerFechadas(e.target.checked)} />
          Ver quitadas e canceladas
        </label>
        <span className="chip">{comSit.length} cobrança(s)</span>
      </div>

      {!comSit.length && (
        <div className="fin-vazio">
          <p><b>Nada em aberto.</b> {cobrancas.length
            ? 'Todas as cobranças desta empresa estão quitadas ou canceladas.'
            : 'Nenhuma cobrança lançada ainda — comece pela aba “A cobrar”.'}</p>
        </div>
      )}

      <div className="cards">
        {comSit.map(({ c, s }) => {
          const sit = SITUACAO_COBRANCA[s.st]
          const aberta = abertoId === c.id
          return (
            <div className={'card fin-cob' + (s.st === 'vencida' ? ' fin-cob-venc' : '')} key={c.id}>
              <div className="fin-linha-top">
                <b>{nomeCliente(c.cliente, clientes) || '—'}</b>
                {c.idVenda ? <span className="chip">#{c.idVenda}{c.remessa ? ` · remessa ${c.remessa}` : ''}</span> : null}
                {!c.idVenda ? <span className="chip">lançada à mão</span> : null}
                <span className="chip" style={{ borderColor: sit.cor, color: sit.cor }}>
                  {sit.nm}{s.st === 'vencida' ? ` há ${s.diasAtraso}d` : ''}
                </span>
              </div>

              <div className="fin-barra">
                <span><i>valor</i> {fmtMoeda(s.valor)}</span>
                <span><i>recebido</i> {fmtMoeda(s.recebido)}</span>
                <span className="fin-saldo"><i>saldo</i> {fmtMoeda(s.saldo)}</span>
                {s.proxima ? <span><i>próx. venc.</i> {fmtDia(s.proxima)}</span> : null}
              </div>

              <button className="fin-abre" onClick={() => setAbertoId(aberta ? '' : c.id)}>
                {aberta ? '▾' : '▸'} {(c.parcelas || []).length} parcela(s)
              </button>

              {aberta && (
                <div className="fin-parcelas">
                  {s.parcelas.map((pc) => {
                    const quit = pc.saldo <= 0.004
                    const venc = pc.venc && pc.venc < hoje && !quit
                    return (
                      <div className={'fin-pc' + (venc ? ' fin-pc-atrasada' : '')} key={pc.n}>
                        <span className="fin-pc-n">{pc.n}/{s.parcelas.length}</span>
                        <span className="fin-pc-venc">{pc.venc ? fmtDia(pc.venc) : 'sem vencimento'}</span>
                        <span className="fin-pc-val">{fmtMoeda(pc.valor)}</span>
                        <span className="fin-pc-sit">
                          {quit
                            ? <b style={{ color: 'var(--ok)' }}>recebida</b>
                            : <>falta {fmtMoeda(pc.saldo)}</>}
                        </span>
                        {pc.forma ? <span className="chip">{nomeForma(pc.forma)}</span> : null}
                        {!quit && s.st !== 'cancelada' && (
                          <button className="mini-btn"
                            onClick={() => onReceber({ cob: c, parcela: pc, total: s.parcelas.length })}>
                            💰 Receber
                          </button>
                        )}
                      </div>
                    )
                  })}
                  {c.obs ? <div className="fin-obs">{c.obs}</div> : null}
                  <div className="fin-rodape">
                    <small>
                      lançada por {c.criadaPor || '—'} em {fmtDataHora(c.criadaEm)}
                      {c.valorAuto === false ? ' · valor digitado' : ''}
                      {c.status === 'cancelada' ? ` · cancelada por ${c.canceladaPor || '—'}` : ''}
                    </small>
                    {c.status !== 'cancelada' && (
                      <button className="mini-btn" onClick={() => cancelarCobranca(c, s)}>
                        ✕ cancelar cobrança
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

// ============================================================
// ABA 3 — RECEBIMENTOS: o extrato do que entrou (semente da conciliação)
// ============================================================
export function AbaCaixa({ movimentos, empresa, clientes, nome }) {
  const [conta, setConta] = useState('')
  const [mes, setMes] = useState(hojeISO().slice(0, 7))

  const lista = movimentos
    .filter((m) => !conta || m.conta === conta)
    .filter((m) => !mes || String(m.data || '').slice(0, 7) === mes)
    .sort((a, b) => String(b.data || '').localeCompare(String(a.data || ''))
      || String(b.quando || '').localeCompare(String(a.quando || '')))

  const total = movimentosVivos(lista).reduce((s, m) => s + (Number(m.valor) || 0), 0)
  const porDia = []
  for (const m of lista) {
    const ult = porDia[porDia.length - 1]
    if (ult && ult.dia === m.data) ult.movs.push(m)
    else porDia.push({ dia: m.data, movs: [m] })
  }

  // ⚠️ movimento não se apaga: se CANCELA. Corrigir é cancelar e lançar de novo,
  // com o cancelado riscado na tela — apagar esconderia que aconteceu.
  async function cancelar(m) {
    if (!confirm(`Cancelar o recebimento de ${fmtMoeda(m.valor)} de ${fmtDia(m.data)}?`
      + '\n\nEle continua no extrato, riscado, e o saldo da cobrança volta a subir.'
      + '\nPara corrigir um valor errado: cancele este e lance outro.')) return
    await updateDoc(doc(db, 'movimentos', m.id), {
      cancelado: true, canceladoPor: nome || '', canceladoEm: new Date().toISOString(),
    })
  }

  return (
    <>
      <div className="toolbar no-print">
        <input className="fin-busca fin-curto" type="month" value={mes}
          onChange={(e) => setMes(e.target.value)} />
        <select className="fin-busca fin-curto" value={conta}
          onChange={(e) => setConta(e.target.value)}>
          <option value="">Todas as contas</option>
          {contasDaEmpresa(empresa).map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
        <span className="chip" style={{ borderColor: 'var(--ok)', color: 'var(--ok)' }}>
          entrou {fmtMoeda(total)}
        </span>
      </div>

      {!lista.length && (
        <div className="fin-vazio"><p>Nenhum recebimento neste mês nesta conta.</p></div>
      )}

      {porDia.map(({ dia, movs }) => (
        <div className="fin-dia" key={dia}>
          <div className="fin-dia-head">
            <b>{fmtDia(dia)}</b>
            <span>{fmtMoeda(movimentosVivos(movs).reduce((s, m) => s + (Number(m.valor) || 0), 0))}</span>
          </div>
          {movs.map((m) => (
            <div className={'fin-mov' + (m.cancelado ? ' fin-mov-off' : '')} key={m.id}>
              <span className="fin-mov-val">{fmtMoeda(m.valor)}</span>
              <span className="fin-mov-cli">
                {nomeCliente(m.cliente, clientes) || '—'}
                {m.idVenda ? <small> · #{m.idVenda}</small> : null}
                {m.parcelaN ? <small> · parcela {m.parcelaN}</small> : null}
              </span>
              <span className="chip">{nomeForma(m.forma) || '—'}</span>
              <span className="chip">{nomeConta(m.conta) || '—'}</span>
              {m.cancelado
                ? <small className="fin-cancelado">cancelado por {m.canceladoPor || '—'}</small>
                : <button className="mini-btn" onClick={() => cancelar(m)}>✕ cancelar</button>}
            </div>
          ))}
        </div>
      ))}
    </>
  )
}

// ============================================================
// MODAL — LANÇAR COBRANÇA
// ============================================================
export function ModalCobranca({ entrega, empresa, pedidos, entregues, cobrancas, itensCad,
                         clientes, nome, uid, onFechar }) {
  const manual = !!entrega.manual
  const idVenda = manual ? '' : String(entrega.idVenda)

  // quantas remessas este pedido já teve, e se ainda sobrou coisa na fábrica
  const nRemessas = manual ? 0
    : entregues.filter((e) => String(e.idVenda) === idVenda).length
  const aindaNaFabrica = !manual && pedidos.some((p) => String(p.idVenda) === idVenda)
  // A escolha "pedido × entrega" só aparece quando ela MUDA alguma coisa: com uma
  // entrega única e nada pendente as duas cobram o mesmo valor, e perguntar seria
  // um clique por nada.
  const escolheEscopo = !manual && (entrega.parcial || nRemessas > 1 || aindaNaFabrica)

  const [escopo, setEscopo] = useState('entrega')   // 'entrega' | 'pedido'
  const [cliente, setCliente] = useState(manual ? '' : (entrega.cliente || ''))
  const [nParcelas, setNParcelas] = useState(1)
  const [primeiroVenc, setPrimeiroVenc] = useState('')   // ⚠️ nasce VAZIO, de propósito
  const [intervalo, setIntervalo] = useState(30)
  const [forma, setForma] = useState('')
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)

  const cobrandoPedido = escolheEscopo && escopo === 'pedido'
  const sugestao = manual ? { valor: null } : entrega.sugestao
  const valorSugerido = cobrandoPedido
    ? arredondaMoeda(entrega.valorTotal)
    : (sugestao?.valor ?? null)

  const emBR = (v) => (v == null ? '' : String(v).replace('.', ','))
  const [valor, setValor] = useState(emBR(valorSugerido))
  const [parcelas, setParcelas] = useState([])
  const valorNum = arredondaMoeda(String(valor).replace(',', '.'))

  // a conta do desconto, só para EXPLICAR o número na tela
  const detalhe = useMemo(() => {
    if (manual || !idVenda) return null
    const itens = itensDoPedidoInteiro(idVenda, pedidos, entregues)
    const tabela = valorDeTabela(itens, itensCad)
    const fator = fatorDesconto(entrega.valorTotal, tabela)
    return { tabela, fator }
  }, [manual, idVenda, pedidos, entregues, itensCad, entrega.valorTotal])

  // ⚠️ INFORMAÇÃO, não preenchimento. A condição da última cobrança deste
  // cliente é mostrada para lembrar — mas o campo continua vazio. Campo já
  // preenchido com número que ninguém conferiu é por onde o erro entra (foi por
  // isso que o atalho do fechamento da montagem saiu).
  const ultima = useMemo(() => {
    const alvo = (cliente || '').trim()
    if (!alvo) return null
    const c = cobrancasVivas(cobrancas)
      .filter((x) => x.cliente === alvo && (x.parcelas || []).length)
      .sort((a, b) => String(b.criadaEm || '').localeCompare(String(a.criadaEm || '')))[0]
    if (!c) return null
    const p = c.parcelas
    const dias = p.length > 1 ? Math.max(0, Math.round(
      (new Date(p[1].venc) - new Date(p[0].venc)) / 86400000)) : 0
    return { n: p.length, dias, forma: p[0]?.forma || '' }
  }, [cliente, cobrancas])

  function gerar() {
    if (!(valorNum > 0)) { alert('Informe o valor da cobrança.'); return }
    if (!primeiroVenc) { alert('Informe o vencimento da primeira parcela.'); return }
    setParcelas(geraParcelas(valorNum, nParcelas, primeiroVenc, intervalo, forma))
  }
  function mudaParcela(n, campo, v) {
    setParcelas(parcelas.map((pc) => (pc.n === n
      ? { ...pc, [campo]: campo === 'valor' ? arredondaMoeda(String(v).replace(',', '.')) : v }
      : pc)))
  }

  const somaParcelas = arredondaMoeda(parcelas.reduce((s, p) => s + (Number(p.valor) || 0), 0))
  const bate = parcelas.length > 0 && Math.abs(somaParcelas - valorNum) < 0.005
  const semVenc = parcelas.some((p) => !p.venc)

  async function salvar() {
    if (!(valorNum > 0)) { alert('Informe o valor da cobrança.'); return }
    if (!cliente.trim()) { alert('Informe o cliente.'); return }
    if (!parcelas.length) { alert('Gere as parcelas antes de salvar.'); return }
    if (semVenc) { alert('Toda parcela precisa de vencimento.'); return }
    if (!bate) {
      alert(`As parcelas somam ${fmtMoeda(somaParcelas)} e a cobrança é de ${fmtMoeda(valorNum)}.`
        + '\nAjuste as parcelas ou o valor — senão a cobrança nunca quita.')
      return
    }
    setSalvando(true)
    try {
      await addDoc(collection(db, 'cobrancas'), {
        empresa,
        origem: manual ? 'manual' : 'entrega',
        idVenda: manual ? '' : idVenda,
        // sem remessa = cobra o PEDIDO INTEIRO, e aí nenhuma outra entrega dele
        // pode ser cobrada de novo (a trava é `entregasCobertas`)
        remessa: manual || cobrandoPedido ? null : (entrega.remessa || 1),
        cliente: cliente.trim(),
        vendedor: entrega.vendedor || '',
        rota: entrega.rota || '',
        cidade: entrega.cidade || '',
        valor: valorNum,
        // marca o valor DIGITADO: sem preço no cadastro não houve conta, e quem
        // conferir depois precisa saber que aquele número veio da mão
        valorAuto: valorSugerido != null && Math.abs(valorSugerido - valorNum) < 0.005,
        parcelas,
        status: 'aberta',
        emitidaEm: hojeISO(),
        obs: obs.trim(),
        criadaPor: nome || '', criadaUid: uid || '', criadaEm: new Date().toISOString(),
      })
      onFechar()
    } catch (e) {
      console.error('Erro ao lançar cobrança:', e)
      alert('Não foi possível lançar a cobrança: ' + (e.code || e.message))
    } finally { setSalvando(false) }
  }

  return (
    <div className="assist-overlay" onClick={onFechar}>
      <div className="fin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fin-modal-head">
          <b>{manual ? 'Cobrança à mão' : `Cobrança do pedido #${idVenda}`}</b>
          <button className="assist-x" onClick={onFechar}>✕</button>
        </div>

        <div className="fin-modal-body">
          <div className="fin-modal-sub">
            {nomeEmpresa(empresa)}
            {!manual && <> · entregue em {fmtData(entrega.entregueEm)}
              {nRemessas > 1 ? ` · remessa ${entrega.remessa || 1} de ${nRemessas}` : ''}</>}
          </div>

          {manual && (
            <div className="field">
              <label>Cliente</label>
              <input value={cliente} onChange={(e) => setCliente(e.target.value)}
                placeholder="Nome do cliente" />
            </div>
          )}
          {!manual && (
            <div className="fin-modal-sub"><b>{nomeCliente(cliente, clientes)}</b></div>
          )}

          {escolheEscopo && (
            <div className="fin-escopo">
              <span>O que esta cobrança cobre?</span>
              <div className="modo-btns">
                <button className={'modo-btn' + (escopo === 'entrega' ? ' ativo' : '')}
                  onClick={() => { setEscopo('entrega'); setValor(emBR(sugestao?.valor)); setParcelas([]) }}
                  style={escopo === 'entrega' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : null}>
                  Só esta entrega
                </button>
                <button className={'modo-btn' + (escopo === 'pedido' ? ' ativo' : '')}
                  onClick={() => { setEscopo('pedido'); setValor(emBR(arredondaMoeda(entrega.valorTotal))); setParcelas([]) }}
                  style={escopo === 'pedido' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : null}>
                  O pedido inteiro
                </button>
              </div>
              <small>
                {escopo === 'pedido'
                  ? 'Cobra o pedido de uma vez — as outras entregas dele não poderão ser cobradas de novo.'
                  : `Cobra só o que saiu nesta remessa.${aindaNaFabrica ? ' O resto continua na fábrica e será cobrado quando sair.' : ''}`}
              </small>
            </div>
          )}

          <div className="field">
            <label>Valor da cobrança</label>
            <input value={valor} onChange={(e) => { setValor(e.target.value); setParcelas([]) }}
              inputMode="decimal" placeholder="0,00" />
          </div>
          {!manual && (
            <div className="fin-explica">
              {valorSugerido == null
                ? (
                  <>⚠ Não deu para calcular:{' '}
                    {sugestao?.motivo === 'sem-preco'
                      ? 'falta preço de algum produto no cadastro de Itens. Sem a tabela inteira não dá para ratear com o desconto do pedido — digite o valor.'
                      : 'a planilha não trouxe valor para este pedido — digite o valor.'}</>
                )
                : sugestao?.exato || cobrandoPedido
                  ? <>Valor do pedido no Posseidon: <b>{fmtMoeda(entrega.valorTotal)}</b>.</>
                  : (
                    <>Rateado pelo valor de tabela ({fmtMoeda(detalhe?.tabela)}), com o mesmo
                      desconto do pedido ({Math.round((1 - (detalhe?.fator || 1)) * 100)}%).
                      A soma das remessas fecha os {fmtMoeda(entrega.valorTotal)} do pedido.</>
                  )}
            </div>
          )}

          <div className="fin-cond">
            <div className="field">
              <label>Parcelas</label>
              <input type="number" min="1" max="24" value={nParcelas}
                onChange={(e) => { setNParcelas(e.target.value); setParcelas([]) }} />
            </div>
            <div className="field">
              <label>1º vencimento</label>
              <input type="date" value={primeiroVenc}
                onChange={(e) => { setPrimeiroVenc(e.target.value); setParcelas([]) }} />
            </div>
            <div className="field">
              <label>Intervalo (dias)</label>
              <input type="number" min="0" value={intervalo}
                onChange={(e) => { setIntervalo(e.target.value); setParcelas([]) }} />
            </div>
            <div className="field">
              <label>Forma</label>
              <select value={forma} onChange={(e) => { setForma(e.target.value); setParcelas([]) }}>
                <option value="">—</option>
                {FORMAS_PGTO.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
          </div>

          {ultima && (
            <div className="fin-explica">
              Da última vez este cliente foi <b>{ultima.n}x
                {ultima.dias ? ` de ${ultima.dias} em ${ultima.dias} dias` : ''}
                {ultima.forma ? ` em ${nomeForma(ultima.forma)}` : ''}</b>.
              {' '}O campo continua vazio de propósito — confira antes de digitar.
            </div>
          )}

          <button className="btn" onClick={gerar} disabled={!primeiroVenc || !(valorNum > 0)}>
            Gerar parcelas
          </button>

          {parcelas.length > 0 && (
            <div className="fin-parcelas fin-parcelas-edit">
              {parcelas.map((pc) => (
                <div className="fin-pc" key={pc.n}>
                  <span className="fin-pc-n">{pc.n}/{parcelas.length}</span>
                  <input type="date" value={pc.venc}
                    onChange={(e) => mudaParcela(pc.n, 'venc', e.target.value)} />
                  <input value={pc.valor} inputMode="decimal"
                    onChange={(e) => mudaParcela(pc.n, 'valor', e.target.value)} />
                  <select value={pc.forma || ''}
                    onChange={(e) => mudaParcela(pc.n, 'forma', e.target.value)}>
                    <option value="">—</option>
                    {FORMAS_PGTO.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                </div>
              ))}
              <div className={'fin-soma' + (bate ? '' : ' fin-soma-erro')}>
                {bate
                  ? <>✓ as parcelas somam {fmtMoeda(somaParcelas)}</>
                  : <>⚠ as parcelas somam {fmtMoeda(somaParcelas)}, e a cobrança é
                    de {fmtMoeda(valorNum)} — diferença de {fmtMoeda(Math.abs(somaParcelas - valorNum))}</>}
              </div>
            </div>
          )}

          <div className="field">
            <label>Observação</label>
            <input value={obs} onChange={(e) => setObs(e.target.value)}
              placeholder="opcional" />
          </div>
        </div>

        <div className="fin-modal-pe">
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="btn" onClick={salvar} disabled={salvando || !parcelas.length || !bate}>
            {salvando ? 'Salvando…' : 'Lançar cobrança'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// MODAL — RECEBER (dá origem a um MOVIMENTO)
// ============================================================
export function ModalReceber({ alvo, empresa, nome, uid, clientes, onFechar }) {
  const { cob, parcela, total } = alvo
  // O saldo é CALCULADO, não um chute — prefigurar aqui não é o mesmo que
  // preencher um vencimento que ninguém conferiu. E a data é a de HOJE porque é
  // hoje que a pessoa está registrando; ela pode trocar.
  const [valor, setValor] = useState(String(parcela.saldo).replace('.', ','))
  const [data, setData] = useState(hojeISO())
  const [forma, setForma] = useState(parcela.forma || '')
  const [conta, setConta] = useState('')
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)

  const valorNum = arredondaMoeda(String(valor).replace(',', '.'))

  async function salvar() {
    if (!(valorNum > 0)) { alert('Informe o valor recebido.'); return }
    if (!data) { alert('Informe a data do recebimento.'); return }
    // ⚠️ forma e conta são obrigatórias: sem elas o extrato não fecha e a
    // conciliação com o OFX (Fase 5) nasce quebrada
    if (!forma) { alert('Escolha a forma de pagamento.'); return }
    if (!conta) { alert('Escolha em que conta o dinheiro entrou.'); return }
    if (valorNum > parcela.saldo + 0.004
      && !confirm(`Você está recebendo ${fmtMoeda(valorNum)} numa parcela cujo saldo é `
        + `${fmtMoeda(parcela.saldo)}.\n\nConfirma? A cobrança vai ficar com saldo negativo.`)) return
    setSalvando(true)
    try {
      await addDoc(collection(db, 'movimentos'), {
        empresa,
        tipo: 'entrada',
        data,
        valor: valorNum,
        forma,
        conta,
        cobrancaId: cob.id,
        parcelaN: parcela.n,       // ⚠️ o NÚMERO da parcela, nunca a posição
        cliente: cob.cliente || '',
        idVenda: cob.idVenda || '',
        obs: obs.trim(),
        conciliado: false,          // a Fase 5 (OFX) marca aqui
        por: nome || '', porUid: uid || '', quando: new Date().toISOString(),
      })
      onFechar()
    } catch (e) {
      console.error('Erro ao lançar recebimento:', e)
      alert('Não foi possível lançar o recebimento: ' + (e.code || e.message))
    } finally { setSalvando(false) }
  }

  return (
    <div className="assist-overlay" onClick={onFechar}>
      <div className="fin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fin-modal-head">
          <b>Receber · parcela {parcela.n} de {total}</b>
          <button className="assist-x" onClick={onFechar}>✕</button>
        </div>
        <div className="fin-modal-body">
          <div className="fin-modal-sub">
            {nomeCliente(cob.cliente, clientes)}
            {cob.idVenda ? ` · pedido #${cob.idVenda}` : ''}
            {' · '}vence {parcela.venc ? fmtDia(parcela.venc) : '—'}
            {' · '}falta <b>{fmtMoeda(parcela.saldo)}</b>
          </div>

          <div className="fin-cond">
            <div className="field">
              <label>Valor recebido</label>
              <input value={valor} inputMode="decimal"
                onChange={(e) => setValor(e.target.value)} />
            </div>
            <div className="field">
              <label>Data</label>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="field">
              <label>Forma</label>
              <select value={forma} onChange={(e) => setForma(e.target.value)}>
                <option value="">escolha…</option>
                {FORMAS_PGTO.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Entrou em</label>
              <select value={conta} onChange={(e) => setConta(e.target.value)}>
                <option value="">escolha…</option>
                {contasDaEmpresa(empresa).map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
          </div>

          {valorNum > 0 && valorNum < parcela.saldo - 0.004 && (
            <div className="fin-explica">
              Recebimento parcial: continuam faltando{' '}
              <b>{fmtMoeda(arredondaMoeda(parcela.saldo - valorNum))}</b> nesta parcela.
            </div>
          )}

          <div className="field">
            <label>Observação</label>
            <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="opcional" />
          </div>
        </div>
        <div className="fin-modal-pe">
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="btn" onClick={salvar} disabled={salvando}
            style={{ background: 'var(--ok)', borderColor: 'var(--ok)' }}>
            {salvando ? 'Salvando…' : '💰 Confirmar recebimento'}
          </button>
        </div>
      </div>
    </div>
  )
}
