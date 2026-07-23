import { useState, useEffect, useCallback, useRef } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router';
import {
  LayoutDashboard, List, Users, LogOut, Menu, X, Bell, Shield,
  FileText, Star, BookOpen, Briefcase, Image, Settings, MapPin, Video, AlertTriangle,
  ChevronLeft, ChevronRight,
} from 'lucide-react';

interface AdminUser {
  sub: number;
  email: string;
  nama: string;
  role: string;
}

interface NotifLead {
  id: number;
  nama: string | null;
  tipe_pengirim: string | null;
  properti_title: string | null;
  created_at: string;
}

const TIPE_COLORS: Record<string, string> = {
  pembeli: '#1565C0', penjual: '#10B981', broker: '#7C3AED', quick_wa: '#F97316',
};
const TIPE_LABEL: Record<string, string> = {
  pembeli: 'Pembeli', penjual: 'Penjual', broker: 'Broker', quick_wa: 'Klik Cepat WA',
};

function relTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'baru saja';
  if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  return `${Math.floor(diff / 86400)} hr lalu`;
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [leadsBadge, setLeadsBadge] = useState(0);
  const [errorsBadge, setErrorsBadge] = useState(0);
  const [showNotif, setShowNotif] = useState(false);
  const [notifLeads, setNotifLeads] = useState<NotifLead[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const fetchBadge = useCallback(() => {
    fetch('/api/admin/leads?count=1', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        // Backend membungkus payload: { success, data: { count } }
        const count = d?.data?.count ?? d?.count;
        if (count !== undefined) setLeadsBadge(count);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('sbp_admin_sidebar_collapsed');
    if (saved === '1') setCollapsed(true);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sbp_admin_sidebar_collapsed', next ? '1' : '0');
      return next;
    });
  };

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

  const fetchErrorsBadge = useCallback(() => {
    fetch('/api/admin/errors?resolved=0&limit=1', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { const total = d?.data?.total; if (total !== undefined) setErrorsBadge(total); })
      .catch(() => {});
  }, []);

  // Fetch badge saat mount + setiap 60 detik
  useEffect(() => {
    if (checking) return;
    fetchBadge();
    fetchErrorsBadge();
    const id = setInterval(() => { fetchBadge(); fetchErrorsBadge(); }, 60_000);
    const onFocus = () => { fetchBadge(); fetchErrorsBadge(); };
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [checking, fetchBadge, fetchErrorsBadge]);

  const logout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    navigate('/admin/login', { replace: true });
  };

  const toggleNotif = () => {
    if (!showNotif) {
      setShowNotif(true);
      setNotifLoading(true);
      fetch('/api/admin/leads?limit=5', { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(d => setNotifLeads(d?.data?.leads ?? d?.leads ?? []))
        .catch(() => setNotifLeads([]))
        .finally(() => setNotifLoading(false));
    } else {
      setShowNotif(false);
    }
  };

  useEffect(() => {
    if (!showNotif) return;
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotif(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showNotif]);

  const navItems = [
    { to: '/admin', label: 'Ringkasan', icon: LayoutDashboard, end: true,  badge: 0 },
    { to: '/admin/agreements', label: 'Titip Jual', icon: FileText, end: false, badge: 0 },
    { to: '/admin/listing', label: 'Properti', icon: List, end: false, badge: 0 },
    { to: '/admin/viralframe', label: 'Viral Frame', icon: Video, end: false, badge: 0 },
    { to: '/admin/leads', label: 'Leads', icon: Users, end: false, badge: leadsBadge },
    { to: '/admin/testimoni', label: 'Testimoni', icon: Star, end: false, badge: 0 },
    { to: '/admin/blog', label: 'Blog', icon: BookOpen, end: false, badge: 0 },
    { to: '/admin/portfolio', label: 'Portfolio', icon: Briefcase, end: false, badge: 0 },
    { to: '/admin/media', label: 'Media', icon: Image, end: false, badge: 0 },
    { to: '/admin/pengaturan', label: 'Pengaturan', icon: Settings, end: false, badge: 0 },
    { to: '/admin/lokasi', label: 'Lokasi', icon: MapPin, end: false, badge: 0 },
    { to: '/admin/errors', label: 'Error Logs', icon: AlertTriangle, end: false, badge: errorsBadge },
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

  const SidebarContent = ({ mobile = false, collapsed: isCollapsed = false }: { mobile?: boolean; collapsed?: boolean }) => (
    <aside className={`flex flex-col h-full ${mobile ? '' : isCollapsed ? 'w-[72px]' : 'w-56'} transition-[width] duration-200`} style={{ background: '#0B2447' }}>
      <div className={`flex items-center gap-3 px-5 py-5 border-b border-white/10 ${isCollapsed ? 'justify-center px-0' : ''}`}>
        <div className="w-8 h-8 rounded-lg bg-[#1565C0] flex items-center justify-center flex-shrink-0">
          <Shield size={16} className="text-white" />
        </div>
        {!isCollapsed && (
          <div className="min-w-0">
            <div className="font-display font-bold text-white text-sm">SBP Admin</div>
            <div className="text-white/40 text-xs truncate">{admin?.email ?? ''}</div>
          </div>
        )}
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
            title={isCollapsed ? label : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors relative ${
                isCollapsed ? 'justify-center' : ''
              } ${
                isActive ? 'bg-[#1565C0] text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
              }`
            }>
            <Icon size={17} />
            {!isCollapsed && <span className="flex-1">{label}</span>}
            {badge > 0 && (
              <span className={
                isCollapsed
                  ? 'absolute top-1 right-1 min-w-[8px] h-[8px] rounded-full bg-[#EF4444]'
                  : 'min-w-[18px] h-[18px] px-1 rounded-full bg-[#EF4444] text-white text-[10px] font-bold flex items-center justify-center'
              }>
                {!isCollapsed && (badge > 99 ? '99+' : badge)}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {!mobile && (
        <div className="px-3 pb-2">
          <button onClick={toggleCollapsed}
            title={isCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors w-full ${isCollapsed ? 'justify-center' : ''}`}>
            {isCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
            {!isCollapsed && 'Ciutkan'}
          </button>
        </div>
      )}

      <div className="px-3 pb-4 border-t border-white/10 pt-4">
        <button onClick={logout}
          title={isCollapsed ? 'Keluar' : undefined}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors w-full ${isCollapsed ? 'justify-center' : ''}`}>
          <LogOut size={17} />
          {!isCollapsed && 'Keluar'}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#F0F4F8]">
      {/* Desktop Sidebar */}
      <div className={`hidden md:flex flex-col h-full ${collapsed ? 'w-[72px]' : 'w-56'} flex-shrink-0 shadow-xl transition-[width] duration-200`}>
        <SidebarContent collapsed={collapsed} />
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

          <div ref={notifRef} className="relative">
            <button onClick={toggleNotif} className="relative text-[#64748B] hover:text-[#0F172A] transition-colors p-1">
              <Bell size={20} />
              {leadsBadge > 0 && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-[#EF4444]" />
              )}
            </button>

            {showNotif && (
              <div className="absolute right-0 top-10 w-72 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <span className="text-sm font-semibold text-[#0F172A]">Notifikasi</span>
                  <button
                    onClick={() => { navigate('/admin/leads'); setShowNotif(false); }}
                    className="text-xs text-[#1565C0] hover:underline font-medium"
                  >
                    Lihat Semua
                  </button>
                </div>

                {notifLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-5 h-5 border-2 border-[#1565C0]/20 border-t-[#1565C0] rounded-full animate-spin" />
                  </div>
                ) : notifLeads.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-[#94A3B8]">Belum ada notifikasi baru</div>
                ) : (
                  <ul>
                    {notifLeads.map(lead => (
                      <li key={lead.id} className="border-b border-gray-50 last:border-0">
                        <button
                          onClick={() => { navigate('/admin/leads'); setShowNotif(false); }}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold text-white"
                              style={{ background: TIPE_COLORS[lead.tipe_pengirim ?? ''] ?? '#64748B' }}>
                              {TIPE_LABEL[lead.tipe_pengirim ?? ''] ?? (lead.tipe_pengirim ?? '–')}
                            </span>
                            <span className="text-xs text-[#94A3B8] ml-auto">{relTime(lead.created_at)}</span>
                          </div>
                          <div className="text-sm font-medium text-[#0F172A] truncate">{lead.nama || '(tamu)'}</div>
                          {lead.properti_title && (
                            <div className="text-xs text-[#64748B] truncate mt-0.5">{lead.properti_title}</div>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

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
