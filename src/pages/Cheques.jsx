// CHEQUES — origem, situação e destino de cada folha (CHEQUES.md, fase C3).
//
// A regra mora em `src/lib/cheques.js` (portátil, vai para o TotaliFinance);
// esta tela só desenha e grava. Quem lança e vê: dono e financeiro.
//
// O REPASSE a fornecedor é a fase C4 — aqui a ação "Repassar" ainda não
// aparece, mas cheque já repassado (lançado depois) é lido normalmente.
import { useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import SubTabs from '../components/SubTabs.jsx'
import {
  EMPRESAS, nomeEmpresa, CONTAS, contasDaEmpresa, nomeConta, fmtMoeda, fmtDia, hojeISO,
  nomeCliente, casaBusca, veFinanceiro, fmtDataHora,
} from '../utils.js'
import {
  BANCOS, ALINEAS, nomeAlinea, nomeBanco, nomeSituacao, nomeAcao, nomeEvento, geraFolhas, somaFolhas,
  chequesDoLote, repetidasNoLote, aplicaEvento, avisosDoEvento, acoesComuns, podeIr,
  podeReapresentar, devolucoesDe, ultimaDevolucao, devolvidoPeloFornecedor, irmasDoLote,
  diasParaBomPara, diasDepositado, compensacaoAtrasada, totaisCheques, ordenaPorBomPara,
  filtraCheques, historicoDe, situacaoBate, entreEmpresas, chaveCheque, fmtDoc, ehViva,
} from '../lib/cheques.js'
import {
  useChequesVivos, useChequesArquivo, gravaLote, novoLoteId, chequesComChaves,
  aplicaEmLote, corrigeNoServidor,
} from '../hooks/useCheques.js'

// o repasse é a C4: até lá a ação não é oferecida em lugar nenhum
const ACAO_DESTA_FASE = (para) => para !== 'repassado'
const LIMITE_LISTA = 60

// onde um cheque pode ser DEPOSITADO: só conta de banco. A Cielo é a
// maquininha e o caixa interno é a gaveta — ninguém deposita cheque neles.
const NAO_DEPOSITA = ['cielo', 'caixa']
export const contasDeDeposito = (empresa) =>
  (empresa ? contasDaEmpresa(empresa) : CONTAS).filter((c) => !NAO_DEPOSITA.includes(c.id))

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
  if (!ligado) return <div className="empty">Esta tela é só do financeiro.</div>
  const quem = { por: nome || '', porUid: user?.uid || '' }
  const acoes = {
    novoLoteId,
    gravaLote,
    chequesComChaves,
    aplicar: (ids, ev) => aplicaEmLote(ids, { ...ev, ...quem }, { hoje: hojeISO() }),
    corrigir: (id, mudancas, obs) => corrigeNoServidor(id, mudancas, { ...quem, obs }),
  }
  return (
    <TelaCheques vivos={vivos} arquivo={arquivo} arquivoLigado={arquivoLigado}
      onArquivo={setArquivoLigado} pedidos={pedidos} clientes={clientes}
      quem={quem} hoje={hojeISO()} acoes={acoes} />
  )
}

