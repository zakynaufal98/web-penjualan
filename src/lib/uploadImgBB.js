import imageCompression from 'browser-image-compression';

/**
 * Mengompres dan mengunggah gambar ke ImgBB
 * @param {File} file - File gambar asli dari input
 * @returns {Promise<string>} URL gambar dari ImgBB yang berhasil diunggah
 */
export const uploadToImgBB = async (file) => {
  if (!file) throw new Error("File tidak ditemukan");

  // GANTI DENGAN API KEY IMGBB ANDA
  // Dapatkan gratis di: https://api.imgbb.com/
  const IMGBB_API_KEY = "26a7f624e16111128fa94b310b9a9c79";

  try {
    // 1. Opsi Kompresi Gambar (Sama seperti sebelumnya agar upload lebih cepat)
    const options = {
      maxSizeMB: 0.2, // Maksimal 200KB
      maxWidthOrHeight: 1024,
      useWebWorker: true,
      fileType: 'image/webp'
    };

    // 2. Kompres File
    const compressedFile = await imageCompression(file, options);

    // 3. Siapkan FormData untuk dikirim ke API ImgBB
    const formData = new FormData();
    formData.append("image", compressedFile);
    formData.append("key", IMGBB_API_KEY);

    // 4. Proses Upload ke ImgBB
    const response = await fetch("https://api.imgbb.com/1/upload", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (data.success) {
      // Mengembalikan URL langsung ke gambar
      return data.data.url;
    } else {
      throw new Error(data.error.message || "Gagal upload ke ImgBB");
    }

  } catch (error) {
    console.error("Error uploading to ImgBB:", error);
    throw error;
  }
};
