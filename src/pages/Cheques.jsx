// CHEQUES — origem, situação e destino de cada folha (CHEQUES.md, fases C3–C4).
//
// A regra mora em `src/lib/cheques.js` (portátil, vai para o TotaliFinance);
// esta tela só desenha e grava. Quem lança e vê: só o financeiro (03/11/2026).
//
// C4: REPASSE a fornecedor (com recibo impresso para assinatura), a aba
// Repassados por fornecedor/entrega e o resumo "entre empresas".
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import SubTabs from '../components/SubTabs.jsx'
import {
  EMPRESAS, nomeEmpresa, contasDaEmpresa, nomeConta, fmtMoeda, fmtDia, hojeISO,
  nomeCliente, casaBusca, veFinanceiro, fmtDataHora,
} from '../utils.js'
import {
  BANCOS, ALINEAS, nomeAlinea, nomeBanco, nomeSituacao, nomeAcao, nomeEvento, geraFolhas, somaFolhas,
  chequesDoLote, repetidasNoLote, aplicaEvento, avisosDoEvento, acoesComuns, podeIr,
  podeReapresentar, devolucoesDe, ultimaDevolucao, devolvidoPeloFornecedor, irmasDoLote,
  diasParaBomPara, diasDepositado, compensacaoAtrasada, totaisCheques, ordenaPorBomPara,
  filtraCheques, historicoDe, situacaoBate, entreEmpresas, chaveCheque, fmtDoc, ehViva,
  repassesDe, repassesPorFornecedor, resumoEntreEmpresas, cortePeriodo, gaveta,
  contasDoCliente, clienteChave, ondeEstaOCheque, pedacosDaBusca,
  resgatesPendentes, FORMAS_ACERTO, nomeFormaAcerto,
} from '../lib/cheques.js'
import {
  useChequesVivos, useChequesArquivo, useChequesRepassados, useChequesDaBusca, useResgatesPendentes, resgateNoServidor, gravaLote, novoLoteId, chequesComChaves, chequesDoCliente,
  aplicaEmLote, corrigeNoServidor,
} from '../hooks/useCheques.js'
import { useFornecedores } from '../hooks/useFornecedores.js'
import { fornecedoresAtivos, achaFornecedor } from '../lib/fornecedores.js'

const LIMITE_LISTA = 60
const SEM_LISTA = []
// período da aba Repassados: é o corte da CONSULTA (regra 1.3 — repasses só crescem)
export const PERIODOS_REPASSE = [
  { id: 'mes', nm: 'Este mês' },
  { id: '90', nm: 'Últimos 90 dias' },
  { id: '365', nm: 'Últimos 12 meses' },
  { id: '', nm: 'Todos' },
]

// onde um cheque pode ser DEPOSITADO: só conta de banco. A Cielo é a
// maquininha e o caixa interno é a gaveta — ninguém deposita cheque neles.
const NAO_DEPOSITA = ['cielo', 'caixa']
export const contasDeDeposito = (empresa) =>
  contasDaEmpresa(empresa).filter((c) => !NAO_DEPOSITA.includes(c.id))

// '1.468,00' → 1468 · '1468.5' → 1468.5 · '' → NaN
export function numBR(txt) {
  const s = String(txt ?? '').trim()
  if (!s) return NaN
  return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
}

export default function Cheques({ pedidos }) {
  const { perfil, nome, user } = useAuth()
  const { clientes } = useCadastros()
  const ligado = veFinanceiro(perfil)
  const vivos = useChequesVivos(ligado)
  const [arquivoLigado, setArquivoLigado] = useState(false)
  const arquivo = useChequesArquivo(ligado && arquivoLigado)
  // os repassados só são lidos com a aba Repassados aberta, e só do período
  const [abaRep, setAbaRep] = useState(false)
  const [periodoRep, setPeriodoRep] = useState('90')
  const repassados = useChequesRepassados(ligado && abaRep, cortePeriodo(periodoRep, hojeISO()))
  const forn = useFornecedores(ligado)
  // C6c: o que se digita no Localizar procura no BANCO INTEIRO — o número da
  // folha e os clientes que o texto achou no cadastro
  const [buscaServidor, setBuscaServidor] = useState(null)
  const porNumero = useChequesDaBusca(buscaServidor, ligado)
  const resgates = useResgatesPendentes(ligado)
  if (!ligado) return <div className="empty">Esta tela é só do financeiro.</div>
  const quem = { por: nome || '', porUid: user?.uid || '' }
  const acoes = {
    novoLoteId,
    gravaLote,
    chequesComChaves,
    chequesDoCliente,
    aplicar: (ids, ev) => aplicaEmLote(ids, { ...ev, ...quem }, { hoje: hojeISO() }),
    corrigir: (id, mudancas, obs) => corrigeNoServidor(id, mudancas, { ...quem, obs }),
    resgate: (id, desistir, ev) => resgateNoServidor(id, desistir, { ...ev, ...quem }),
  }
  return (
    <TelaCheques vivos={vivos} arquivo={arquivo} arquivoLigado={arquivoLigado}
      onArquivo={setArquivoLigado} pedidos={pedidos} clientes={clientes}
      quem={quem} hoje={hojeISO()} acoes={acoes}
      repassados={repassados} periodoRep={periodoRep} onPeriodoRep={setPeriodoRep}
      onAba={(id) => setAbaRep(id === 'repassados')} fornecedores={forn.lista}
      porNumero={porNumero} onBuscaServidor={setBuscaServidor} resgates={resgates} />
  )
}

