import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Override semua pesan validasi browser ke Bahasa Indonesia
document.addEventListener('invalid', (e) => {
  const el = e.target;
  if (el.validity.valueMissing) {
    if (el.tagName === 'SELECT') el.setCustomValidity('Silakan pilih salah satu opsi');
    else if (el.type === 'date') el.setCustomValidity('Silakan pilih tanggal');
    else if (el.type === 'email') el.setCustomValidity('Masukkan alamat email yang valid');
    else if (el.type === 'password') el.setCustomValidity('Masukkan kata sandi');
    else if (el.type === 'number') el.setCustomValidity('Masukkan angka yang valid');
    else el.setCustomValidity('Field ini wajib diisi');
  } else if (el.validity.typeMismatch) {
    if (el.type === 'email') el.setCustomValidity('Format email tidak valid');
    else el.setCustomValidity('Format tidak valid');
  } else if (el.validity.rangeUnderflow) {
    el.setCustomValidity(`Nilai minimal adalah ${el.min}`);
  } else if (el.validity.rangeOverflow) {
    el.setCustomValidity(`Nilai maksimal adalah ${el.max}`);
  } else if (el.validity.stepMismatch) {
    el.setCustomValidity('Nilai tidak sesuai langkah yang diizinkan');
  } else {
    el.setCustomValidity('Nilai tidak valid');
  }
}, true);

document.addEventListener('input', (e) => {
  e.target.setCustomValidity('');
}, true);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
