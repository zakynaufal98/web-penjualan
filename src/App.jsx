import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Penjualan from './pages/Penjualan';
import ModalBahan from './pages/ModalBahan';
import Produk from './pages/Produk';
import Laporan from './pages/Laporan';
import Pengaturan from './pages/Pengaturan';
import Profil from './pages/Profil';
import Login from './pages/Login';
import KalkulatorHPP from './pages/KalkulatorHPP';
import Produksi from './pages/Produksi';
import Resep from './pages/Resep';
import AuthRoute from './components/AuthRoute';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route path="/" element={<AuthRoute><Layout /></AuthRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="penjualan" element={<Penjualan />} />
          <Route path="modal" element={<ModalBahan />} />
          <Route path="produk" element={<Produk />} />
          <Route path="hpp" element={<KalkulatorHPP />} />
          <Route path="produksi" element={<Produksi />} />
          <Route path="resep" element={<Resep />} />
          <Route path="laporan" element={<Laporan />} />
          <Route path="pengaturan" element={<Pengaturan />} />
          <Route path="profil" element={<Profil />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
