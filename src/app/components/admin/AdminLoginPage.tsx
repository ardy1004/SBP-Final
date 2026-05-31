import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Eye, EyeOff, Lock, Mail, Shield } from 'lucide-react';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    if (email === 'admin@salambumi.id' && password === 'sbpadmin2024') {
      sessionStorage.setItem('sbp_admin', '1');
      navigate('/admin');
    } else {
      setError('Email atau password salah.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'linear-gradient(160deg, #0B2447 0%, #1565C0 100%)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 backdrop-blur mb-4">
            <Shield size={28} className="text-white" />
          </div>
          <h1 className="font-display text-2xl font-bold text-white">SBP Admin</h1>
          <p className="text-white/60 text-sm mt-1">Dashboard Salam Bumi Property</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white rounded-2xl p-7 shadow-2xl">
          <h2 className="font-display font-bold text-[#0F172A] mb-6">Masuk ke Dashboard</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#374151] mb-1.5">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@salambumi.id"
                  required
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#374151] mb-1.5">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-9 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] transition-colors"
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B]">
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-[#FEF2F2] border border-[#EF4444]/20 rounded-lg px-4 py-2.5 text-sm text-[#EF4444]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
              {loading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Memverifikasi...</> : 'Masuk'}
            </button>
          </div>

          <p className="text-center text-xs text-[#94A3B8] mt-5">
            Demo: admin@salambumi.id / sbpadmin2024
          </p>
        </form>
      </div>
    </div>
  );
}
