import imageCompression from 'browser-image-compression';
import { supabase } from './supabase';

/**
 * Mengompres dan mengunggah gambar ke Supabase Storage
 * @param {File} file - File gambar asli dari input
 * @param {string} bucketName - Nama bucket di Supabase (misal: 'struk_belanja')
 * @returns {Promise<string>} URL gambar yang berhasil diunggah
 */
export const uploadAndCompressImage = async (file, bucketName = 'struk_belanja') => {
  if (!file) throw new Error("File tidak ditemukan");

  try {
    // 1. Opsi Kompresi Gambar
    const options = {
      maxSizeMB: 0.2, // Maksimal ukuran file 200KB (Mencegah storage cepat penuh)
      maxWidthOrHeight: 1024, // Resolusi maksimal 1024px
      useWebWorker: true,
      fileType: 'image/webp' // Mengonversi file ke webp agar ukurannya jauh lebih kecil
    };

    // 2. Proses Kompresi
    // Gambar asli akan diperkecil sesuai opsi di atas
    const compressedFile = await imageCompression(file, options);
    
    // Buat nama file unik agar tidak saling menimpa
    const fileExt = 'webp';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${fileName}`;

    // 3. Upload gambar yang sudah dikompres ke Supabase
    const { error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, compressedFile, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      throw error;
    }

    // 4. Dapatkan URL publik gambar untuk disimpan ke database
    const { data: publicUrlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;

  } catch (error) {
    console.error("Gagal mengunggah gambar:", error);
    throw error;
  }
};
