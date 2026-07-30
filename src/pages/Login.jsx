import { useState } from 'react'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../firebase.js'
import { useAuth } from '../contexts/AuthContext.jsx'

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [verSenha, setVerSenha] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setErro(''); setOk(''); setBusy(true)
    try {
      await login(email, senha)
    } catch (e) {
      const map = {
        'auth/invalid-credential': 'E-mail ou senha incorretos.',
        'auth/invalid-email': 'E-mail inválido.',
        'auth/user-not-found': 'Usuário não encontrado.',
        'auth/wrong-password': 'Senha incorreta.',
        'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco.',
        'auth/api-key-not-valid': 'API key inválida — confira src/firebase.js.',
        'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'API key inválida — confira src/firebase.js.',
      }
      setErro(map[e.code] || ('Erro: ' + e.code))
    } finally {
      setBusy(false)
    }
  }

  // envia o link de redefinição de senha para o e-mail digitado
  async function recuperarSenha() {
    setErro(''); setOk('')
    if (!email.trim()) {
      setErro('Digite o seu e-mail no campo acima para receber o link de redefinição.')
      return
    }
    setBusy(true)
    try {
      await sendPasswordResetEmail(auth, email.trim())
      setOk(`Enviamos um link de redefinição para ${email.trim()}. Confira o seu e-mail (e a caixa de spam).`)
    } catch (e) {
      const map = {
        'auth/invalid-email': 'E-mail inválido.',
        'auth/user-not-found': 'Não encontrei uma conta com esse e-mail.',
        'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente de novo.',
      }
      setErro(map[e.code] || ('Erro ao enviar o link: ' + e.code))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand"><span className="dot" /> JC Sacolas</div>
        <p className="sub">Controle de Produção</p>

        {erro && <div className="login-err">{erro}</div>}
        {ok && <div className="login-ok">{ok}</div>}

        <div className="field">
          <label>E-mail</label>
          <input
            type="email" value={email} autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
        <div className="field">
          <label>Senha</label>
          <div className="senha-wrap">
            <input
              type={verSenha ? 'text' : 'password'} value={senha} autoComplete="current-password"
              onChange={(e) => setSenha(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
            <button type="button" className="senha-olho" onClick={() => setVerSenha((v) => !v)}
              title={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
              aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}>
              {verSenha ? '🙈' : '👁'}
            </button>
          </div>
        </div>

        <button className="btn primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
          onClick={submit} disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>

        <button type="button" className="login-link" onClick={recuperarSenha} disabled={busy}>
          Esqueci minha senha
        </button>
      </div>
    </div>
  )
}