// ============================================================
// A TELA (sem hook de dados: o teste monta com dados)
// ============================================================
export function TelaCheques({ vivos, arquivo, arquivoLigado, onArquivo, pedidos, clientes, quem, hoje, acoes,
  repassados, periodoRep = '90', onPeriodoRep, onAba, fornecedores = SEM_LISTA, abaInicial = 'carteira',
  porNumero, onBuscaServidor, resgates }) {
  const [empresa, setEmpresa] = useState('')            // '' = as duas
  const [aba, setAba] = useState(abaInicial)
  const [marcados, setMarcados] = useState([])          // ids
  const [lancando, setLancando] = useState(false)
  const [evento, setEvento] = useState(null)            // { para, cheques }
  const [abertoId, setAbertoId] = useState('')
  const [msg, setMsg] = useState('')
  const [reciboPronto, setReciboPronto] = useState(null)  // repasse recém-registrado
  const [imprimir, setImprimir] = useState(null)          // repasse no papel agora
  const avisa = (m) => { setMsg(m); setTimeout(() => setMsg((x) => (x === m ? '' : x)), 5000) }

  const todos = useMemo(() => {
    const porId = new Map()
    for (const c of [...(vivos?.lista || []), ...(arquivo?.lista || []), ...(repassados?.lista || []),
      ...(porNumero?.lista || []), ...(resgates?.lista || [])]) porId.set(c.id, c)
    return [...porId.values()]
  }, [vivos, arquivo, repassados, porNumero, resgates])
  // "onde está" com os nomes que só a tela conhece: a conta e o telefone do fornecedor
  const ondeDe = useMemo(() => (c) => ondeEstaOCheque(c, {
    nomeConta, contatoFornecedor: (id) => achaFornecedor(fornecedores, id), hoje }), [fornecedores, hoje])
  // C6d: a lista de quem precisa ir buscar a folha com o fornecedor
  const aBuscar = useMemo(() => resgatesPendentes(
    empresa ? todos.filter((c) => c.empresa === empresa) : todos, hoje), [todos, empresa, hoje])
  const daEmpresa = useMemo(
    () => (empresa ? todos.filter((c) => c.empresa === empresa) : todos), [todos, empresa])

  const tot = useMemo(() => totaisCheques(daEmpresa, hoje), [daEmpresa, hoje])
  const carteira = useMemo(() => ordenaPorBomPara(daEmpresa.filter((c) => c.situacao === 'carteira')), [daEmpresa])
  const depositados = useMemo(() => daEmpresa.filter((c) => c.situacao === 'depositado')
    .sort((a, b) => (diasDepositado(b, hoje) ?? 0) - (diasDepositado(a, hoje) ?? 0)), [daEmpresa, hoje])
  const devolvidos = useMemo(() => daEmpresa.filter((c) => c.situacao === 'devolvido')
    .sort((a, b) => String(ultimaDevolucao(b)?.data || '').localeCompare(String(ultimaDevolucao(a)?.data || ''))),
  [daEmpresa])

  const jaPodem = carteira.filter((c) => (diasParaBomPara(c, hoje) ?? 1) <= 0).length
  const atrasados = depositados.filter((c) => compensacaoAtrasada(c, hoje)).length
  const abas = [
    { id: 'carteira', label: `Carteira (${carteira.length})`, badge: jaPodem },
    { id: 'depositados', label: `Depositados (${depositados.length})`, badge: atrasados },
    { id: 'devolvidos', label: `Devolvidos (${devolvidos.length})`, badge: devolvidos.length },
    { id: 'repassados', label: 'Repassados' },
    { id: 'resgates', label: `🔁 Resgates (${aBuscar.length})`, badge: aBuscar.length },
    { id: 'localizar', label: '🔍 Localizar' },
  ]

  const porId = useMemo(() => new Map(todos.map((c) => [c.id, c])), [todos])
  const marcadosCheques = marcados.map((id) => porId.get(id)).filter(Boolean)
  const aberto = abertoId ? porId.get(abertoId) : null
  const trocaAba = (id) => { setAba(id); setMarcados([]); onAba?.(id) }
  // o recibo vai para o papel DEPOIS de desenhado (print-only), senão a folha sai vazia
  useEffect(() => {
    if (!imprimir) return undefined
    const depois = () => setImprimir(null)
    window.addEventListener('afterprint', depois)
    const t = setTimeout(() => window.print(), 50)
    return () => { clearTimeout(t); window.removeEventListener('afterprint', depois) }
  }, [imprimir])
  const marca = (id) => setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))

  async function confirmarEvento(ev) {
    await acoes.aplicar(evento.cheques.map((c) => c.id), ev)
    if (evento.para === 'repassado') {
      // o recibo nasce das folhas que acabaram de ir — a tela ainda não recebeu a
      // atualização do servidor, então é montado com o que a pessoa confirmou
      setReciboPronto(reciboDoRepasse(evento.cheques, ev))
    } else {
      avisa(`${evento.cheques.length} folha(s) → ${nomeSituacao(evento.para)}.`)
    }
    setEvento(null); setMarcados([])
  }

  const lista = { carteira, depositados, devolvidos }[aba]
  return (
    <>
    {/* com um recibo indo para o papel, a tela inteira fica fora da impressão */}
    <div className={imprimir ? 'screen-only' : ''}>
      <div className="page-title">
        <h2>Cheques</h2>
        <small>origem, situação e destino de cada folha · {empresa ? nomeEmpresa(empresa) : 'as duas empresas'}</small>
      </div>

      <div className="fin-topo no-print">
        <div className="modo-btns">
          {[{ id: '', nome: 'Ambas' }, ...EMPRESAS].map((e) => (
            <button key={e.id || 'ambas'} className={'modo-btn' + (empresa === e.id ? ' ativo' : '')}
              onClick={() => { setEmpresa(e.id); setMarcados([]) }}
              style={empresa === e.id ? { background: 'var(--accent)', color: '#1a1205', borderColor: 'var(--accent)' } : null}>
              {e.nome}
            </button>
          ))}
          <button className="btn primary" onClick={() => setLancando(true)} disabled={!vivos?.pronto}>
            + Lançar cheques
          </button>
        </div>
        <div className="fin-cards">
          <Card rot="Em carteira" v={tot.carteira} />
          <Card rot="Depositar em 7 dias" v={tot.depositarAte} />
          <Card rot="Depositados" v={tot.depositados} />
          <Card rot="Devolvidos" v={tot.devolvidos} cor="var(--danger)" />
        </div>
      </div>

      {vivos?.erro && (
        <div className="login-err" style={{ marginBottom: 14 }}>
          Não foi possível ler os cheques ({vivos.erro}).
          {vivos.erro === 'permission-denied' && ' As regras do Firestore com "cheques" precisam estar publicadas.'}
        </div>
      )}
      {!vivos?.pronto && !vivos?.erro && <div className="empty">Carregando cheques…</div>}
      {/* aviso flutuante: entrando no fluxo da página ele empurrava as abas e a
          lista, e o próximo clique caía no lugar errado */}
      {msg && <div className="chq-toast" role="status" onClick={() => setMsg('')}>{msg}</div>}

      <SubTabs abas={abas} ativa={aba} onTrocar={trocaAba} />

      {/* só as três listas simples; Repassados e Localizar têm bloco próprio */}
      {vivos?.pronto && lista && (
        <>
          <Explica aba={aba} />
          {aba === 'carteira' && (
            <button className="btn chq-gaveta-btn no-print" onClick={() => setImprimir({ gaveta: true })}>
              🖨 Conferência da gaveta
            </button>
          )}
          <BarraSelecao cheques={marcadosCheques} onAcao={(para) => setEvento({ para, cheques: marcadosCheques })}
            onLimpar={() => setMarcados([])} />
          <ListaCheques cheques={lista} marcados={marcados} onMarcar={marca} onAbrir={setAbertoId}
            clientes={clientes} hoje={hoje} todos={todos}
            vazio={{ carteira: 'Nenhum cheque na gaveta.', depositados: 'Nenhum cheque esperando compensar.',
              devolvidos: 'Nenhum cheque devolvido para resolver.' }[aba]} />
        </>
      )}
      {aba === 'resgates' && (
        <>
          <div className="chq-explica">O cliente quer a folha de volta e ela está com um fornecedor: alguém precisa
            ir buscar. Marque a folha e use <b>Recolhido do fornecedor</b> quando ela voltar (diga como a empresa pagou
            o fornecedor); depois, na carteira, <b>Resgatado</b> quando o cliente pagar e levar.
            O pedido de resgate se faz na ficha da folha repassada.</div>
          <BarraSelecao cheques={marcadosCheques} onAcao={(para) => setEvento({ para, cheques: marcadosCheques })}
            onLimpar={() => setMarcados([])} />
          <ListaCheques cheques={aBuscar.map((r) => r.cheque)} marcados={marcados} onMarcar={marca} onAbrir={setAbertoId}
            clientes={clientes} hoje={hoje} todos={todos} ondeDe={ondeDe} corte={500}
            vazio="Nenhum resgate a buscar." />
        </>
      )}
      {aba === 'repassados' && (
        <AbaRepassados estado={repassados} periodo={periodoRep} onPeriodo={onPeriodoRep} empresa={empresa}
          fornecedores={fornecedores} marcados={marcados} onMarcar={marca} onAbrir={setAbertoId}
          clientes={clientes} hoje={hoje} onRecibo={setImprimir}
          barra={<BarraSelecao cheques={marcadosCheques} onAcao={(para) => setEvento({ para, cheques: marcadosCheques })}
            onLimpar={() => setMarcados([])} />} />
      )}
      {aba === 'localizar' && (
        <AbaLocalizar todos={daEmpresa} arquivoLigado={arquivoLigado} onArquivo={onArquivo}
          arquivoPronto={!!arquivo?.pronto} marcados={marcados} onMarcar={marca} onAbrir={setAbertoId}
          clientes={clientes} hoje={hoje} ondeDe={ondeDe} onBuscaServidor={onBuscaServidor}
          barra={<BarraSelecao cheques={marcadosCheques} onAcao={(para) => setEvento({ para, cheques: marcadosCheques })}
            onLimpar={() => setMarcados([])} />} />
      )}

      {lancando && (
        <ModalLancar pedidos={pedidos} clientes={clientes} existentes={todos} quem={quem} hoje={hoje} fornecedores={fornecedores}
          empresaInicial={empresa || 'sacolas'} acoes={acoes}
          onFeito={(cs) => {
            setLancando(false)
            // cheque antigo que já entra compensado/resgatado vai para o ARQUIVO,
            // que esta tela não carrega: sem dizer onde está, parece que não gravou
            const rep = cs.filter((c) => c.situacao === 'repassado').length
            const noArquivo = cs.filter((c) => !ehViva(c.situacao) && c.situacao !== 'repassado').length
            avisa(`${cs.length} folha(s) lançada(s).`
              + (rep ? ` ${rep} já com fornecedor — está(ão) na aba Repassados.` : '')
              + (noArquivo ? ` ${noArquivo} já encerrada(s) — está(ão) em 🔍 Localizar, com "incluir os encerrados".` : ''))
            setAba('carteira')
          }}
          onFechar={() => setLancando(false)} />
      )}
      {evento && (
        <ModalEvento para={evento.para} cheques={evento.cheques} hoje={hoje} fornecedores={fornecedores}
          onConfirmar={confirmarEvento} onFechar={() => setEvento(null)} />
      )}
      {reciboPronto && (
        <ModalReciboPronto repasse={reciboPronto} onImprimir={() => { setImprimir(reciboPronto); setReciboPronto(null) }}
          onFechar={() => setReciboPronto(null)} />
      )}
      {aberto && !evento && (
        <FichaCheque cheque={aberto} todos={todos} clientes={clientes} hoje={hoje} ondeDe={ondeDe}
          onResgate={async (desistir, ev) => {
            await acoes.resgate(aberto.id, desistir, ev)
            avisa(desistir ? 'Resgate desistido.' : 'Resgate pedido — a folha está em 🔁 Resgates.')
          }}
          onAcao={(para) => setEvento({ para, cheques: [aberto] })}
          onCorrigir={async (mud, obs) => { await acoes.corrigir(aberto.id, mud, obs); avisa('Cheque corrigido.') }}
          onFechar={() => setAbertoId('')} />
      )}
    </div>
    {imprimir && (imprimir.gaveta
      ? <ConferenciaGaveta cheques={daEmpresa} empresa={empresa} clientes={clientes} hoje={hoje} />
      : <ReciboRepasse repasse={imprimir} fornecedores={fornecedores} clientes={clientes} />)}
    </>
  )
}

function Card({ rot, v, cor }) {
  return (
    <div className="fin-card">
      <span>{rot}</span>
      <b style={cor && v.qtd ? { color: cor } : null}>{fmtMoeda(v.valor)}</b>
      <small className="chq-card-qtd">{v.qtd} folha(s)</small>
    </div>
  )
}

function Explica({ aba }) {
  const txt = {
    carteira: 'O que está na gaveta, pela data combinada (bom para). Marque as folhas para depositar ou dar outro destino.',
    depositados: 'Foram ao banco e esperam compensar. Confira no extrato e marque as que compensaram — o sistema não presume nada sozinho.',
    devolvidos: 'O banco (ou o fornecedor) devolveu. É dinheiro a correr atrás: reapresentar, voltar para a gaveta ou resgatar com o cliente.',
  }[aba]
  return <div className="chq-explica">{txt}</div>
}

// ---------- seleção em lote ----------
// ⚠️ A barra fica SEMPRE no lugar, mesmo sem nada marcado: aparecendo só na
// primeira marcação ela empurrava a lista para baixo, e o clique na segunda
// folha caía fora da caixa (visto no ensaio de 26/10/2026).
export function BarraSelecao({ cheques, onAcao, onLimpar }) {
  if (!cheques.length) {
    return <div className="chq-barra chq-barra-vazia no-print">Marque as folhas para depositar, compensar ou dar outro destino.</div>
  }
  const acoes = acoesComuns(cheques)
  const de = cheques[0].situacao
  return (
    <div className="chq-barra no-print">
      <b>{cheques.length} marcado(s) · {fmtMoeda(somaFolhas(cheques))}</b>
      {acoes.length
        ? acoes.map((para) => (
          <button key={para} className={'mini-btn' + (para === 'cancelado' ? ' chq-perigo' : '')}
            onClick={() => onAcao(para)}>
            {nomeAcao(cheques.every((c) => c.situacao === de) ? de : '', para)}
          </button>
        ))
        : <span className="chq-mudo">nada vale para todas as marcadas</span>}
      <button className="mini-btn" onClick={onLimpar}>desmarcar</button>
    </div>
  )
}

// ---------- a lista ----------
export function ListaCheques({ cheques, marcados, onMarcar, onAbrir, clientes, hoje, todos, vazio, corte = LIMITE_LISTA, ondeDe }) {
  if (!cheques.length) return <div className="fin-vazio"><p>{vazio}</p></div>
  const mostra = cheques.slice(0, corte)
  return (
    <div className="chq-lista">
      {mostra.map((c) => (
        <LinhaCheque key={c.id} c={c} marcado={marcados.includes(c.id)} onMarcar={() => onMarcar(c.id)}
          onAbrir={() => onAbrir(c.id)} clientes={clientes} hoje={hoje} todos={todos} onde={ondeDe ? ondeDe(c) : null} />
      ))}
      {cheques.length > corte && (
        <div className="fin-corte">Mostrando {corte} de {cheques.length} — refine a busca para ver o resto.</div>
      )}
    </div>
  )
}

