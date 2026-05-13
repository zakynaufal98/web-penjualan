import imageCompression from 'browser-image-compression';

/**
 * Mengompres dan mengunggah gambar ke ImgBB
 * @param {File} file - File gambar asli dari input
 * @returns {Promise<string>} URL gambar dari ImgBB yang berhasil diunggah
 */
export const uploadToImgBB = async (file) => {
  if (!file) throw new Error("File tidak ditemukan");

  const imgbbApiKey = import.meta.env.VITE_IMGBB_API_KEY;
  if (!imgbbApiKey) {
    throw new Error("VITE_IMGBB_API_KEY belum dikonfigurasi");
  }

  try {
    // 1. Opsi Kompresi Gambar
    const options = {
      maxSizeMB: 0.5,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
      // Tidak memaksa konversi format — JPEG tetap JPEG, PNG tetap PNG
    };

    // 2. Kompres File
    const compressedFile = await imageCompression(file, options);

    // 3. Siapkan FormData untuk dikirim ke API ImgBB
    const formData = new FormData();
    formData.append("image", compressedFile);
    formData.append("key", imgbbApiKey);

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
