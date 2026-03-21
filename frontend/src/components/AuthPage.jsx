import { useState, useContext } from 'react';
import { Sparkles, Eye, EyeOff, Loader2 } from 'lucide-react';
import { RedditContext } from '../context/RedditContext';

export default function AuthPage() {
  const { loginUser, registerUser } = useContext(RedditContext);
  const [tab, setTab] = useState('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirm, setShowRegConfirm] = useState(false);

  const [fieldErrors, setFieldErrors] = useState({});

  function validateLogin() {
    const errs = {};
    if (!loginUsername.trim()) errs.username = 'Username is required';
    if (!loginPassword) errs.password = 'Password is required';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function validateRegister() {
    const errs = {};
    if (!regUsername.trim()) {
      errs.username = 'Username is required';
    } else if (regUsername.length < 3 || regUsername.length > 50) {
      errs.username = 'Must be 3\u201350 characters';
    } else if (!/^[a-zA-Z0-9_-]+$/.test(regUsername)) {
      errs.username = 'Only letters, numbers, _ and - allowed';
    }
    if (!regEmail.trim()) {
      errs.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail)) {
      errs.email = 'Invalid email format';
    }
    if (!regPassword) {
      errs.password = 'Password is required';
    } else if (regPassword.length < 6) {
      errs.password = 'Minimum 6 characters';
    }
    if (regPassword !== regConfirm) {
      errs.confirm = 'Passwords do not match';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleLogin(e) {
    e.preventDefault();
    if (!validateLogin()) return;
    setLoading(true);
    setError('');
    try {
      await loginUser(loginUsername.trim(), loginPassword);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    if (!validateRegister()) return;
    setLoading(true);
    setError('');
    try {
      await registerUser(regUsername.trim(), regEmail.trim(), regPassword);
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  function switchTab(newTab) {
    setTab(newTab);
    setError('');
    setFieldErrors({});
  }

  const inputBase =
    'w-full px-3.5 py-2.5 border rounded-xl text-sm bg-gray-50/60 transition-all focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400 focus:bg-white';
  const inputErr = 'border-red-300 bg-red-50/40 focus:ring-red-400/40 focus:border-red-400';
  const inputOk = 'border-gray-200 hover:border-gray-300';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 bg-violet-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-violet-400/30">
            <Sparkles size={28} />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">DebateAI</h1>
            <p className="text-sm text-gray-500 mt-0.5">AI-powered debate analysis</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white/90 backdrop-blur rounded-2xl shadow-xl shadow-violet-300/20 border border-white/70 overflow-hidden">

          {/* Tabs */}
          <div className="grid grid-cols-2">
            {['login', 'register'].map((t) => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={`relative py-3.5 text-sm font-semibold transition-colors ${
                  tab === t
                    ? 'text-violet-700 bg-white'
                    : 'text-gray-400 bg-gray-50/70 hover:text-gray-600'
                }`}
              >
                {t === 'login' ? 'Sign In' : 'Sign Up'}
                {tab === t && (
                  <span className="absolute bottom-0 inset-x-6 h-0.5 bg-violet-600 rounded-full" />
                )}
              </button>
            ))}
          </div>

          <div className="p-6 pt-5">

            {/* Error */}
            {error && (
              <div className="mb-4 px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2">
                <span className="shrink-0 text-red-400 mt-px">&#9888;</span>
                <span>{error}</span>
              </div>
            )}

            {/* Sign In */}
            {tab === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="login-username" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Username
                  </label>
                  <input
                    id="login-username"
                    type="text"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    onBlur={validateLogin}
                    className={`${inputBase} ${fieldErrors.username ? inputErr : inputOk}`}
                    placeholder="Enter your username"
                    autoComplete="username"
                  />
                  {fieldErrors.username && <p className="mt-1 text-xs text-red-500">{fieldErrors.username}</p>}
                </div>

                <div>
                  <label htmlFor="login-password" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showLoginPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      onBlur={validateLogin}
                      className={`${inputBase} pr-10 ${fieldErrors.password ? inputErr : inputOk}`}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                      aria-label="Toggle password visibility"
                    >
                      {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {fieldErrors.password && <p className="mt-1 text-xs text-red-500">{fieldErrors.password}</p>}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 mt-1 bg-violet-600 text-white rounded-xl font-semibold hover:bg-violet-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-sm shadow-md shadow-violet-300/30"
                >
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  Sign In
                </button>
              </form>
            )}

            {/* Sign Up */}
            {tab === 'register' && (
              <form onSubmit={handleRegister} className="space-y-3.5">
                <div>
                  <label htmlFor="reg-username" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Username
                  </label>
                  <input
                    id="reg-username"
                    type="text"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    className={`${inputBase} ${fieldErrors.username ? inputErr : inputOk}`}
                    placeholder="Letters, numbers, _ and -"
                    autoComplete="username"
                  />
                  {fieldErrors.username && <p className="mt-1 text-xs text-red-500">{fieldErrors.username}</p>}
                </div>

                <div>
                  <label htmlFor="reg-email" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Email
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    className={`${inputBase} ${fieldErrors.email ? inputErr : inputOk}`}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                  {fieldErrors.email && <p className="mt-1 text-xs text-red-500">{fieldErrors.email}</p>}
                </div>

                <div>
                  <label htmlFor="reg-password" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="reg-password"
                      type={showRegPassword ? 'text' : 'password'}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className={`${inputBase} pr-10 ${fieldErrors.password ? inputErr : inputOk}`}
                      placeholder="Minimum 6 characters"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                      aria-label="Toggle password visibility"
                    >
                      {showRegPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {fieldErrors.password && <p className="mt-1 text-xs text-red-500">{fieldErrors.password}</p>}
                </div>

                <div>
                  <label htmlFor="reg-confirm" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      id="reg-confirm"
                      type={showRegConfirm ? 'text' : 'password'}
                      value={regConfirm}
                      onChange={(e) => setRegConfirm(e.target.value)}
                      className={`${inputBase} pr-10 ${fieldErrors.confirm ? inputErr : inputOk}`}
                      placeholder="Re-enter password"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowRegConfirm(!showRegConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                      aria-label="Toggle password visibility"
                    >
                      {showRegConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {fieldErrors.confirm && <p className="mt-1 text-xs text-red-500">{fieldErrors.confirm}</p>}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 mt-1 bg-violet-600 text-white rounded-xl font-semibold hover:bg-violet-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-sm shadow-md shadow-violet-300/30"
                >
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  Create Account
                </button>
              </form>
            )}


          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-violet-900/40 mt-6">
          Seed accounts user example{' '}
          <code className="font-mono text-[11px] bg-white/40 px-1.5 py-0.5 rounded-md">CodeNewbie</code>
        </p>
        <p className="text-center text-xs text-violet-900/40 mt-6">
          Seed accounts use password{' '}
          <code className="font-mono text-[11px] bg-white/40 px-1.5 py-0.5 rounded-md">password123</code>
        </p>
      </div>
    </div>
  );
}
