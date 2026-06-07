import { useState, useEffect, useCallback } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router';
import {
  LayoutDashboard, List, Users, LogOut, Menu, X, Bell, Shield,
  FileText, Star, BookOpen, Briefcase, Image, Settings,
} from 'lucide-react';

interface AdminUser {
  sub: number;
  email: string;
  nama: string;
  role: string;
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [leadsBadge, setLeadsBadge] = useState(0);

  const fetchBadge = useCallback(() => {
    fetch('/api/admin/leads?count=1', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.count !== undefined) setLeadsBadge(d.count); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/admin/me', { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error('unauth');
        return res.json();
      })
      .then(data => {
        setAdmin(data.data ?? data);
        setChecking(false);
      })
      .catch(() => {
        navigate('/admin/login', { replace: true });
      });
  }, [navigate]);

  // Fetch badge saat mount + setiap 60 detik
  useEffect(() => {
    if (checking) return;
    fetchBadge();
    const id = setInterval(fetchBadge, 60_000);
    const onFocus = () => fetchBadge();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [checking, fetchBadge]);

  const logout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    navigate('/admin/login', { replace: true });
  };

  const navItems = [
    { to: '/admin', label: 'Ringkasan', icon: LayoutDashboard, end: true,  badge: 0 },
    { to: '/admin/agreements', label: 'Titip Jual', icon: FileText, end: false, badge: 0 },
    { to: '/admin/listing', label: 'Properti', icon: List, end: false, badge: 0 },
    { to: '/admin/leads', label: 'Leads', icon: Users, end: false, badge: leadsBadge },
    { to: '/admin/testimoni', label: 'Testimoni', icon: Star, end: false, badge: 0 },
    { to: '/admin/blog', label: 'Blog', icon: BookOpen, end: false, badge: 0 },
    { to: '/admin/portfolio', label: 'Portfolio', icon: Briefcase, end: false, badge: 0 },
    { to: '/admin/media', label: 'Media', icon: Image, end: false, badge: 0 },
    { to: '/admin/pengaturan', label: 'Pengaturan', icon: Settings, end: false, badge: 0 },
  ];

  const initials = admin?.nama
    ? admin.nama.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : 'A';

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F0F4F8]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#1565C0]/20 border-t-[#1565C0] rounded-full animate-spin" />
          <span className="text-sm text-[#64748B]">Memeriksa sesi…</span>
        </div>
      </div>
    );
  }

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <aside className={`flex flex-col h-full ${mobile ? '' : 'w-56'}`} style={{ background: '#0B2447' }}>
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="w-8 h-8 rounded-lg bg-[#1565C0] flex items-center justify-center flex-shrink-0">
          <Shield size={16} className="text-white" />
        </div>
        <div className="min-w-0">
          <div className="font-display font-bold text-white text-sm">SBP Admin</div>
          <div className="text-white/40 text-xs truncate">{admin?.email ?? ''}</div>
        </div>
        {mobile && (
          <button onClick={() => setSidebarOpen(false)} className="ml-auto text-white/40 hover:text-white flex-shrink-0">
            <X size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon, end, badge }) => (
          <NavLink key={to} to={to} end={end}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive ? 'bg-[#1565C0] text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
              }`
            }>
            <Icon size={17} />
            <span className="flex-1">{label}</span>
            {badge > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#EF4444] text-white text-[10px] font-bold flex items-center justify-center">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 pb-4 border-t border-white/10 pt-4">
        <button onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors w-full">
          <LogOut size={17} />
          Keluar
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#F0F4F8]">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex flex-col h-full w-56 flex-shrink-0 shadow-xl">
        <SidebarContent />
      </div>

      {/* Mobile Sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-56 h-full z-10 flex flex-col">
            <SidebarContent mobile />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Topbar */}
        <header className="flex items-center gap-4 px-4 py-3.5 shadow-sm flex-shrink-0 bg-white border-b border-gray-200">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden text-[#64748B]">
            <Menu size={22} />
          </button>

          <div className="flex-1" />

          <button className="relative text-[#64748B] hover:text-[#0F172A] transition-colors">
            <Bell size={20} />
            {leadsBadge > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#EF4444]" />
            )}
          </button>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1565C0] to-[#29B6F6] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-medium text-[#0F172A] leading-tight">{admin?.nama ?? 'Admin'}</div>
              <div className="text-xs text-[#94A3B8] capitalize leading-tight">{admin?.role ?? ''}</div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet context={admin} />
        </main>
      </div>
    </div>
  );
}
