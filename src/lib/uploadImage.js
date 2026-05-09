import { supabase } from './supabase';
import imageCompression from 'browser-image-compression';

export const uploadProductImage = async (file) => {
  if (!file) throw new Error('File tidak ditemukan');

  // Kompres gambar sebelum upload (maks 300KB, lebar 1200px)
  const compressed = await imageCompression(file, {
    maxSizeMB: 0.3,
    maxWidthOrHeight: 1200,
    useWebWorker: true,
  });

  const ext = file.name.split('.').pop().toLowerCase();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

  const { data, error } = await supabase.storage
    .from('product-images')
    .upload(fileName, compressed, { cacheControl: '3600', upsert: false });

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from('product-images')
    .getPublicUrl(data.path);

  return publicUrl;
};
