import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { emitAuthChange } from '../utils/authBus';
import { startGoogleAuth } from '../utils/googleAuth';

export default function AuthPage() {
  const [mode, setMode] = useState('login'); // 'login' or 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [firstname, setFirstname] = useState('');
  const [lastname, setLastname] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  // Use the same-origin Vite/Nginx proxy unless an explicit API base is supplied.
  const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');

  const validateEmail = (e) => /\S+@\S+\.\S+/.test(e);

  const handleLocalSubmit = async (ev) => {
    ev.preventDefault();
    setError(null);
    if (!validateEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (mode === 'signup' && password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (mode === 'signup' && (!firstname.trim() || !lastname.trim())) {
      setError('Please enter both your first and last name.');
      return;
    }
    setLoading(true);
    try {
      const endpoint = `${API_BASE}/auth/local/${mode === 'signup' ? 'signup' : 'login'}`;
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, ...(mode === 'signup' ? { firstname: firstname.trim(), lastname: lastname.trim() } : {}) }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) {
        const errCode = data.error || 'unknown_error';
        if (resp.status === 429) setError('Too many attempts. Please wait and try again.');
        else if (errCode === 'email_in_use') setError('An account with that email already exists.');
        else if (errCode === 'weak_password') setError(`Password must be at least ${data.minLength || 6} characters.`);
        else if (errCode === 'invalid_credentials') setError('Invalid email or password.');
        else if (errCode === 'no_local_account') setError('No local account. Try registering or linking first.');
        else if (errCode === 'invalid_email') setError('Invalid email address.');
        else if (errCode === 'firstname_required') setError('Please enter your first name.');
        else if (errCode === 'lastname_required') setError('Please enter your last name.');
        else setError('Authentication failed. Please try again.');
        return;
      }
      // Success: server session established; navigate home
      emitAuthChange({ authenticated: true, user: data.user });
      navigate('/');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSSO = async () => {
    setError(null);
    setLoading(true);
    try {
      await startGoogleAuth('signin');
    } catch (error) {
      setError(error.message || 'Unable to start Google sign-in.');
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900">

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto">
          <div className="border-2 border-black dark:border-white bg-white dark:bg-gray-900 p-6">
            <h1 className="text-2xl font-bold mb-6">
              <span className="text-black dark:text-white">{mode === 'login' ? 'Login' : 'Register'}</span>
            </h1>

            {error && (
              <div className="mb-4 p-3 border border-red-500 text-red-600">{error}</div>
            )}

            {/* Google Sign In Button */}
            <button
              onClick={handleGoogleSSO}
              className="w-full border-2 border-black dark:border-white bg-white dark:bg-gray-900 text-black dark:text-white py-3 px-4 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center gap-3 mb-6 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19.8 10.2273C19.8 9.51819 19.7364 8.83637 19.6182 8.18182H10V12.05H15.3818C15.15 13.3 14.4455 14.3591 13.3864 15.0682V17.5773H16.7182C18.6091 15.8364 19.8 13.2727 19.8 10.2273Z" fill="#4285F4"/>
                <path d="M10 20C12.7 20 14.9636 19.1045 16.7182 17.5773L13.3864 15.0682C12.4909 15.6682 11.3455 16.0227 10 16.0227C7.39545 16.0227 5.19091 14.2636 4.40455 11.9H0.963636V14.4909C2.70909 17.9591 6.09091 20 10 20Z" fill="#34A853"/>
                <path d="M4.40455 11.9C4.20455 11.3 4.09091 10.6591 4.09091 10C4.09091 9.34091 4.20455 8.7 4.40455 8.1V5.50909H0.963636C0.35 6.72727 0 8.11818 0 10C0 11.8818 0.35 13.2727 0.963636 14.4909L4.40455 11.9Z" fill="#FBBC04"/>
                <path d="M10 3.97727C11.4682 3.97727 12.7864 4.48182 13.8227 5.47273L16.7636 2.53182C14.9591 0.818182 12.6955 0 10 0C6.09091 0 2.70909 2.04091 0.963636 5.50909L4.40455 8.1C5.19091 5.73636 7.39545 3.97727 10 3.97727Z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t-2 border-black dark:border-white"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-gray-900 text-black dark:text-white">Or</span>
              </div>
            </div>

            <form onSubmit={handleLocalSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="auth-firstname" className="block mb-2 text-black dark:text-white">First name</label>
                    <input id="auth-firstname" type="text" value={firstname} onChange={e => setFirstname(e.target.value)} maxLength={100} className="w-full border-2 border-black dark:border-white bg-white dark:bg-gray-800 text-black dark:text-white px-3 py-2" placeholder="First name" required />
                  </div>
                  <div>
                    <label htmlFor="auth-lastname" className="block mb-2 text-black dark:text-white">Last name</label>
                    <input id="auth-lastname" type="text" value={lastname} onChange={e => setLastname(e.target.value)} maxLength={100} className="w-full border-2 border-black dark:border-white bg-white dark:bg-gray-800 text-black dark:text-white px-3 py-2" placeholder="Last name" required />
                  </div>
                </div>
              )}
              <div>
                <label htmlFor="auth-email" className="block mb-2 text-black dark:text-white">Email</label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border-2 border-black dark:border-white bg-white dark:bg-gray-800 text-black dark:text-white px-3 py-2"
                  placeholder="Enter your email"
                  required
                />
              </div>

              <div>
                <label htmlFor="auth-password" className="block mb-2 text-black dark:text-white">Password</label>
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border-2 border-black dark:border-white bg-white dark:bg-gray-800 text-black dark:text-white px-3 py-2"
                  placeholder="Enter your password"
                  required
                />
              </div>

              {mode === 'signup' && (
                <div>
                  <label htmlFor="auth-confirm" className="block mb-2 text-black dark:text-white">Confirm Password</label>
                  <input
                    id="auth-confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full border-2 border-black dark:border-white bg-white dark:bg-gray-800 text-black dark:text-white px-3 py-2"
                    placeholder="Confirm your password"
                    required
                  />
                </div>
              )}

              <button
                type="submit"
                className="w-full border-2 border-black dark:border-white bg-white dark:bg-gray-900 text-black dark:text-white py-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                disabled={loading}
              >
                {loading ? 'Please wait...' : mode === 'login' ? 'Login' : 'Register'}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                className="text-sm hover:underline text-black dark:text-white"
              >
                {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Login'}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
