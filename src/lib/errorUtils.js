export const friendlyError = (error) => {
  if (!error) return 'Terjadi kesalahan.';
  const msg = (error.message || '').toLowerCase();
  if (msg.includes('stock_check') || msg.includes('check constraint'))
    return 'Stok produk tidak mencukupi untuk jumlah ini.';
  if (msg.includes('created_by_fkey') || msg.includes('foreign key'))
    return 'Sesi tidak valid. Silakan logout lalu login kembali.';
  if (msg.includes('unique') || msg.includes('duplicate'))
    return 'Data ini sudah ada, tidak bisa duplikat.';
  if (msg.includes('not-null') || msg.includes('null value') || msg.includes('violates not-null'))
    return 'Ada data wajib yang belum diisi.';
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch'))
    return 'Koneksi bermasalah. Periksa koneksi internet Anda.';
  if (msg.includes('jwt') || msg.includes('unauthorized') || msg.includes('auth'))
    return 'Sesi habis. Silakan login kembali.';
  if (msg.includes('permission') || msg.includes('policy') || msg.includes('rls'))
    return 'Tidak punya akses untuk tindakan ini.';
  return 'Terjadi kesalahan. Silakan coba lagi.';
};
