export default function PrivacyPage() {
  return (
    <div className="pt-16">
      <section className="py-16" style={{ background: 'linear-gradient(160deg, #0B2447 0%, #1565C0 100%)' }}>
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="font-display text-4xl font-bold text-white mb-3">Kebijakan Privasi</h1>
          <p className="text-white/70">Berlaku sejak 1 Januari 2024 · Versi 1.0</p>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="prose max-w-none text-[#64748B] space-y-8">
            {[
              {
                title: '1. Data yang Kami Kumpulkan',
                content: 'Kami mengumpulkan data pribadi yang Anda berikan secara sukarela, termasuk: nama lengkap, nomor KTP (NIK) untuk keperluan perjanjian pemasaran, nomor WhatsApp/telepon, alamat email, alamat properti, dan data properti yang ingin dipasarkan. Data dikumpulkan melalui form pendaftaran, form titip jual, dan form kontak.',
              },
              {
                title: '2. Tujuan Penggunaan Data',
                content: 'Data Anda digunakan untuk: memproses permintaan layanan pemasaran properti, komunikasi terkait properti yang diminati atau dipasarkan, penyusunan perjanjian pemasaran (bagi pemilik properti), keperluan analitik internal untuk meningkatkan layanan, dan kepatuhan terhadap kewajiban hukum.',
              },
              {
                title: '3. Dasar Hukum Pemrosesan Data',
                content: 'Pemrosesan data pribadi Anda didasarkan pada: persetujuan eksplisit yang Anda berikan (consent), pelaksanaan perjanjian antara Anda dan CV Salam Bumi Property, kewajiban hukum yang berlaku, dan kepentingan sah perusahaan. Sesuai dengan Undang-Undang Pelindungan Data Pribadi (UU PDP) Republik Indonesia.',
              },
              {
                title: '4. Penyimpanan & Keamanan Data',
                content: 'Data sensitif seperti NIK/KTP dienkripsi menggunakan standar AES. Akses data terbatas hanya pada personel yang berwenang dengan log akses tercatat. Kami menerapkan langkah-langkah keamanan teknis dan organisasi yang sesuai untuk melindungi data Anda dari akses tidak sah, kehilangan, atau pengungkapan.',
              },
              {
                title: '5. Retensi Data',
                content: 'Data lead/inquiry: disimpan 24 bulan, kemudian dianonimkan atau dihapus. Data kontrak/perjanjian: disimpan selama kewajiban hukum berlaku (minimal 5 tahun). Data KTP/identitas: disimpan selama diperlukan untuk keperluan hukum dan kepatuhan. Setelah periode retensi berakhir, data dihapus secara permanen.',
              },
              {
                title: '6. Hak Subjek Data (Sesuai UU PDP)',
                content: 'Anda memiliki hak untuk: mengakses data pribadi Anda yang kami simpan, meminta koreksi data yang tidak akurat, meminta penghapusan data (right to erasure), menolak atau membatasi pemrosesan data tertentu, dan mendapatkan portabilitas data. Untuk menggunakan hak-hak ini, hubungi kami melalui kontak di bawah.',
              },
              {
                title: '7. Kebijakan Cookie',
                content: 'Website kami menggunakan cookie untuk analitik (Google Analytics 4) dan meningkatkan pengalaman pengguna. Anda dapat mengontrol preferensi cookie melalui banner consent yang muncul saat pertama kali mengunjungi website. GA4 hanya diaktifkan setelah Anda memberikan persetujuan.',
              },
              {
                title: '8. Berbagi Data dengan Pihak Ketiga',
                content: 'Kami tidak menjual data pribadi Anda. Data dapat dibagikan kepada notaris/PPAT rekanan (hanya data yang diperlukan untuk proses hukum) dan penyedia layanan teknis yang terikat perjanjian kerahasiaan. Tidak ada pembagian data untuk keperluan pemasaran pihak ketiga.',
              },
              {
                title: '9. Kontak Data Protection',
                content: 'Untuk pertanyaan seputar privasi, permintaan penghapusan data, atau melaporkan insiden privasi:\n\nEmail: salambumiproperty@gmail.com\nWhatsApp: 0813-9127-8889\nAlamat: Jl. Pajajaran, Catur Tunggal, Depok, Sleman, DI Yogyakarta',
              },
            ].map(({ title, content }) => (
              <div key={title}>
                <h2 className="font-display font-bold text-[#0F172A] text-lg mb-3">{title}</h2>
                <p className="text-sm leading-relaxed whitespace-pre-line">{content}</p>
              </div>
            ))}

            <div className="bg-[#F0F4F8] rounded-xl p-5 text-xs text-[#64748B]">
              <strong className="text-[#0F172A]">Pembaruan Kebijakan:</strong> Kami dapat memperbarui kebijakan ini sewaktu-waktu.
              Perubahan signifikan akan diberitahukan melalui email atau notifikasi di website. Penggunaan layanan kami setelah
              pembaruan berarti Anda menyetujui kebijakan yang diperbarui.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