// ============================================================
// A TELA (sem hook de dados: o teste monta com dados)
// ============================================================
export function TelaCheques({ vivos, arquivo, arquivoLigado, onArquivo, pedidos, clientes, quem, hoje, acoes,
  abaInicial = 'carteira' }) {
  const [empresa, setEmpresa] = useState('')            // '' = as duas
  const [aba, setAba] = useState(abaInicial)
  const [marcados, setMarcados] = useState([])          // ids
  const [lancando, setLancando] = useState(false)
  const [evento, setEvento] = useState(null)            // { para, cheques }
  const [abertoId, setAbertoId] = useState('')
  const [msg, setMsg] = useState('')
  const avisa = (m) => { setMsg(m); setTimeout(() => setMsg((x) => (x === m ? '' : x)), 5000) }

  const todos = useMemo(() => {
    const porId = new Map()
    for (const c of [...(vivos?.lista || []), ...(arquivo?.lista || [])]) porId.set(c.id, c)
    return [...porId.values()]
  }, [vivos, arquivo])
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
    { id: 'localizar', label: '🔍 Localizar' },
  ]

  const porId = useMemo(() => new Map(todos.map((c) => [c.id, c])), [todos])
  const marcadosCheques = marcados.map((id) => porId.get(id)).filter(Boolean)
  const aberto = abertoId ? porId.get(abertoId) : null
  const trocaAba = (id) => { setAba(id); setMarcados([]) }
  const marca = (id) => setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))

  async function confirmarEvento(ev) {
    await acoes.aplicar(evento.cheques.map((c) => c.id), ev)
    avisa(`${evento.cheques.length} folha(s) → ${nomeSituacao(evento.para)}.`)
    setEvento(null); setMarcados([])
  }

  const lista = { carteira, depositados, devolvidos }[aba]
  return (
    <>
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

      {vivos?.pronto && aba !== 'localizar' && (
        <>
          <Explica aba={aba} />
          <BarraSelecao cheques={marcadosCheques} onAcao={(para) => setEvento({ para, cheques: marcadosCheques })}
            onLimpar={() => setMarcados([])} />
          <ListaCheques cheques={lista} marcados={marcados} onMarcar={marca} onAbrir={setAbertoId}
            clientes={clientes} hoje={hoje} todos={todos}
            vazio={{ carteira: 'Nenhum cheque na gaveta.', depositados: 'Nenhum cheque esperando compensar.',
              devolvidos: 'Nenhum cheque devolvido para resolver.' }[aba]} />
        </>
      )}
      {aba === 'localizar' && (
        <AbaLocalizar todos={daEmpresa} arquivoLigado={arquivoLigado} onArquivo={onArquivo}
          arquivoPronto={!!arquivo?.pronto} marcados={marcados} onMarcar={marca} onAbrir={setAbertoId}
          clientes={clientes} hoje={hoje}
          barra={<BarraSelecao cheques={marcadosCheques} onAcao={(para) => setEvento({ para, cheques: marcadosCheques })}
            onLimpar={() => setMarcados([])} />} />
      )}

      {lancando && (
        <ModalLancar pedidos={pedidos} clientes={clientes} existentes={todos} quem={quem} hoje={hoje}
          empresaInicial={empresa || 'sacolas'} acoes={acoes}
          onFeito={(cs) => {
            setLancando(false)
            // cheque antigo que já entra compensado/resgatado vai para o ARQUIVO,
            // que esta tela não carrega: sem dizer onde está, parece que não gravou
            const noArquivo = cs.filter((c) => !ehViva(c.situacao)).length
            avisa(`${cs.length} folha(s) lançada(s).` + (noArquivo
              ? ` ${noArquivo} já encerrada(s) — está(ão) em 🔍 Localizar, com "incluir os encerrados".` : ''))
            setAba('carteira')
          }}
          onFechar={() => setLancando(false)} />
      )}
      {evento && (
        <ModalEvento para={evento.para} cheques={evento.cheques} hoje={hoje}
          onConfirmar={confirmarEvento} onFechar={() => setEvento(null)} />
      )}
      {aberto && !evento && (
        <FichaCheque cheque={aberto} todos={todos} clientes={clientes} hoje={hoje}
          onAcao={(para) => setEvento({ para, cheques: [aberto] })}
          onCorrigir={async (mud, obs) => { await acoes.corrigir(aberto.id, mud, obs); avisa('Cheque corrigido.') }}
          onFechar={() => setAbertoId('')} />
      )}
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
  const acoes = acoesComuns(cheques).filter(ACAO_DESTA_FASE)
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
export function ListaCheques({ cheques, marcados, onMarcar, onAbrir, clientes, hoje, todos, vazio, corte = LIMITE_LISTA }) {
  if (!cheques.length) return <div className="fin-vazio"><p>{vazio}</p></div>
  const mostra = cheques.slice(0, corte)
  return (
    <div className="chq-lista">
      {mostra.map((c) => (
        <LinhaCheque key={c.id} c={c} marcado={marcados.includes(c.id)} onMarcar={() => onMarcar(c.id)}
          onAbrir={() => onAbrir(c.id)} clientes={clientes} hoje={hoje} todos={todos} />
      ))}
      {cheques.length > corte && (
        <div className="fin-corte">Mostrando {corte} de {cheques.length} — refine a busca para ver o resto.</div>
      )}
    </div>
  )
}

function LinhaCheque({ c, marcado, onMarcar, onAbrir, clientes, hoje }) {
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
    </div>
  )
}

