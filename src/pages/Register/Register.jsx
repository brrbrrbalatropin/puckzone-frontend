import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { register as registerRequest } from '../../services/authService'
import { useAuth } from '../../hooks/useAuth'

// Correo universitario colombiano: algo@[subdominios.]universidad.edu.co
const EDU_CO_REGEX = /^[^@\s]+@(?:[a-z0-9-]+\.)*([a-z0-9-]+)\.edu\.co$/i

/**
 * La universidad es el segmento justo antes de .edu.co
 * (correo.unal.edu.co -> "unal"). Se muestra en vivo como feedback.
 */
function detectUniversity(email) {
  const match = email.trim().match(EDU_CO_REGEX)
  return match ? match[1].toLowerCase() : null
}

export default function Register() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [form, setForm] = useState({ username: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const university = detectUniversity(form.email)

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const validate = () => {
    if (form.username.trim().length < 3 || form.username.trim().length > 30) {
      return 'El nombre de usuario debe tener entre 3 y 30 caracteres.'
    }
    if (!EDU_CO_REGEX.test(form.email.trim())) {
      return 'Debes usar un correo universitario colombiano (.edu.co).'
    }
    if (form.password.length < 8) {
      return 'La contraseña debe tener al menos 8 caracteres.'
    }
    return ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setError('')
    setLoading(true)
    try {
      // El registro ya devuelve token: se inicia sesion de una vez.
      const authResponse = await registerRequest({
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
      })
      login(authResponse)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo completar el registro.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="logo">
          Puck<span>Zone</span>
        </h1>
        <h2>Crear cuenta</h2>

        <form onSubmit={handleSubmit}>
          <label>
            <span>Nombre de usuario</span>
            <input
              type="text"
              name="username"
              value={form.username}
              onChange={handleChange}
              minLength={3}
              maxLength={30}
              autoComplete="username"
              required
            />
          </label>

          <label>
            <span>Correo institucional (.edu.co)</span>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="tu@escuelaing.edu.co"
              autoComplete="email"
              required
            />
          </label>

          {university && (
            <p className="university-hint">
              Universidad detectada: <strong>{university}</strong>
            </p>
          )}

          <label>
            <span>Contraseña (mínimo 8 caracteres)</span>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              minLength={8}
              autoComplete="new-password"
              required
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? 'Creando cuenta…' : 'Registrarme'}
          </button>
        </form>

        <p className="auth-switch">
          ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
        </p>
      </div>
    </div>
  )
}
