import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Lock, Mail, Loader2, AlertCircle, ArrowRight, Cookie, CheckCircle2 } from 'lucide-react';
import loginIllustration from '../assets/login-illustration.svg';

const features = [
  'Catat penjualan & produksi harian dengan mudah',
  'Pantau stok bahan baku secara real-time',
  'Hitung HPP & margin keuntungan otomatis',
  'Laporan keuangan lengkap & akurat',
];

export default function Login() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError('Email atau password salah. Hubungi admin jika belum punya akun.');
    } else {
      navigate('/');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex bg-white dark:bg-gray-950">

      {/* ══════════════════════════════════
          LEFT — Brand / decorative panel
          ══════════════════════════════════ */}
      <div
        className="hidden lg:flex lg:w-[46%] flex-col relative overflow-hidden"
        style={{ background: '#0D0920' }}
      >
        {/* Decorative blur blobs */}
        <div
          aria-hidden
          className="absolute -top-40 -left-40 w-96 h-96 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(192,38,211,0.22) 0%, transparent 70%)' }}
        />
        <div
          aria-hidden
          className="absolute bottom-0 right-0 w-[28rem] h-[28rem] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.18) 0%, transparent 70%)', transform: 'translate(30%, 30%)' }}
        />
        <div
          aria-hidden
          className="absolute top-1/2 left-1/2 w-64 h-64 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(192,38,211,0.12) 0%, transparent 70%)', transform: 'translate(-50%,-50%)' }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full p-12 xl:p-14">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center shadow-lg shadow-fuchsia-600/40">
              <Cookie size={20} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="font-extrabold text-[22px] text-white tracking-tight leading-none">Kukis</span>
          </div>

          {/* Hero copy */}
          <div className="mt-10 mb-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-fuchsia-300 mb-5">
              Manajemen Bisnis Kue
            </p>
            <h1 className="text-4xl xl:text-[42px] font-extrabold text-white leading-[1.15] mb-5">
              Kelola bisnis kue<br />
              <span
                className="text-transparent bg-clip-text"
                style={{ backgroundImage: 'linear-gradient(90deg, #e879f9 0%, #a78bfa 100%)' }}
              >
                lebih cerdas.
              </span>
            </h1>
            <p className="text-white/75 text-base leading-relaxed mb-8 max-w-sm">
              Semua yang Anda butuhkan — dari catatan produksi hingga laporan keuangan — dalam satu dasbor.
            </p>

            <ul className="space-y-3">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-3">
                  <CheckCircle2 size={17} className="text-fuchsia-400 mt-0.5 shrink-0" />
                  <span className="text-[13.5px] text-white/80 leading-snug">{f}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Generative Illustration */}
          <div className="flex justify-center items-center my-auto">
            <div
              className="relative w-full max-w-[340px] rounded-2xl overflow-hidden"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 0 60px rgba(232,121,249,0.12), 0 0 120px rgba(167,139,250,0.08)',
              }}
            >
              <img
                src={loginIllustration}
                alt="Ilustrasi manajemen bisnis kue"
                className="w-full h-auto block"
                style={{ maxHeight: '280px', objectFit: 'contain' }}
                draggable={false}
              />
              {/* Subtle bottom fade */}
              <div
                className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none"
                style={{ background: 'linear-gradient(to top, #0D0920, transparent)' }}
              />
            </div>
          </div>

          {/* Footer */}
          <p className="text-white/40 text-xs mt-6">
            © {new Date().getFullYear()} Kukis — Dibuat untuk UMKM Indonesia.
          </p>
        </div>
      </div>

      {/* ══════════════════════════════
          RIGHT — Login form
          ══════════════════════════════ */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-6 sm:p-10">
        <div className="w-full max-w-[360px]">

          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-10 lg:hidden">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center shadow-sm shadow-fuchsia-500/30">
              <Cookie size={17} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="font-extrabold text-xl text-gray-900 dark:text-white">Kukis</span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-[26px] font-extrabold text-gray-900 dark:text-white leading-tight">
              Selamat datang
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mt-1.5 text-sm">
              Masuk untuk melanjutkan ke dashboard Anda
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 p-3.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm flex items-start gap-2.5 border border-red-100 dark:border-red-900/30">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[13px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@email.com"
                  className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 outline-none transition-all placeholder:text-gray-300 dark:placeholder:text-gray-600 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 outline-none transition-all placeholder:text-gray-300 dark:placeholder:text-gray-600 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 bg-fuchsia-600 hover:bg-fuchsia-700 active:bg-fuchsia-800 text-white py-3 rounded-xl text-sm font-bold transition-colors shadow-sm shadow-fuchsia-600/30 disabled:opacity-60 disabled:cursor-not-allowed mt-1"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <>
                  Masuk ke Dashboard
                  <ArrowRight size={16} strokeWidth={2.5} />
                </>
              )}
            </button>
          </form>

          <p className="mt-7 text-center text-xs text-gray-500 dark:text-gray-400">
            Belum punya akun?{' '}
            <span className="text-gray-700 dark:text-gray-200 font-medium">Hubungi admin</span>
            {' '}untuk pendaftaran.
          </p>
        </div>
      </div>
    </div>
  );
}
