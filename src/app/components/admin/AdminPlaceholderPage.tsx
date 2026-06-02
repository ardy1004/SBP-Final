import { Clock } from 'lucide-react';
import { useLocation } from 'react-router';

export default function AdminPlaceholderPage() {
  const { pathname } = useLocation();
  const modul = pathname.split('/').pop() ?? 'modul';
  const label = modul.charAt(0).toUpperCase() + modul.slice(1);

  return (
    <div className="flex flex-col items-center justify-center min-h-64 text-center py-16">
      <div className="w-16 h-16 rounded-2xl bg-[#E3F2FD] flex items-center justify-center mb-4">
        <Clock size={28} className="text-[#1565C0]" />
      </div>
      <h2 className="font-display text-xl font-bold text-[#0F172A] mb-2">
        {label} — Segera Hadir
      </h2>
      <p className="text-[#64748B] text-sm max-w-xs">
        Modul ini sedang dalam pengembangan dan akan tersedia pada fase berikutnya.
      </p>
    </div>
  );
}
