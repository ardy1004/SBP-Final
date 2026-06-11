import { Clapperboard, ArrowLeft } from 'lucide-react';
import { useParams, useNavigate } from 'react-router';

export default function AdminViralFrameWorkspacePage() {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-64 text-center py-16">
      <div className="w-16 h-16 rounded-2xl bg-[#E3F2FD] flex items-center justify-center mb-4">
        <Clapperboard size={28} className="text-[#1565C0]" />
      </div>
      <h2 className="font-display text-xl font-bold text-[#0F172A] mb-2">
        Workspace ViralFrame — Coming Soon
      </h2>
      <p className="text-[#64748B] text-sm max-w-sm">
        Workspace generate prompt video untuk properti #{id} sedang dibangun dan akan
        tersedia pada Fase V2.
      </p>
      <button
        onClick={() => navigate('/admin/viralframe')}
        className="mt-5 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-[#1565C0] border border-[#1565C0]/30 hover:bg-[#F0F7FF] transition-colors"
      >
        <ArrowLeft size={15} /> Kembali ke daftar properti
      </button>
    </div>
  );
}