// ---------- localizar (inclui o arquivo, sob demanda) ----------
const FILTRO_VAZIO = { termo: '', situacoes: [], banco: '', terceiro: false, bomParaDe: '', bomParaAte: '' }
export function AbaLocalizar({ todos, arquivoLigado, onArquivo, arquivoPronto, marcados, onMarcar, onAbrir, clientes, hoje, barra }) {
  const [f, setF] = useState(FILTRO_VAZIO)
  const muda = (campo, v) => setF((x) => ({ ...x, [campo]: v }))
  const achados = useMemo(() => ordenaPorBomPara(filtraCheques(todos,
    { ...f, nomeCliente: (r) => nomeCliente(r, clientes) }, casaBusca)), [todos, f, clientes])
  return (
    <>
      <div className="chq-filtros no-print">
        <input className="fin-busca" value={f.termo} onChange={(e) => muda('termo', e.target.value)}
          placeholder="Nº do cheque, nº do pedido, cliente, emitente ou fornecedor…" />
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
        {!arquivoLigado && <small> · sem isto, a busca olha só a carteira, os depositados e os devolvidos</small>}
      </label>
      {/^\s*\d/.test(f.termo) && achados.length > 1 && (
        <div className="chq-explica">O número de cheque repete entre clientes: confira banco, agência e conta antes de agir.</div>
      )}
      {barra}
      <ListaCheques cheques={achados} marcados={marcados} onMarcar={onMarcar} onAbrir={onAbrir}
        clientes={clientes} hoje={hoje} todos={todos}
        vazio={arquivoLigado ? 'Nenhum cheque com esses filtros.' : 'Nenhum cheque em aberto com esses filtros — marque "incluir os encerrados" para procurar no arquivo.'} />
    </>
  )
}

