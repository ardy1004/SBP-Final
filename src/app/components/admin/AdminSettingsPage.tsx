import { useState } from 'react';
import { useOutletContext } from 'react-router';
import { Lock, User, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react';

interface AdminUser { sub: number; email: string; nama: string; role: string; }

interface FormState {
  password_lama: string;
  password_baru: string;
  password_baru_konfirmasi: string;
}

export default function AdminSettingsPage() {
  const admin = useOutletContext<AdminUser | null>();

  const [form, setForm] = useState<FormState>({
    password_lama: '', password_baru: '', password_baru_konfirmasi: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [show, setShow] = useState({ lama: false, baru: false, konfirmasi: false });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setMessage(null);
  };

  const toggleShow = (field: keyof typeof show) => setShow(s => ({ ...s, [field]: !s[field] }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password_baru !== form.password_baru_konfirmasi) {
      setMessage({ type: 'error', text: 'Password baru dan konfirmasi tidak cocok' });
      return;
    }
    if (form.password_baru.length < 8) {
      setMessage({ type: 'error', text: 'Password baru minimal 8 karakter' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/password', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.data?.message ?? 'Password berhasil diubah' });
        setForm({ password_lama: '', password_baru: '', password_baru_konfirmasi: '' });
      } else {
        setMessage({ type: 'error', text: data.error ?? 'Gagal mengubah password' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Koneksi ke server gagal' });
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-[#1565C0]/20 focus:border-[#1565C0] pr-10';

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="font-display text-xl font-bold text-[#0F172A]">Pengaturan</h1>
        <p className="text-[#64748B] text-sm mt-0.5">Kelola akun dan keamanan admin</p>
      </div>

      {/* Info Akun */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#E3F2FD]">
            <User size={17} color="#1565C0" />
          </div>
          <h2 className="font-display font-semibold text-[#0F172A]">Info Akun</h2>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[#64748B]">Nama</span>
            <span className="font-medium text-[#0F172A]">{admin?.nama ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#64748B]">Email</span>
            <span className="font-medium text-[#0F172A]">{admin?.email ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#64748B]">Role</span>
            <span className="font-medium text-[#0F172A] capitalize">{admin?.role ?? '—'}</span>
          </div>
        </div>
      </div>

      {/* Ganti Password */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#F5F3FF]">
            <Lock size={17} color="#7C3AED" />
          </div>
          <h2 className="font-display font-semibold text-[#0F172A]">Ganti Password</h2>
        </div>

        {message && (
          <div className={`flex items-start gap-2 rounded-xl p-3 mb-4 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {message.type === 'success'
              ? <CheckCircle size={15} className="mt-0.5 flex-shrink-0" />
              : <XCircle size={15} className="mt-0.5 flex-shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {(
            [
              { field: 'lama',       name: 'password_lama',            label: 'Password Lama',            placeholder: 'Masukkan password lama' },
              { field: 'baru',       name: 'password_baru',            label: 'Password Baru',            placeholder: 'Minimal 8 karakter' },
              { field: 'konfirmasi', name: 'password_baru_konfirmasi', label: 'Konfirmasi Password Baru', placeholder: 'Ulangi password baru' },
            ] as { field: keyof typeof show; name: keyof FormState; label: string; placeholder: string }[]
          ).map(({ field, name, label, placeholder }) => (
            <div key={name}>
              <label className="block text-xs font-medium text-[#374151] mb-1">{label}</label>
              <div className="relative">
                <input
                  type={show[field] ? 'text' : 'password'}
                  name={name}
                  value={form[name]}
                  onChange={handleChange}
                  required
                  minLength={name !== 'password_lama' ? 8 : undefined}
                  className={inputClass}
                  placeholder={placeholder}
                />
                <button
                  type="button"
                  onClick={() => toggleShow(field)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B]"
                >
                  {show[field] ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          ))}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1565C0] hover:bg-[#1565C0]/90 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
          >
            {loading ? 'Menyimpan...' : 'Simpan Password Baru'}
          </button>
        </form>
      </div>
    </div>
  );
}