function LinhaCheque({ c, marcado, onMarcar, onAbrir, clientes, hoje, onde }) {
  const dias = diasParaBomPara(c, hoje)
  const dep = diasDepositado(c, hoje)
  const ult = ultimaDevolucao(c)
  const forn = devolvidoPeloFornecedor(c)
  return (
    <div className={'chq-linha' + (marcado ? ' chq-marcado' : '') + (!situacaoBate(c) ? ' chq-divergente' : '')}>
      <input type="checkbox" checked={marcado} onChange={onMarcar} aria-label={`marcar cheque ${c.numero}`} />
      <button className="chq-abre" onClick={onAbrir}>
        <span className="chq-num">nº {c.numero}</span>
        <span className="chq-banco">{c.banco?.nome || nomeBanco(c.banco?.codigo) || `banco ${c.banco?.codigo}`} · ag {c.agencia} · cc {c.conta}</span>
      </button>
      <span className="chq-quem">
        <b>{nomeCliente(c.cliente, clientes)}</b>
        {c.idVenda && <small> · #{c.idVenda}</small>}
        {!c.idVenda && c.referenteA && <small className="chq-avulso"> · avulso: {c.referenteA}</small>}
        {c.cobrancaId && <small className="chq-parcela" title="paga uma parcela do Financeiro"> · 💳 parcela {c.parcelaN}</small>}
        <small className="chq-emit">
          {c.terceiro && <span className="chip rota-warn">⚠ terceiro</span>} {c.emitente?.nome}
        </small>
      </span>
      <span className="chq-data">
        bom para <b>{fmtDia(c.bomPara)}</b>
        {c.situacao === 'carteira' && dias != null && (
          dias <= 0
            ? <span className="chip chq-ok">📅 já pode depositar</span>
            : <span className="chip">faltam {dias} dia(s)</span>)}
        {c.situacao === 'depositado' && dep != null && (
          <span className={'chip' + (compensacaoAtrasada(c, hoje) ? ' chq-atencao' : '')}>
            {nomeConta(c.contaDeposito) || c.contaDeposito} · há {dep} dia(s)
          </span>)}
        {c.situacao === 'repassado' && c.destino && (
          <span className="chip">com {c.destino.fornecedorNome} desde {fmtDia(c.destino.data)}{entreEmpresas(c) ? ' · ⇄' : ''}</span>)}
        {c.situacao === 'repassado' && c.resgatePedidoEm && <span className="chip chq-atencao">🔁 resgate pedido</span>}
        {c.situacao === 'devolvido' && ult && (
          <span className="chip chq-atencao">
            {forn ? `voltou de ${forn.fornecedorNome}` : 'voltou do banco'} · {nomeAlinea(ult.alinea)}
            {devolucoesDe(c).length > 1 ? ` · ${devolucoesDe(c).length}ª vez` : ''}
          </span>)}
      </span>
      <span className="chq-valor">{fmtMoeda(c.valor)}</span>
      <span className="chq-sit">
        {nomeSituacao(c.situacao)}
        {c.loteTotal > 1 && <small> · {c.loteN} de {c.loteTotal}</small>}
        {c.empresa && <small> · {nomeEmpresa(c.empresa)}</small>}
      </span>
      {/* a resposta de "onde está" (C6c), na busca — a linha inteira */}
      {onde && <div className="chq-onde"><b>{onde.icone} {onde.texto}</b>{onde.detalhe ? ` · ${onde.detalhe}` : ''}</div>}
    </div>
  )
}

// ---------- localizar (inclui o arquivo, sob demanda) ----------
const FILTRO_VAZIO = { termo: '', situacoes: [], banco: '', terceiro: false, bomParaDe: '', bomParaAte: '' }
export function AbaLocalizar({ todos, arquivoLigado, onArquivo, arquivoPronto, marcados, onMarcar, onAbrir, clientes, hoje, barra,
  ondeDe, onBuscaServidor }) {
  const [f, setF] = useState(FILTRO_VAZIO)
  const muda = (campo, v) => setF((x) => ({ ...x, [campo]: v }))
  // O que vai ao servidor, depois que a pessoa para de digitar ("2", "24",
  // "246" seriam três consultas): os NÚMEROS do termo e os CLIENTES que o
  // texto acha no cadastro (razão ou apelido, nome parecido) — até 30.
  const { numeros, texto } = pedacosDaBusca(f.termo)
  const chaveNums = numeros.join(',')
  const chaveClis = useMemo(() => (texto.trim().length < 3 ? ''
    : (clientes || []).filter((c) => casaBusca(texto, c.razao, c.nome)).slice(0, 30)
      .map((c) => clienteChave(c.razao)).join('|')), [texto, clientes])
  useEffect(() => {
    if (!onBuscaServidor) return undefined
    const t = setTimeout(() => onBuscaServidor(chaveNums || chaveClis
      ? { numeros: chaveNums ? chaveNums.split(',') : [], clientes: chaveClis ? chaveClis.split('|') : [] } : null), 400)
    return () => clearTimeout(t)
  }, [chaveNums, chaveClis, onBuscaServidor])
  const achados = useMemo(() => ordenaPorBomPara(filtraCheques(todos,
    { ...f, nomeCliente: (r) => nomeCliente(r, clientes) }, casaBusca)), [todos, f, clientes])
  return (
    <>
      <div className="chq-filtros no-print">
        <input className="fin-busca" value={f.termo} onChange={(e) => muda('termo', e.target.value)}
          placeholder="Ex.: 246 rubi — nº do cheque, pedido, cliente, emitente ou fornecedor" />
        <select value={f.situacoes[0] || ''} onChange={(e) => muda('situacoes', e.target.value ? [e.target.value] : [])}>
          <option value="">Todas as situações</option>
          {['carteira', 'depositado', 'devolvido', 'compensado', 'repassado', 'resgatado', 'cancelado']
            .map((s) => <option key={s} value={s}>{nomeSituacao(s)}</option>)}
        </select>
        <select value={f.banco} onChange={(e) => muda('banco', e.target.value)}>
          <option value="">Todos os bancos</option>
          {BANCOS.map((b) => <option key={b.codigo} value={b.codigo}>{b.codigo} · {b.nome}</option>)}
        </select>
        <label className="chq-check"><input type="checkbox" checked={f.terceiro}
          onChange={(e) => muda('terceiro', e.target.checked)} /> só de terceiro</label>
        <label className="chq-periodo">bom para de
          <input type="date" value={f.bomParaDe} onChange={(e) => muda('bomParaDe', e.target.value)} /></label>
        <label className="chq-periodo">até
          <input type="date" value={f.bomParaAte} onChange={(e) => muda('bomParaAte', e.target.value)} /></label>
      </div>
      <label className="chq-check chq-arquivo">
        <input type="checkbox" checked={arquivoLigado} onChange={(e) => onArquivo(e.target.checked)} />
        incluir os encerrados (compensados, repassados, resgatados, cancelados)
        {arquivoLigado && !arquivoPronto && <small> · carregando…</small>}
        {!arquivoLigado && <small> · o número do cheque e o cliente já procuram em tudo; isto traz os encerrados para os outros filtros</small>}
      </label>
      {/^\s*\d/.test(f.termo) && achados.length > 1 && (
        <div className="chq-explica">O número de cheque repete entre clientes: confira banco, agência e conta antes de agir.</div>
      )}
      {barra}
      <ListaCheques cheques={achados} marcados={marcados} onMarcar={onMarcar} onAbrir={onAbrir}
        clientes={clientes} hoje={hoje} todos={todos} ondeDe={f.termo.trim() ? ondeDe : null}
        vazio={arquivoLigado ? 'Nenhum cheque com esses filtros.' : 'Nenhum cheque em aberto com esses filtros — marque "incluir os encerrados" para procurar no arquivo.'} />
    </>
  )
}

// ============================================================
// MUDAR A SITUAÇÃO (uma ou várias folhas)
// ============================================================
export function ModalEvento({ para, cheques, hoje, fornecedores = SEM_LISTA, onConfirmar, onFechar }) {
  const de = cheques[0]?.situacao
  // a data é a de HOJE porque é hoje que a pessoa está registrando; ela troca
  // quando lança o que o extrato mostrou outro dia (mesma regra do Receber)
  const [data, setData] = useState(hoje)
  const empresas = [...new Set(cheques.map((c) => c.empresa))]
  const contas = contasDeDeposito(empresas.length === 1 ? empresas[0] : '')
  const [conta, setConta] = useState(para === 'depositado' && de === 'devolvido' ? (cheques[0].contaDeposito || '') : '')
  const [alineaId, setAlinea] = useState('')
  const [obs, setObs] = useState('')
  // repasse: a empresa pagadora VEM a mesma do cheque (o desenho: trocar é a
  // exceção que marca "entre empresas"); com folhas das duas empresas, a pessoa escolhe
  const [fornId, setFornId] = useState('')
  const [referencia, setReferencia] = useState('')
  const [pagadora, setPagadora] = useState(empresas.length === 1 ? empresas[0] : '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const ativos = fornecedoresAtivos(fornecedores)
  const forn = achaFornecedor(fornecedores, fornId)
  // o ACERTO (C6d): recolher do fornecedor = como a empresa pagou o fornecedor;
  // resgatado = como o cliente pagou. O valor só se digita com UMA folha — com
  // várias, vale o de cada uma (digitar um total para várias seria adivinhar a divisão).
  const acerto = (para === 'carteira' && de === 'repassado') || para === 'resgatado'
  const [formaPgto, setFormaPgto] = useState('')
  const [valorPago, setValorPago] = useState(cheques.length === 1 ? String(cheques[0].valor ?? '').replace('.', ',') : '')
  const [buscadoPor, setBuscadoPor] = useState('')
  // resgate de folha que paga parcela (C6b): o dinheiro do cliente vira o
  // recebimento da parcela, então precisa dizer em que conta entrou
  const [contaReceb, setContaReceb] = useState('')
  const pedeConta = para === 'resgatado' && formaPgto && formaPgto !== 'abatimento' && cheques.some((c) => c.cobrancaId)
  const contasReceb = contasDaEmpresa(empresas.length === 1 ? empresas[0] : '')

  // ensaio no navegador: os mesmos problemas e avisos que a transação vai achar
  const rep = para === 'repassado'
    ? { fornecedorId: fornId, fornecedorNome: forn?.nome || '', empresaPagadora: pagadora, referencia } : {}
  const acertoEv = acerto ? { formaPgto, valorPago: cheques.length === 1 ? numBR(valorPago) : undefined,
    buscadoPor: para === 'carteira' ? buscadoPor : undefined, contaRecebimento: pedeConta ? contaReceb : undefined } : {}
  const ev = { para, data, conta, alinea: alineaId, obs, porUid: 'ensaio', ...rep, ...acertoEv }
  const ensaio = cheques.map((c) => ({ c, r: aplicaEvento(c, ev, { hoje }) }))
  const problemas = [...new Set(ensaio.flatMap(({ r }) => r.problemas.map((p) => p.msg)))]
  // o mesmo aviso em várias folhas vira UMA linha ("3 folhas: …"): com 10
  // folhas entre empresas eram 10 avisos idênticos na tela e na confirmação
  const porAviso = new Map()
  for (const { c, r } of ensaio) {
    if (!r.ok) continue
    for (const a of avisosDoEvento(c, ev, hoje)) {
      if (!porAviso.has(a)) porAviso.set(a, [])
      porAviso.get(a).push(c.numero)
    }
  }
  const avisos = [...porAviso].map(([a, nums]) => (cheques.length === 1 ? a
    : nums.length === cheques.length ? `${nums.length === 1 ? 'nº ' + nums[0] : `as ${nums.length} folhas`}: ${a}`
      : `nº ${nums.join(', ')}: ${a}`))

  async function salvar() {
    if (problemas.length) { setErro(problemas.join(' · ')); return }
    if (avisos.length && !confirm(`${avisos.join('\n\n')}\n\nConfirma?`)) return
    setSalvando(true); setErro('')
    try {
      await onConfirmar({ para, data, conta: para === 'depositado' ? conta : undefined,
        alinea: para === 'devolvido' ? alineaId : undefined, obs, ...rep, ...acertoEv })
    } catch (e) {
      setErro(e?.message || String(e))
    } finally { setSalvando(false) }
  }

  return (
    <div className="assist-overlay" onClick={onFechar}>
      <div className="fin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fin-modal-head">
          <b>{nomeAcao(cheques.every((c) => c.situacao === de) ? de : '', para)} · {cheques.length} folha(s) · {fmtMoeda(somaFolhas(cheques))}</b>
          <button className="assist-x" onClick={onFechar}>✕</button>
        </div>
        <div className="fin-modal-body">
          <div className="fin-modal-sub">
            {cheques.slice(0, 6).map((c) => `nº ${c.numero} (${fmtMoeda(c.valor)})`).join(' · ')}
            {cheques.length > 6 && ` · e mais ${cheques.length - 6}`}
          </div>
          <div className="fin-cond">
            <div className="field">
              <label>{{ depositado: 'Depositado em', compensado: 'Compensou em (data do extrato)',
                devolvido: 'Devolvido em', carteira: de === 'repassado' ? 'Recolhido em' : 'Voltou para a gaveta em', resgatado: 'Resgatado em',
                repassado: 'Entregue ao fornecedor em', cancelado: 'Data' }[para]}</label>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            {para === 'depositado' && (
              <div className="field">
                <label>Conta</label>
                <select value={conta} onChange={(e) => setConta(e.target.value)}>
                  <option value="">escolha…</option>
                  {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            )}
            {para === 'devolvido' && (
              <div className="field">
                <label>Motivo (alínea)</label>
                <select value={alineaId} onChange={(e) => setAlinea(e.target.value)}>
                  <option value="">escolha…</option>
                  {ALINEAS.map((a) => <option key={a.id} value={a.id}>{nomeAlinea(a.id)}</option>)}
                </select>
              </div>
            )}
          </div>
          {para === 'repassado' && (<>
            <div className="fin-cond">
              <div className="field">
                <label>Fornecedor</label>
                <select value={fornId} onChange={(e) => setFornId(e.target.value)}>
                  <option value="">escolha…</option>
                  {ativos.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
                {!ativos.length && <small className="chq-dica chq-dica-aviso">Nenhum fornecedor ativo: cadastre em Cadastros › Fornecedores.</small>}
              </div>
              <div className="field">
                <label>Empresa que está pagando</label>
                <select value={pagadora} onChange={(e) => setPagadora(e.target.value)}>
                  <option value="">escolha…</option>
                  {EMPRESAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Para pagar o quê (referência)</label>
              <input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="ex.: NF 1234, resina de outubro" />
            </div>
          </>)}
          {acerto && (<>
            <div className="fin-cond">
              <div className="field">
                <label>{para === 'resgatado' ? 'Como o cliente pagou' : 'Como a empresa pagou o fornecedor'}</label>
                <select value={formaPgto} onChange={(e) => setFormaPgto(e.target.value)}>
                  <option value="">escolha…</option>
                  {FORMAS_ACERTO.map((f) => <option key={f.id} value={f.id}>{f.nm}</option>)}
                </select>
              </div>
              {cheques.length === 1 && (
                <div className="field">
                  <label>Valor pago</label>
                  <input value={valorPago} inputMode="decimal" onChange={(e) => setValorPago(e.target.value)} />
                </div>
              )}
              {pedeConta && (
                <div className="field">
                  <label>Entrou em</label>
                  <select value={contaReceb} onChange={(e) => setContaReceb(e.target.value)}>
                    <option value="">escolha…</option>
                    {contasReceb.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
              )}
              {para === 'carteira' && (
                <div className="field">
                  <label>Quem buscou</label>
                  <input value={buscadoPor} onChange={(e) => setBuscadoPor(e.target.value)} placeholder="opcional" />
                </div>
              )}
            </div>
            <div className="fin-explica">{para === 'resgatado'
              ? `O cliente pagou e levou a folha. Registre como e quanto ele pagou (pode ser diferente do cheque, com juros ou desconto).${
                cheques.some((c) => c.cobrancaId) ? ' A folha paga uma parcela: o que ele pagou entra como recebimento dela no Financeiro (abatimento não entra).' : ''}`
              : `A folha volta para a gaveta da empresa. Não é devolução do banco: não tem alínea e não pesa no histórico do emitente. O pagamento ao fornecedor fica só como controle — não é lançado no caixa.${
                cheques.some((c) => c.cobrancaId) ? ' A parcela que a folha pagava volta a ficar EM ABERTO no Financeiro: o recebimento do repasse é cancelado.' : ''}`}</div>
          </>)}
          {para === 'devolvido' && de === 'repassado' && (
            <div className="fin-explica">O fornecedor trouxe a folha de volta: ela entra na fila de devolvidos com o nome dele.</div>
          )}
          <div className="field">
            <label>{para === 'cancelado' || alineaId === 'outra' ? 'Motivo (obrigatório)' : 'Observação'}</label>
            <input value={obs} onChange={(e) => setObs(e.target.value)}
              placeholder={para === 'cancelado' ? 'ex.: lançado em dobro' : 'opcional'} />
          </div>
          {problemas.length > 0 && <div className="chq-problemas">{problemas.map((p) => <div key={p}>• {p}</div>)}</div>}
          {avisos.length > 0 && <div className="chq-avisos">{avisos.map((a) => <div key={a}>⚠ {a}</div>)}</div>}
          {erro && <div className="login-err" style={{ marginTop: 10 }}>{erro}</div>}
        </div>
        <div className="fin-modal-pe">
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="btn primary" onClick={salvar} disabled={salvando || problemas.length > 0}>
            {salvando ? 'Salvando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// A FICHA DA FOLHA
// ============================================================
export function FichaCheque({ cheque: c, todos, clientes, hoje, onAcao, onCorrigir, onFechar, ondeDe, onResgate }) {
  const onde = ondeDe ? ondeDe(c) : null
  const [marcandoResgate, setMarcandoResgate] = useState(false)
  const [corrigindo, setCorrigindo] = useState(false)
  const irmas = irmasDoLote(c, todos)
  const acoes = ['depositado', 'compensado', 'repassado', 'devolvido', 'carteira', 'resgatado', 'cancelado']
    .filter((para) => podeIr(c, para).ok)
  const reap = c.situacao === 'devolvido' ? podeReapresentar(c) : null
  const forn = devolvidoPeloFornecedor(c)
  return (
    <div className="assist-overlay" onClick={onFechar}>
      <div className="fin-modal chq-ficha" onClick={(e) => e.stopPropagation()}>
        <div className="fin-modal-head">
          <b>Cheque nº {c.numero} · {fmtMoeda(c.valor)}</b>
          <button className="assist-x" onClick={onFechar}>✕</button>
        </div>
        <div className="fin-modal-body">
          {!situacaoBate(c) && (
            <div className="login-err" style={{ marginBottom: 10 }}>
              A situação gravada ({nomeSituacao(c.situacao)}) não bate com o histórico. Confira o histórico abaixo antes de agir.
            </div>
          )}
          {onde && <div className="chq-onde chq-onde-ficha"><b>{onde.icone} {onde.texto}</b>{onde.detalhe ? ` · ${onde.detalhe}` : ''}</div>}
          <div className="chq-ficha-grade">
            <div><span>Situação</span><b>{nomeSituacao(c.situacao)}</b>
              {c.contaDeposito && ['depositado', 'compensado', 'devolvido'].includes(c.situacao) && <small> · {nomeConta(c.contaDeposito)}</small>}</div>
            <div><span>Bom para</span><b>{fmtDia(c.bomPara)}</b></div>
            <div><span>Banco</span><b>{c.banco?.codigo} · {c.banco?.nome || nomeBanco(c.banco?.codigo)}</b></div>
            <div><span>Agência / conta</span><b>{c.agencia} / {c.conta}</b></div>
            <div><span>Emitente</span><b>{c.emitente?.nome}</b>
              {c.emitente?.doc && <small> · {fmtDoc(c.emitente.doc)}</small>}
              {c.terceiro && <small className="chq-terc"> · cheque de terceiro</small>}</div>
            <div><span>Entregue por</span><b>{nomeCliente(c.cliente, clientes)}</b>
              {c.idVenda && <small> · pedido #{c.idVenda}</small>}
              {!c.idVenda && c.referenteA && <small> · avulso: {c.referenteA}</small>}</div>
            <div><span>Recebido em</span><b>{fmtDia(c.recebidoEm)}</b>
              <small> · {nomeEmpresa(c.empresa)}{c.tardio ? ' · lançado depois (Zeus)' : ''}</small></div>
            {c.loteTotal > 1 && <div><span>Parcelamento</span><b>folha {c.loteN} de {c.loteTotal}</b></div>}
            {c.cobrancaId && <div><span>Financeiro</span><b>💳 parcela {c.parcelaN}{c.idVenda ? ` do pedido #${c.idVenda}` : ''}</b>
              <small> · {c.movimentoId ? 'já conta como recebida' : 'conta como recebida quando compensar ou for repassado'}</small></div>}
            {c.destino && <div><span>Destino</span><b>{c.destino.fornecedorNome}</b>
              <small> · {fmtDia(c.destino.data)}{c.destino.referencia ? ` · ${c.destino.referencia}` : ''}
                {entreEmpresas(c) ? ' · ⇄ entre empresas' : ''}</small></div>}
          </div>
          {forn && <div className="chq-avisos">⚠ Voltou do fornecedor <b>{forn.fornecedorNome}</b>: a empresa voltou a dever a ele e o cliente continua devendo à empresa.</div>}
          {reap && !reap.ok && <div className="chq-avisos">⚠ Não dá para reapresentar: {reap.motivo}.</div>}
          {c.obs && <div className="fin-obs">{c.obs}</div>}

          {irmas.length > 0 && (
            <div className="chq-irmas">
              <span>As outras folhas deste parcelamento</span>
              {irmas.map((x) => (
                <div key={x.id}>nº {x.numero} · {fmtDia(x.bomPara)} · {fmtMoeda(x.valor)} · <b>{nomeSituacao(x.situacao)}</b></div>
              ))}
            </div>
          )}

          <div className="chq-hist">
            <span>Histórico</span>
            {historicoDe(c).map((e) => <EventoHist key={e.n} e={e} />)}
          </div>

          {marcandoResgate && onResgate && (
            <FormResgate jaPedido={!!c.resgatePedidoEm} hoje={hoje}
              onSalvar={async (ev) => { await onResgate(!!c.resgatePedidoEm, ev); setMarcandoResgate(false) }}
              onCancelar={() => setMarcandoResgate(false)} />
          )}
          {corrigindo && <FormCorrigir c={c} onSalvar={async (m, o) => { await onCorrigir(m, o); setCorrigindo(false) }}
            onCancelar={() => setCorrigindo(false)} />}
        </div>
        <div className="fin-modal-pe chq-ficha-pe">
          {acoes.map((para) => (
            <button key={para} className={'btn' + (para === 'cancelado' ? ' chq-perigo' : '')} onClick={() => onAcao(para)}>
              {nomeAcao(c.situacao, para)}
            </button>
          ))}
          {c.situacao === 'repassado' && onResgate && !marcandoResgate && (
            <button className="btn" onClick={() => setMarcandoResgate(true)}>
              {c.resgatePedidoEm ? 'Cliente desistiu do resgate' : '🔁 Cliente pediu resgate'}
            </button>
          )}
          {!corrigindo && c.situacao !== 'cancelado' && (
            <button className="btn" onClick={() => setCorrigindo(true)}>✎ Corrigir dados</button>
          )}
        </div>
      </div>
    </div>
  )
}

function EventoHist({ e }) {
  const titulo = nomeEvento(e)
  return (
    <div className="chq-ev">
      <b>{titulo}</b> <span>· {fmtDia(e.data)}</span>
      {e.conta && <span> · {nomeConta(e.conta) || e.conta}</span>}
      {e.alinea && <span> · {nomeAlinea(e.alinea)}</span>}
      {e.formaPgto && <span> · {nomeFormaAcerto(e.formaPgto)}{e.valorPago != null ? ` ${fmtMoeda(e.valorPago)}` : ''}</span>}
      {e.buscadoPor && <span> · buscado por {e.buscadoPor}</span>}
      {e.fornecedorNome && <span> · {e.fornecedorNome}{e.referencia ? ` · ${e.referencia}` : ''}</span>}
      {e.tipo === 'corrigido' && (
        <div className="chq-ev-mud">{Object.keys(e.depois || {}).map((k) => (
          <div key={k}>{k}: {fmtCampo(e.antes?.[k])} → {fmtCampo(e.depois[k])}</div>
        ))}</div>
      )}
      {e.obs && e.obs !== 'lançado' && <div className="chq-ev-obs">{e.obs}</div>}
      <div className="chq-ev-quem">registrado por {e.por || '—'} em {fmtDataHora(e.em)}</div>
    </div>
  )
}
const fmtCampo = (v) => (v == null || v === '' ? '—'
  : typeof v === 'object' ? (v.nome || v.codigo || JSON.stringify(v)) : String(v))

// pedir (ou desistir de) um resgate: data + observação. Só marca a folha.
function FormResgate({ jaPedido, hoje, onSalvar, onCancelar }) {
  const [data, setData] = useState(hoje)
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  async function salvar() {
    setSalvando(true); setErro('')
    try { await onSalvar({ data, obs }) } catch (e) { setErro(e?.message || String(e)) } finally { setSalvando(false) }
  }
  return (
    <div className="chq-corrige">
      <b>{jaPedido ? 'O cliente desistiu do resgate' : 'O cliente pediu o resgate desta folha'}</b>
      <small>{jaPedido ? 'A folha sai da lista de resgates a buscar e continua com o fornecedor.'
        : 'A folha entra em 🔁 Resgates para alguém ir buscar com o fornecedor. Nada muda na situação dela.'}</small>
      <div className="fin-cond">
        <div className="field"><label>{jaPedido ? 'Desistiu em' : 'Pedido em'}</label>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
        <div className="field"><label>Observação</label>
          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder={jaPedido ? 'opcional' : 'ex.: Rubi ligou, vai pagar em dinheiro'} /></div>
      </div>
      {erro && <div className="login-err">{erro}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn primary" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : (jaPedido ? 'Confirmar desistência' : 'Marcar resgate pedido')}</button>
        <button className="btn" onClick={onCancelar} disabled={salvando}>Cancelar</button>
      </div>
    </div>
  )
}

function FormCorrigir({ c, onSalvar, onCancelar }) {
  const [f, setF] = useState({
    numero: c.numero || '', valor: String(c.valor ?? '').replace('.', ','), bomPara: c.bomPara || '',
    banco: c.banco?.codigo || '', agencia: c.agencia || '', conta: c.conta || '',
    emitente: c.emitente?.nome || '', doc: c.emitente?.doc || '', terceiro: !!c.terceiro,
    idVenda: c.idVenda || '', referenteA: c.referenteA || '', obs: '',
  })
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const muda = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  async function salvar() {
    const mud = {
      numero: f.numero.trim(), valor: numBR(f.valor), bomPara: f.bomPara,
      agencia: f.agencia.trim(), conta: f.conta.trim(),
      emitente: { nome: f.emitente.trim(), doc: f.doc.trim() }, terceiro: f.terceiro, idVenda: f.idVenda.trim(),
      referenteA: f.referenteA.trim(),
    }
    if (f.banco.trim() !== String(c.banco?.codigo || '')) mud.banco = { codigo: f.banco.trim(), nome: nomeBanco(f.banco) }
    if (!f.obs.trim()) { setErro('Diga o que estava errado (fica no histórico).'); return }
    setSalvando(true); setErro('')
    try { await onSalvar(mud, f.obs.trim()) } catch (e) { setErro(e?.message || String(e)) } finally { setSalvando(false) }
  }
  return (
    <div className="chq-corrige">
      <b>Corrigir dados digitados errado</b>
      <small>O antes e o depois ficam no histórico.</small>
      <div className="fin-cond">
        <div className="field"><label>Número</label><input value={f.numero} onChange={muda('numero')} /></div>
        <div className="field"><label>Valor</label><input value={f.valor} inputMode="decimal" onChange={muda('valor')} /></div>
        <div className="field"><label>Bom para</label><input type="date" value={f.bomPara} onChange={muda('bomPara')} /></div>
      </div>
      <div className="fin-cond">
        <div className="field"><label>Banco (código)</label><input value={f.banco} onChange={muda('banco')} /></div>
        <div className="field"><label>Agência</label><input value={f.agencia} onChange={muda('agencia')} /></div>
        <div className="field"><label>Conta</label><input value={f.conta} onChange={muda('conta')} /></div>
      </div>
      <div className="fin-cond">
        <div className="field"><label>Emitente</label><input value={f.emitente} onChange={muda('emitente')} /></div>
        <div className="field"><label>CPF/CNPJ</label><input value={f.doc} onChange={muda('doc')} /></div>
        <div className="field"><label>Pedido</label><input value={f.idVenda} onChange={muda('idVenda')} /></div>
        <div className="field"><label>Referente a (avulso)</label><input value={f.referenteA} onChange={muda('referenteA')} /></div>
      </div>
      <label className="chq-check"><input type="checkbox" checked={f.terceiro} onChange={muda('terceiro')} /> cheque de terceiro</label>
      <div className="field"><label>O que estava errado</label><input value={f.obs} onChange={muda('obs')} placeholder="ex.: número digitado trocado" /></div>
      {erro && <div className="login-err">{erro}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn primary" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar correção'}</button>
        <button className="btn" onClick={onCancelar} disabled={salvando}>Cancelar</button>
      </div>
    </div>
  )
}

// ============================================================
// LANÇAR — em lote, como no Cadastro de Cheque da Zeus
// ============================================================
// `preset` (C6b): os cheques de uma COBRANÇA, aberto pelo Financeiro.
// { empresa, cliente, idVenda, cobrancaId, parcelas: [{ n, valor, venc }] } —
// empresa, pedido e cliente vêm travados (são da cobrança) e cada folha nasce
// com o valor e o vencimento da sua parcela; a pessoa digita só o nº da 1ª
// folha e os dados do talão.
export function ModalLancar({ pedidos, clientes, existentes, quem, hoje, empresaInicial, acoes, fornecedores = SEM_LISTA,
  preset = null, onFeito, onFechar }) {
  const [cab, setCab] = useState({ empresa: preset?.empresa || empresaInicial, idVenda: String(preset?.idVenda || ''),
    cliente: preset?.cliente || '', recebidoEm: hoje, tardio: false,
    // de onde veio: 'pedido' (com o nº) ou 'avulso' (sem pedido, com o "referente a")
    // a cobrança lançada à mão (sem pedido) não cobra nem um nem outro: a parcela já diz de onde veio
    origem: preset ? (preset.idVenda ? 'pedido' : '') : 'pedido', referenteA: '' })
  const [ini, setIni] = useState({ para: 'carteira', conta: '', dataDeposito: '', data: '', alinea: '',
    fornecedorId: '', empresaPagadora: '', referencia: '' })
  const [base, setBase] = useState({ banco: '', bancoOutro: '', agencia: '', conta: '', emitente: '', doc: '', terceiro: false })
  const [rep, setRep] = useState({ quantas: '1', modo: 'folha', valor: '', primeiro: '', intervalo: 'dias', dias: '30', numero: '' })
  const [folhas, setFolhas] = useState([])
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const mudaCab = (k, v) => setCab((x) => ({ ...x, [k]: v }))

  const avulso = cab.origem === 'avulso'
  const pedido = useMemo(() => (!avulso && cab.idVenda.trim()
    ? (pedidos || []).find((p) => String(p.idVenda) === cab.idVenda.trim()) : null), [pedidos, cab.idVenda, avulso])
  const codBanco = base.banco === 'outro' ? base.bancoOutro.trim() : base.banco

  // AS CONTAS QUE O CLIENTE JÁ USOU (C6a). Espera a pessoa parar de digitar
  // (cada letra seria uma consulta) e junta o que veio do servidor com o que a
  // tela já tem — a folha lançada agora há pouco ainda pode não ter voltado.
  const clienteEfetivo = cab.cliente.trim() || pedido?.cliente || ''
  const chaveCli = clienteChave(clienteEfetivo)
  const [doServidor, setDoServidor] = useState({ chave: '', lista: [] })
  const [contaUsada, setContaUsada] = useState('')
  // ⚠️ a dependência é a FUNÇÃO (estável, vem do módulo), não o objeto `acoes`:
  // ele é recriado a cada render do pai, e o efeito consultaria o servidor de
  // novo a cada render (regra 2.2 da skill de desempenho)
  const buscaCliente = acoes?.chequesDoCliente
  useEffect(() => {
    if (chaveCli.length < 3 || !buscaCliente) { setDoServidor({ chave: '', lista: [] }); return undefined }
    let vivo = true
    const t = setTimeout(() => {
      buscaCliente(chaveCli)
        .then((lista) => { if (vivo) setDoServidor({ chave: chaveCli, lista }) })
        .catch((e) => console.error('contas do cliente:', e))
    }, 500)
    return () => { vivo = false; clearTimeout(t) }
  }, [chaveCli, buscaCliente])
  const contas = useMemo(() => {
    if (chaveCli.length < 3) return []
    const porId = new Map()
    const locais = (existentes || []).filter((c) => (c.clienteChave || clienteChave(c.cliente)) === chaveCli)
    const remotos = doServidor.chave === chaveCli ? doServidor.lista : []
    for (const c of [...remotos, ...locais]) porId.set(c.id, c)
    return contasDoCliente([...porId.values()])
  }, [chaveCli, doServidor, existentes])

  function usarConta(ct) {
    // o banco do talão pode ter sido gravado como '47' e a lista usa '047'
    const naLista = BANCOS.find((b) => b.codigo.replace(/^0+/, '') === String(ct.banco.codigo).replace(/^0+/, ''))
    setBase({
      banco: naLista ? naLista.codigo : 'outro', bancoOutro: naLista ? '' : ct.banco.codigo,
      agencia: ct.agencia, conta: ct.conta, emitente: ct.emitente.nome, doc: ct.emitente.doc, terceiro: ct.terceiro,
    })
    // sugere o próximo número — a pessoa confere com a folha na mão
    if (ct.proximoNumero) setRep((r) => ({ ...r, numero: ct.proximoNumero }))
    setContaUsada(ct.chave)
  }

  function gerar() {
    if (preset) {
      const ps = preset.parcelas || []
      setFolhas(geraFolhas({
        quantas: ps.length, valor: { modo: 'folha', valor: 0 }, primeiroBomPara: ps[0]?.venc || '',
        intervalo: { tipo: 'dias', dias: 30 }, numeroInicial: rep.numero.trim(),
        base: { banco: { codigo: codBanco, nome: nomeBanco(codBanco) }, agencia: base.agencia.trim(), conta: base.conta.trim(),
          emitente: { nome: base.emitente.trim(), doc: base.doc.trim() }, terceiro: base.terceiro },
      }).map((f, i) => ({ ...f, valor: ps[i].valor, bomPara: ps[i].venc || '', cobrancaId: preset.cobrancaId, parcelaN: ps[i].n })))
      return
    }
    const quantas = Math.max(1, Math.min(48, Number(rep.quantas) || 1))
    setFolhas(geraFolhas({
      quantas, valor: { modo: rep.modo, valor: numBR(rep.valor) }, primeiroBomPara: rep.primeiro,
      intervalo: rep.intervalo === 'mes' ? { tipo: 'mes' } : { tipo: 'dias', dias: Number(rep.dias) || 30 },
      numeroInicial: rep.numero.trim(),
      base: { banco: { codigo: codBanco, nome: nomeBanco(codBanco) }, agencia: base.agencia.trim(), conta: base.conta.trim(),
        emitente: { nome: base.emitente.trim(), doc: base.doc.trim() }, terceiro: base.terceiro },
    }).map((f) => ({ ...f, valor: Number.isFinite(f.valor) ? f.valor : '' })))
  }
  const mudaFolha = (i, k, v) => setFolhas((fs) => fs.map((f, j) => (j !== i ? f
    : k === 'banco' ? { ...f, banco: { codigo: v, nome: nomeBanco(v) } }
      : k === 'emitente' ? { ...f, emitente: { ...f.emitente, nome: v } }
        : k === 'doc' ? { ...f, emitente: { ...f.emitente, doc: v } }
          : { ...f, [k]: v })))

  // as folhas como vão para o banco (valor digitado em formato brasileiro)
  const prontas = folhas.map((f) => ({ ...f, valor: typeof f.valor === 'number' ? f.valor : numBR(f.valor) }))
  // cheque antigo já repassado: o nome do fornecedor vai junto (é o que fica no cheque)
  const iniFinal = ini.para === 'repassado'
    ? { para: 'repassado', data: ini.data, fornecedorId: ini.fornecedorId,
      fornecedorNome: achaFornecedor(fornecedores, ini.fornecedorId)?.nome || '',
      empresaPagadora: ini.empresaPagadora || cab.empresa, referencia: ini.referencia }
    : ini
  const cabFinal = { ...cab, cliente: cab.cliente.trim() || pedido?.cliente || '', inicial: cab.tardio ? iniFinal : null }
  const previa = folhas.length ? chequesDoLote(cabFinal, prontas, { loteId: 'previa', ...quem, hoje }) : null
  const repetidas = folhas.length ? repetidasNoLote(prontas, existentes) : {}
  const soma = somaFolhas(prontas.filter((f) => Number.isFinite(f.valor)))

  async function salvar() {
    if (!previa?.ok) { setErro('Corrija o que está marcado antes de salvar.'); return }
    setSalvando(true); setErro('')
    try {
      // repetição contra TODO o banco, inclusive o arquivo que a tela não carrega
      const noBanco = (await acoes.chequesComChaves(prontas.map(chaveCheque)))
        .filter((c) => c.situacao !== 'cancelado')
      const avisos = [
        ...Object.keys(repetidas).map((i) => `folha ${Number(i) + 1} (nº ${prontas[i].numero}) repete uma folha ${repetidas[i][0].origem === 'lote' ? 'deste lote' : 'já lançada'}`),
        ...noBanco.filter((c) => !existentes.some((x) => x.id === c.id))
          .map((c) => `nº ${c.numero} já existe no arquivo (${nomeSituacao(c.situacao)})`),
      ]
      if (avisos.length && !confirm(`${avisos.join('\n')}\n\nLançar mesmo assim?`)) { setSalvando(false); return }
      if (!confirm(`Conferiu número, data e valor de cada folha com o papel na mão?\n\n${prontas.length} folha(s) · ${fmtMoeda(soma)}`)) {
        setSalvando(false); return
      }
      const loteId = acoes.novoLoteId()
      const r = chequesDoLote(cabFinal, prontas, { loteId, ...quem, hoje })
      if (!r.ok) throw new Error(r.problemas.map((p) => p.msg).join('; '))
      await acoes.gravaLote(r.cheques)
      onFeito(r.cheques)
    } catch (e) {
      setErro(e?.message || String(e))
    } finally { setSalvando(false) }
  }

  const probPorFolha = {}
  const probCab = []
  for (const p of previa?.problemas || []) {
    if (p.indice < 0) probCab.push(p.msg)
    else (probPorFolha[p.indice] ||= []).push(p.msg)
  }

  return (
    <div className="assist-overlay" onClick={onFechar}>
      <div className="fin-modal chq-lancar" onClick={(e) => e.stopPropagation()}>
        <div className="fin-modal-head">
          <b>{preset ? 'Lançar os cheques da cobrança' : 'Lançar cheques'}</b>
          <button className="assist-x" onClick={onFechar}>✕</button>
        </div>
        <div className="fin-modal-body">
          {preset && (
            <div className="chq-preset">
              💳 #{preset.idVenda} · {nomeCliente(preset.cliente, clientes)} — {preset.parcelas.length} parcela(s) ·{' '}
              <b>{fmtMoeda(somaFolhas(preset.parcelas))}</b>
              <small>A parcela conta como recebida quando o cheque compensar ou for repassado; se ele voltar, ela reabre.</small>
            </div>
          )}
          <div className="chq-bloco"><span>De onde veio</span>
            {!preset && (
              <div className="modo-btns chq-origem">
                {[['pedido', 'Ligado a pedido'], ['avulso', 'Avulso (sem pedido)']].map(([id, nm]) => (
                  <button key={id} type="button" className={'modo-btn' + (cab.origem === id ? ' ativo' : '')}
                    aria-pressed={cab.origem === id} onClick={() => mudaCab('origem', id)}>{nm}</button>
                ))}
              </div>
            )}
            <div className="fin-cond">
              <div className="field"><label>Empresa que recebeu</label>
                <select value={cab.empresa} disabled={!!preset} onChange={(e) => mudaCab('empresa', e.target.value)}>
                  {EMPRESAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select></div>
              {!avulso && <div className="field"><label>Pedido</label>
                <input value={cab.idVenda} inputMode="numeric" readOnly={!!preset} onChange={(e) => mudaCab('idVenda', e.target.value)} placeholder="5458" />
                {pedido && <small className="chq-dica">{nomeCliente(pedido.cliente, clientes)}</small>}</div>}
              <div className="field"><label>Recebido em</label>
                <input type="date" value={cab.recebidoEm} onChange={(e) => mudaCab('recebidoEm', e.target.value)} /></div>
            </div>
            <div className="field"><label>Cliente que entregou</label>
              <input value={cab.cliente} list="chq-clientes" readOnly={!!preset} onChange={(e) => mudaCab('cliente', e.target.value)}
                placeholder={pedido ? `${pedido.cliente} (do pedido)` : 'razão social do cliente'} />
              <datalist id="chq-clientes">
                {(clientes || []).slice(0, 2000).map((c) => <option key={c.razao} value={c.razao}>{c.nome}</option>)}
              </datalist></div>
            {avulso && <div className="field"><label>Referente a</label>
              <input value={cab.referenteA} onChange={(e) => mudaCab('referenteA', e.target.value)}
                placeholder="ex.: venda no balcão, acerto de conta antiga, devolução de mercadoria" />
              <small className="chq-dica">O cheque avulso não fica ligado a pedido nem a parcela do Financeiro: compensar não baixa nenhuma cobrança.</small></div>}
            {!preset && <label className="chq-check"><input type="checkbox" checked={cab.tardio}
              onChange={(e) => mudaCab('tardio', e.target.checked)} /> cheque antigo, que estava na Zeus (já pode estar depositado ou devolvido)</label>}
            {cab.tardio && (
              <div className="fin-cond">
                <div className="field"><label>Situação hoje</label>
                  <select value={ini.para} onChange={(e) => setIni({ ...ini, para: e.target.value })}>
                    {['carteira', 'depositado', 'compensado', 'devolvido', 'repassado'].map((s) => <option key={s} value={s}>{nomeSituacao(s)}</option>)}
                  </select></div>
                {ini.para === 'repassado' && (<>
                  <div className="field"><label>Fornecedor</label>
                    <select value={ini.fornecedorId} onChange={(e) => setIni({ ...ini, fornecedorId: e.target.value })}>
                      <option value="">escolha…</option>
                      {fornecedoresAtivos(fornecedores).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select></div>
                  <div className="field"><label>Entregue em</label>
                    <input type="date" value={ini.data} onChange={(e) => setIni({ ...ini, data: e.target.value })} /></div>
                  <div className="field"><label>Pago pela</label>
                    <select value={ini.empresaPagadora || cab.empresa} onChange={(e) => setIni({ ...ini, empresaPagadora: e.target.value })}>
                      {EMPRESAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                    </select></div>
                </>)}
                {ini.para !== 'carteira' && ini.para !== 'repassado' && (<>
                  <div className="field"><label>Conta do depósito</label>
                    <select value={ini.conta} onChange={(e) => setIni({ ...ini, conta: e.target.value })}>
                      <option value="">escolha…</option>
                      {contasDeDeposito(cab.empresa).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select></div>
                  <div className="field"><label>{ini.para === 'depositado' ? 'Depositado em' : 'Depositado em'}</label>
                    <input type="date" value={ini.para === 'depositado' ? ini.data : ini.dataDeposito}
                      onChange={(e) => setIni(ini.para === 'depositado' ? { ...ini, data: e.target.value } : { ...ini, dataDeposito: e.target.value })} /></div>
                  {ini.para !== 'depositado' && (
                    <div className="field"><label>{ini.para === 'compensado' ? 'Compensou em' : 'Devolvido em'}</label>
                      <input type="date" value={ini.data} onChange={(e) => setIni({ ...ini, data: e.target.value })} /></div>)}
                  {ini.para === 'devolvido' && (
                    <div className="field"><label>Alínea</label>
                      <select value={ini.alinea} onChange={(e) => setIni({ ...ini, alinea: e.target.value })}>
                        <option value="">escolha…</option>
                        {ALINEAS.map((a) => <option key={a.id} value={a.id}>{nomeAlinea(a.id)}</option>)}
                      </select></div>)}
                </>)}
              </div>
            )}
          </div>

          <div className="chq-bloco"><span>A 1ª folha</span>
            <ContasDoCliente contas={contas} usada={contaUsada} onUsar={usarConta}
              cliente={clienteEfetivo ? nomeCliente(clienteEfetivo, clientes) : ''} />
            <div className="fin-cond">
              <div className="field"><label>Banco</label>
                <select value={base.banco} onChange={(e) => setBase({ ...base, banco: e.target.value })}>
                  <option value="">escolha…</option>
                  {BANCOS.map((b) => <option key={b.codigo} value={b.codigo}>{b.codigo} · {b.nome}</option>)}
                  <option value="outro">outro…</option>
                </select>
                {base.banco === 'outro' && <input value={base.bancoOutro} inputMode="numeric" placeholder="código"
                  onChange={(e) => setBase({ ...base, bancoOutro: e.target.value })} />}</div>
              <div className="field"><label>Agência</label><input value={base.agencia} onChange={(e) => setBase({ ...base, agencia: e.target.value })} /></div>
              <div className="field"><label>Conta</label><input value={base.conta} onChange={(e) => setBase({ ...base, conta: e.target.value })} /></div>
            </div>
            <div className="fin-cond">
              <div className="field"><label>Emitente (quem assinou)</label><input value={base.emitente} onChange={(e) => setBase({ ...base, emitente: e.target.value })} /></div>
              <div className="field"><label>CPF/CNPJ do emitente</label><input value={base.doc} onChange={(e) => setBase({ ...base, doc: e.target.value })} placeholder="opcional" /></div>
            </div>
            <label className="chq-check"><input type="checkbox" checked={base.terceiro}
              onChange={(e) => setBase({ ...base, terceiro: e.target.checked })} /> cheque de terceiro (o emitente não é o cliente)</label>
          </div>

          {preset ? (
            <div className="chq-bloco"><span>As folhas</span>
              <div className="fin-cond">
                <div className="field"><label>Nº da 1ª folha</label><input value={rep.numero} inputMode="numeric" onChange={(e) => setRep({ ...rep, numero: e.target.value })} placeholder="000246" /></div>
              </div>
              <small className="chq-dica">Uma folha por parcela, com o valor e o vencimento dela — os números seguem a sequência.</small>
              <button className="btn" onClick={gerar}>{folhas.length ? '↻ Gerar de novo' : 'Gerar folhas'}</button>
            </div>
          ) : (
          <div className="chq-bloco"><span>As folhas</span>
            <div className="fin-cond">
              <div className="field"><label>Quantas folhas</label><input value={rep.quantas} inputMode="numeric" onChange={(e) => setRep({ ...rep, quantas: e.target.value })} /></div>
              <div className="field"><label>Nº da 1ª folha</label><input value={rep.numero} inputMode="numeric" onChange={(e) => setRep({ ...rep, numero: e.target.value })} placeholder="000001" /></div>
              <div className="field"><label>Valor</label><input value={rep.valor} inputMode="decimal" onChange={(e) => setRep({ ...rep, valor: e.target.value })} /></div>
              <div className="field"><label>O valor é</label>
                <select value={rep.modo} onChange={(e) => setRep({ ...rep, modo: e.target.value })}>
                  <option value="folha">de cada folha</option>
                  <option value="total">o total (dividir)</option>
                </select></div>
            </div>
            <div className="fin-cond">
              <div className="field"><label>Bom para (1ª folha)</label><input type="date" value={rep.primeiro} onChange={(e) => setRep({ ...rep, primeiro: e.target.value })} /></div>
              <div className="field"><label>As seguintes</label>
                <select value={rep.intervalo} onChange={(e) => setRep({ ...rep, intervalo: e.target.value })}>
                  <option value="dias">a cada N dias</option>
                  <option value="mes">todo mês no mesmo dia</option>
                </select></div>
              {rep.intervalo === 'dias' && <div className="field"><label>Dias</label><input value={rep.dias} inputMode="numeric" onChange={(e) => setRep({ ...rep, dias: e.target.value })} /></div>}
            </div>
            <button className="btn" onClick={gerar}>{folhas.length ? '↻ Gerar de novo' : 'Gerar folhas'}</button>
          </div>
          )}

          {probCab.length > 0 && <div className="chq-problemas">{probCab.map((p) => <div key={p}>• {p}</div>)}</div>}

          {folhas.length > 0 && (
            <div className="chq-folhas">
              {folhas.map((f, i) => (
                <div key={i} className={'chq-folha' + (probPorFolha[i] ? ' chq-folha-erro' : repetidas[i] ? ' chq-folha-rep' : '')}>
                  <b title={f.parcelaN ? `parcela ${f.parcelaN}` : undefined}>{f.parcelaN ? `p${f.parcelaN}` : i + 1}</b>
                  <input value={f.numero} onChange={(e) => mudaFolha(i, 'numero', e.target.value)} aria-label="número" placeholder="nº" />
                  <input value={typeof f.valor === 'number' ? String(f.valor).replace('.', ',') : f.valor}
                    onChange={(e) => mudaFolha(i, 'valor', e.target.value)} inputMode="decimal" aria-label="valor" placeholder="valor" />
                  <input type="date" value={f.bomPara} onChange={(e) => mudaFolha(i, 'bomPara', e.target.value)} aria-label="bom para" />
                  <input value={f.banco?.codigo || ''} onChange={(e) => mudaFolha(i, 'banco', e.target.value)} aria-label="banco" placeholder="banco" className="chq-curto" />
                  <input value={f.agencia} onChange={(e) => mudaFolha(i, 'agencia', e.target.value)} aria-label="agência" placeholder="ag" className="chq-curto" />
                  <input value={f.conta} onChange={(e) => mudaFolha(i, 'conta', e.target.value)} aria-label="conta" placeholder="conta" />
                  <input value={f.emitente?.nome || ''} onChange={(e) => mudaFolha(i, 'emitente', e.target.value)} aria-label="emitente" placeholder="emitente" />
                  <label className="chq-check"><input type="checkbox" checked={!!f.terceiro} onChange={(e) => mudaFolha(i, 'terceiro', e.target.checked)} /> terc.</label>
                  {probPorFolha[i] && <small className="chq-folha-msg">{probPorFolha[i].join(' · ')}</small>}
                  {!probPorFolha[i] && repetidas[i] && <small className="chq-folha-msg">⚠ repete uma folha {repetidas[i][0].origem === 'lote' ? 'deste lote' : 'já lançada'}</small>}
                </div>
              ))}
              <div className="chq-soma">{folhas.length} folha(s) · <b>{fmtMoeda(soma)}</b>
                <small> · confira número, data e valor de cada folha com o papel na mão</small></div>
            </div>
          )}
          {erro && <div className="login-err" style={{ marginTop: 10 }}>{erro}</div>}
        </div>
        <div className="fin-modal-pe">
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="btn primary" onClick={salvar} disabled={salvando || !previa?.ok}>
            {salvando ? 'Salvando…' : `Lançar ${folhas.length || ''} folha(s)`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// REPASSE — recibo e aba Repassados (C4)
// ============================================================
// O repasse recém-confirmado no formato de `repassesDe`, montado com o que a
// pessoa confirmou (a atualização do servidor ainda não chegou à tela).
export function reciboDoRepasse(cheques, ev) {
  const folhas = cheques.map((c) => ({ cheque: c, voltou: false,
    entreEmpresas: !!(ev.empresaPagadora && c.empresa && ev.empresaPagadora !== c.empresa) }))
  return {
    data: ev.data, fornecedorId: ev.fornecedorId || '', fornecedorNome: ev.fornecedorNome || '',
    referencia: ev.referencia || '', empresaPagadora: ev.empresaPagadora || '', folhas,
    qtd: folhas.length, valor: somaFolhas(cheques), voltaram: 0,
    entreEmpresas: folhas.filter((f) => f.entreEmpresas).length,
  }
}

export function ModalReciboPronto({ repasse: r, onImprimir, onFechar }) {
  return (
    <div className="assist-overlay" onClick={onFechar}>
      <div className="fin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fin-modal-head">
          <b>Repasse registrado</b>
          <button className="assist-x" onClick={onFechar}>✕</button>
        </div>
        <div className="fin-modal-body">
          <p><b>{r.qtd} folha(s) · {fmtMoeda(r.valor)}</b> para <b>{r.fornecedorNome}</b> em {fmtDia(r.data)}
            {r.referencia ? <> · {r.referencia}</> : null}.</p>
          {r.entreEmpresas > 0 && (
            <div className="chq-avisos">⇄ {r.entreEmpresas} folha(s) recebida(s) por uma empresa pagando conta da outra — marcado como entre empresas.</div>
          )}
          <div className="fin-explica" style={{ marginTop: 12 }}>
            Imprima o recibo e peça a assinatura de quem recebeu pelo fornecedor. É a prova de para onde
            estas folhas foram. Dá para reimprimir depois na aba <b>Repassados</b>.
          </div>
        </div>
        <div className="fin-modal-pe">
          <button className="btn" onClick={onFechar}>Agora não</button>
          <button className="btn primary" onClick={onImprimir}>🖨 Imprimir recibo</button>
        </div>
      </div>
    </div>
  )
}

// a folha para assinar. Impressora P&B: nada de cor carregando informação.
export function ReciboRepasse({ repasse: r, fornecedores, clientes }) {
  const f = achaFornecedor(fornecedores, r.fornecedorId)
  const empresa = nomeEmpresa(r.empresaPagadora) || 'JC'
  return (
    <div className="print-only chq-recibo">
      <div className="pr-head">
        <h1>{empresa} · Recibo de entrega de cheques</h1>
        <div className="meta">entregue em {fmtDia(r.data)}<br />{r.qtd} folha(s) · {fmtMoeda(r.valor)}</div>
      </div>
      <div className="chq-recibo-forn">
        <b>Fornecedor:</b> {f?.nome || r.fornecedorNome}
        {f?.documento && <> · CNPJ/CPF {f.documento}</>}
        {r.referencia && <><br /><b>Referente a:</b> {r.referencia}</>}
      </div>
      <table className="chq-recibo-tab">
        <thead><tr><th>Nº</th><th>Banco / ag / conta</th><th>Emitente</th><th>Recebido de</th><th>Bom para</th><th className="q">Valor</th></tr></thead>
        <tbody>
          {r.folhas.map(({ cheque: c, entreEmpresas: ee }) => (
            <tr key={c.id || c.numero}>
              <td>{c.numero}</td>
              <td>{c.banco?.codigo} {c.banco?.nome || nomeBanco(c.banco?.codigo)} · {c.agencia} · {c.conta}</td>
              <td>{c.emitente?.nome}</td>
              <td>{nomeCliente(c.cliente, clientes)}{ee ? ` (${nomeEmpresa(c.empresa)})` : ''}</td>
              <td>{fmtDia(c.bomPara)}</td>
              <td className="q">{fmtMoeda(c.valor)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={5}>Total</td><td className="q">{fmtMoeda(r.valor)}</td></tr></tfoot>
      </table>
      <p className="chq-recibo-txt">
        Recebi de <b>{empresa}</b> os {r.qtd} cheque(s) acima, no valor total de <b>{fmtMoeda(r.valor)}</b>
        {r.referencia ? <>, referente a {r.referencia}</> : null}.
      </p>
      <div className="chq-recibo-ass">
        <div><span />Recebido por (nome legível)</div>
        <div><span />Assinatura</div>
        <div><span />Data</div>
      </div>
      <div className="chq-recibo-ass">
        <div><span />Entregue por ({empresa})</div>
      </div>
    </div>
  )
}

export function AbaRepassados({ estado, periodo, onPeriodo, empresa, fornecedores, marcados, onMarcar, onAbrir,
  clientes, hoje, onRecibo, barra }) {
  const [soEntre, setSoEntre] = useState(false)
  const de = cortePeriodo(periodo, hoje)
  const repasses = useMemo(() => {
    const todos = repassesDe(estado?.lista || []).filter((r) => !de || r.data >= de)
    // a empresa do topo vale para quem PAGOU e para quem RECEBEU a folha
    return todos.filter((r) => (!empresa || r.empresaPagadora === empresa
      || r.folhas.some((f) => f.cheque.empresa === empresa))
      && (!soEntre || r.entreEmpresas > 0))
  }, [estado, de, empresa, soEntre])
  const porForn = useMemo(() => repassesPorFornecedor(repasses), [repasses])
  const entre = useMemo(() => resumoEntreEmpresas(repasses), [repasses])

  return (
    <>
      <div className="chq-explica">Para onde os cheques foram: cada entrega a um fornecedor, com o recibo para
        reimprimir. Folha que voltou continua no recibo daquele dia — o papel assinado diz que ela foi entregue.</div>
      <div className="chq-filtros no-print">
        <select value={periodo} onChange={(e) => onPeriodo?.(e.target.value)}>
          {PERIODOS_REPASSE.map((p) => <option key={p.id} value={p.id}>{p.nm}</option>)}
        </select>
        <label className="chq-check"><input type="checkbox" checked={soEntre}
          onChange={(e) => setSoEntre(e.target.checked)} /> só entre empresas</label>
      </div>
      {estado?.erro && <div className="login-err">Não foi possível ler os repassados ({estado.erro}).</div>}
      {!estado?.pronto && !estado?.erro && <div className="empty">Carregando repassados…</div>}

      {estado?.pronto && entre.length > 0 && (
        <div className="chq-entre">
          <span>⇄ Entre empresas no período</span>
          {entre.map((d) => (
            <div key={`${d.de}>${d.para}`}>
              Cheques da <b>{nomeEmpresa(d.de)}</b> pagando conta da <b>{nomeEmpresa(d.para)}</b>:
              {' '}{d.qtd} folha(s) · <b>{fmtMoeda(d.valor)}</b>
            </div>
          ))}
          <small>É dinheiro de uma empresa quitando dívida da outra: a contabilidade precisa deste total todo mês.</small>
        </div>
      )}

      {estado?.pronto && barra}
      {estado?.pronto && !porForn.length && (
        <div className="fin-vazio"><p>Nenhum repasse {soEntre ? 'entre empresas ' : ''}neste período.</p></div>
      )}
      {estado?.pronto && porForn.map((g) => (
        <div key={g.fornecedorId || g.fornecedorNome} className="chq-forn">
          <div className="chq-forn-head">
            <b>{achaFornecedor(fornecedores, g.fornecedorId)?.nome || g.fornecedorNome}</b>
            <span>{g.qtd} folha(s) · {fmtMoeda(g.valor)}</span>
            {g.voltaram > 0 && <span className="chip chq-atencao">{g.voltaram} voltou(aram) · {fmtMoeda(g.valorVoltou)}</span>}
          </div>
          {g.repasses.map((r) => (
            <div key={r.chave} className="chq-rep">
              <div className="chq-rep-head">
                <span>{fmtDia(r.data)}{r.referencia ? ` · ${r.referencia}` : ''} · pago pela {nomeEmpresa(r.empresaPagadora)}</span>
                <span>{r.qtd} folha(s) · <b>{fmtMoeda(r.valor)}</b></span>
                {r.entreEmpresas > 0 && <span className="chip">⇄ entre empresas</span>}
                {r.recolhidas > 0 && <span className="chip">{r.recolhidas} recolhida(s)</span>}
                <button className="mini-btn no-print" onClick={() => onRecibo(r)}>🖨 Recibo</button>
              </div>
              <ListaCheques cheques={r.folhas.map((f) => f.cheque)} marcados={marcados} onMarcar={onMarcar}
                onAbrir={onAbrir} clientes={clientes} hoje={hoje} vazio="" corte={500} />
            </div>
          ))}
        </div>
      ))}
    </>
  )
}

// ============================================================
// CONFERÊNCIA DA GAVETA (C5) — o que o sistema diz que está aqui, no papel
// ============================================================
// Para bater com as folhas físicas: um quadradinho por folha. Entra a carteira
// E os devolvidos (o banco e o fornecedor devolvem o papel). Com o filtro de
// empresa ligado, a folha DECLARA que é parte — senão passaria por gaveta
// inteira e uma folha "faltando" seria só da outra empresa.
export function ConferenciaGaveta({ cheques, empresa, clientes, hoje }) {
  const g = gaveta(cheques)
  const bloco = (titulo, lista, valor) => (
    <>
      <div className="pr-vend">{titulo} — {lista.length} folha(s) · {fmtMoeda(valor)}</div>
      {lista.length ? (
        <table className="chq-recibo-tab">
          <thead><tr><th>✓</th><th>Nº</th><th>Banco / ag / conta</th><th>Emitente</th><th>Cliente · pedido</th>
            <th>Bom para</th><th className="q">Valor</th></tr></thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id}>
                <td className="chq-box">☐</td>
                <td>{c.numero}</td>
                <td>{c.banco?.codigo} {c.banco?.nome || nomeBanco(c.banco?.codigo)} · {c.agencia} · {c.conta}</td>
                <td>{c.emitente?.nome}{c.terceiro ? ' (terceiro)' : ''}</td>
                <td>{nomeCliente(c.cliente, clientes)}{c.idVenda ? ` · #${c.idVenda}` : c.referenteA ? ` · avulso: ${c.referenteA}` : ''}</td>
                <td>{fmtDia(c.bomPara)}</td>
                <td className="q">{fmtMoeda(c.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p>Nenhuma.</p>}
    </>
  )
  return (
    <div className="print-only chq-recibo">
      <div className="pr-head">
        <h1>Conferência da gaveta de cheques</h1>
        <div className="meta">{fmtDia(hoje)}<br />{empresa ? `só ${nomeEmpresa(empresa)}` : 'as duas empresas'}
          <br />{g.qtd} folha(s) · {fmtMoeda(g.valor)}</div>
      </div>
      {empresa && <p><b>⚠ Só os cheques da {nomeEmpresa(empresa)}.</b> As folhas da outra empresa não estão nesta lista.</p>}
      {bloco('Em carteira', g.carteira, g.valorCarteira)}
      {bloco('Devolvidos (a folha voltou para a empresa)', g.devolvidos, g.valorDevolvidos)}
      <p className="chq-recibo-txt">Marque cada folha encontrada. Folha que está na gaveta e não está aqui,
        ou que está aqui e não foi achada, precisa ser acertada no sistema.</p>
      <div className="chq-recibo-ass">
        <div><span />Conferido por</div>
        <div><span />Data</div>
      </div>
    </div>
  )
}

// ---------- as contas que o cliente já usou (C6a) ----------
// Um botão por conta: um clique preenche banco, agência, conta, emitente e
// CPF/CNPJ e sugere o próximo número. Conta nova continua sendo digitada.
export function ContasDoCliente({ contas, usada, onUsar, cliente }) {
  if (!contas?.length) return null
  return (
    <div className="chq-contas">
      <small>Contas que {cliente || 'este cliente'} já usou — clique para preencher:</small>
      {contas.map((ct) => (
        <button key={ct.chave} type="button" className={'chq-conta' + (usada === ct.chave ? ' usada' : '')}
          onClick={() => onUsar(ct)}>
          <b>{ct.emitente.nome || 'sem emitente'}</b>
          <span>{ct.banco.nome || `banco ${ct.banco.codigo}`} · ag {ct.agencia} · cc {ct.conta}{ct.terceiro ? ' · de terceiro' : ''}</span>
          <span>último nº {ct.ultimoNumero} · {ct.vezes} folha(s){ct.proximoNumero ? ` · próximo ${ct.proximoNumero}` : ''}</span>
        </button>
      ))}
    </div>
  )
}