// ============================================================
// MUDAR A SITUAÇÃO (uma ou várias folhas)
// ============================================================
export function ModalEvento({ para, cheques, hoje, onConfirmar, onFechar }) {
  const de = cheques[0]?.situacao
  // a data é a de HOJE porque é hoje que a pessoa está registrando; ela troca
  // quando lança o que o extrato mostrou outro dia (mesma regra do Receber)
  const [data, setData] = useState(hoje)
  const empresas = [...new Set(cheques.map((c) => c.empresa))]
  const contas = contasDeDeposito(empresas.length === 1 ? empresas[0] : '')
  const [conta, setConta] = useState(para === 'depositado' && de === 'devolvido' ? (cheques[0].contaDeposito || '') : '')
  const [alineaId, setAlinea] = useState('')
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // ensaio no navegador: os mesmos problemas e avisos que a transação vai achar
  const ev = { para, data, conta, alinea: alineaId, obs, porUid: 'ensaio' }
  const ensaio = cheques.map((c) => ({ c, r: aplicaEvento(c, ev, { hoje }) }))
  const problemas = [...new Set(ensaio.flatMap(({ r }) => r.problemas.map((p) => p.msg)))]
  const avisos = ensaio.flatMap(({ c, r }) => (r.ok ? avisosDoEvento(c, ev, hoje)
    .map((a) => (cheques.length > 1 ? `nº ${c.numero}: ${a}` : a)) : []))

  async function salvar() {
    if (problemas.length) { setErro(problemas.join(' · ')); return }
    if (avisos.length && !confirm(`${avisos.join('\n\n')}\n\nConfirma?`)) return
    setSalvando(true); setErro('')
    try {
      await onConfirmar({ para, data, conta: para === 'depositado' ? conta : undefined,
        alinea: para === 'devolvido' ? alineaId : undefined, obs })
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
                devolvido: 'Devolvido em', carteira: 'Voltou para a gaveta em', resgatado: 'Resgatado em',
                cancelado: 'Data' }[para]}</label>
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
export function FichaCheque({ cheque: c, todos, clientes, hoje, onAcao, onCorrigir, onFechar }) {
  const [corrigindo, setCorrigindo] = useState(false)
  const irmas = irmasDoLote(c, todos)
  const acoes = Object.keys({ depositado: 1, compensado: 1, devolvido: 1, carteira: 1, resgatado: 1, cancelado: 1 })
    .filter((para) => ACAO_DESTA_FASE(para) && podeIr(c, para).ok)
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
              {c.idVenda && <small> · pedido #{c.idVenda}</small>}</div>
            <div><span>Recebido em</span><b>{fmtDia(c.recebidoEm)}</b>
              <small> · {nomeEmpresa(c.empresa)}{c.tardio ? ' · lançado depois (Zeus)' : ''}</small></div>
            {c.loteTotal > 1 && <div><span>Parcelamento</span><b>folha {c.loteN} de {c.loteTotal}</b></div>}
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

          {corrigindo && <FormCorrigir c={c} onSalvar={async (m, o) => { await onCorrigir(m, o); setCorrigindo(false) }}
            onCancelar={() => setCorrigindo(false)} />}
        </div>
        <div className="fin-modal-pe chq-ficha-pe">
          {acoes.map((para) => (
            <button key={para} className={'btn' + (para === 'cancelado' ? ' chq-perigo' : '')} onClick={() => onAcao(para)}>
              {nomeAcao(c.situacao, para)}
            </button>
          ))}
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
      {e.fornecedorNome && <span> · {e.fornecedorNome}</span>}
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

function FormCorrigir({ c, onSalvar, onCancelar }) {
  const [f, setF] = useState({
    numero: c.numero || '', valor: String(c.valor ?? '').replace('.', ','), bomPara: c.bomPara || '',
    banco: c.banco?.codigo || '', agencia: c.agencia || '', conta: c.conta || '',
    emitente: c.emitente?.nome || '', doc: c.emitente?.doc || '', terceiro: !!c.terceiro,
    idVenda: c.idVenda || '', obs: '',
  })
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const muda = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  async function salvar() {
    const mud = {
      numero: f.numero.trim(), valor: numBR(f.valor), bomPara: f.bomPara,
      agencia: f.agencia.trim(), conta: f.conta.trim(),
      emitente: { nome: f.emitente.trim(), doc: f.doc.trim() }, terceiro: f.terceiro, idVenda: f.idVenda.trim(),
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
export function ModalLancar({ pedidos, clientes, existentes, quem, hoje, empresaInicial, acoes, onFeito, onFechar }) {
  const [cab, setCab] = useState({ empresa: empresaInicial, idVenda: '', cliente: '', recebidoEm: hoje, tardio: false })
  const [ini, setIni] = useState({ para: 'carteira', conta: '', dataDeposito: '', data: '', alinea: '' })
  const [base, setBase] = useState({ banco: '', bancoOutro: '', agencia: '', conta: '', emitente: '', doc: '', terceiro: false })
  const [rep, setRep] = useState({ quantas: '1', modo: 'folha', valor: '', primeiro: '', intervalo: 'dias', dias: '30', numero: '' })
  const [folhas, setFolhas] = useState([])
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const mudaCab = (k, v) => setCab((x) => ({ ...x, [k]: v }))

  const pedido = useMemo(() => (cab.idVenda.trim()
    ? (pedidos || []).find((p) => String(p.idVenda) === cab.idVenda.trim()) : null), [pedidos, cab.idVenda])
  const codBanco = base.banco === 'outro' ? base.bancoOutro.trim() : base.banco

  function gerar() {
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
  const cabFinal = { ...cab, cliente: cab.cliente.trim() || pedido?.cliente || '', inicial: cab.tardio ? ini : null }
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
          <b>Lançar cheques</b>
          <button className="assist-x" onClick={onFechar}>✕</button>
        </div>
        <div className="fin-modal-body">
          <div className="chq-bloco"><span>De onde veio</span>
            <div className="fin-cond">
              <div className="field"><label>Empresa que recebeu</label>
                <select value={cab.empresa} onChange={(e) => mudaCab('empresa', e.target.value)}>
                  {EMPRESAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select></div>
              <div className="field"><label>Pedido (opcional)</label>
                <input value={cab.idVenda} inputMode="numeric" onChange={(e) => mudaCab('idVenda', e.target.value)} placeholder="5458" />
                {pedido && <small className="chq-dica">{nomeCliente(pedido.cliente, clientes)}</small>}</div>
              <div className="field"><label>Recebido em</label>
                <input type="date" value={cab.recebidoEm} onChange={(e) => mudaCab('recebidoEm', e.target.value)} /></div>
            </div>
            <div className="field"><label>Cliente que entregou</label>
              <input value={cab.cliente} list="chq-clientes" onChange={(e) => mudaCab('cliente', e.target.value)}
                placeholder={pedido ? `${pedido.cliente} (do pedido)` : 'razão social do cliente'} />
              <datalist id="chq-clientes">
                {(clientes || []).slice(0, 2000).map((c) => <option key={c.razao} value={c.razao}>{c.nome}</option>)}
              </datalist></div>
            <label className="chq-check"><input type="checkbox" checked={cab.tardio}
              onChange={(e) => mudaCab('tardio', e.target.checked)} /> cheque antigo, que estava na Zeus (já pode estar depositado ou devolvido)</label>
            {cab.tardio && (
              <div className="fin-cond">
                <div className="field"><label>Situação hoje</label>
                  <select value={ini.para} onChange={(e) => setIni({ ...ini, para: e.target.value })}>
                    {['carteira', 'depositado', 'compensado', 'devolvido'].map((s) => <option key={s} value={s}>{nomeSituacao(s)}</option>)}
                  </select></div>
                {ini.para !== 'carteira' && (<>
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

          {probCab.length > 0 && <div className="chq-problemas">{probCab.map((p) => <div key={p}>• {p}</div>)}</div>}

          {folhas.length > 0 && (
            <div className="chq-folhas">
              {folhas.map((f, i) => (
                <div key={i} className={'chq-folha' + (probPorFolha[i] ? ' chq-folha-erro' : repetidas[i] ? ' chq-folha-rep' : '')}>
                  <b>{i + 1}</b>
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
