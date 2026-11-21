// /admin/viralframe — meja kerja Viral Frame (storyboard/prompt) DIHAPUS
// 2026-11-21: tidak dipakai (0 dari 1.369 video agent dibuat lewatnya). Route
// dipertahankan hanya sebagai pengalih supaya bookmark/riwayat lama tidak 404.
// Konten Agent, Performa Konten, penjadwal & cron tetap utuh.
import { redirect } from 'react-router';

export function loader() {
  return redirect('/admin/viralframe/agent-videos');
}

export default function ViralFrameDialihkan() {
  return null;
}
