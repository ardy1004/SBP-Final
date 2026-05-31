import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router';
import {
  LayoutDashboard, List, Users, LogOut, Menu, X, Moon, Sun, Bell, ChevronDown, Shield
} from 'lucide-react';

export default function AdminLayout() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    if (!sessionStorage.getItem('sbp_admin')) {
      navigate('/admin/login');
    }
  }, [navigate]);

  const logout = () => {
    sessionStorage.removeItem('sbp_admin');
    navigate('/admin/login');
  };

  const navItems = [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/admin/listing', label: 'Listing', icon: List, end: false },
    { to: '/admin/leads', label: 'Leads', icon: Users, end: false },
  ];

  const Sidebar = ({ mobile = false }) => (
    <aside className={`flex flex-col h-full ${mobile ? '' : 'w-56'}`} style={{ background: '#0B2447' }}>
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="w-8 h-8 rounded-lg bg-[#1565C0] flex items-center justify-center">
          <Shield size={16} className="text-white" />
        </div>
        <div>
          <div className="font-display font-bold text-white text-sm">SBP Admin</div>
          <div className="text-white/40 text-xs">Dashboard</div>
        </div>
        {mobile && (
          <button onClick={() => setSidebarOpen(false)} className="ml-auto text-white/40 hover:text-white">
            <X size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive ? 'bg-[#1565C0] text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
              }`
            }>
            <Icon size={17} />
            {label}
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
    <div className={`flex h-screen overflow-hidden ${dark ? 'bg-[#0F172A]' : 'bg-[#F0F4F8]'}`}>
      {/* Desktop Sidebar */}
      <div className="hidden md:flex flex-col h-full w-56 flex-shrink-0 shadow-xl">
        <Sidebar />
      </div>

      {/* Mobile Sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-56 h-full z-10 flex flex-col">
            <Sidebar mobile />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Topbar */}
        <header className={`flex items-center gap-4 px-4 py-3.5 shadow-sm flex-shrink-0 ${dark ? 'bg-[#1E293B] border-b border-white/5' : 'bg-white border-b border-gray-200'}`}>
          <button onClick={() => setSidebarOpen(true)} className="md:hidden text-[#64748B]">
            <Menu size={22} />
          </button>

          <div className="flex-1" />

          <button className="relative text-[#64748B] hover:text-[#0F172A] transition-colors">
            <Bell size={20} />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#EF4444]" />
          </button>

          <button onClick={() => setDark(!dark)} className="text-[#64748B] hover:text-[#0F172A] transition-colors">
            {dark ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          <div className="flex items-center gap-2 cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1565C0] to-[#29B6F6] flex items-center justify-center text-white text-xs font-bold">A</div>
            <span className={`text-sm font-medium hidden sm:block ${dark ? 'text-white' : 'text-[#0F172A]'}`}>Admin SBP</span>
            <ChevronDown size={14} className="text-[#94A3B8] hidden sm:block" />
          </div>
        </header>

        {/* Page content */}
        <main className={`flex-1 overflow-y-auto p-4 md:p-6 ${dark ? 'text-white' : ''}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
