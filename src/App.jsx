import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import AuthRoute from './components/AuthRoute';
import { Loader2 } from 'lucide-react';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Penjualan = lazy(() => import('./pages/Penjualan'));
const ModalBahan = lazy(() => import('./pages/ModalBahan'));
const Produk = lazy(() => import('./pages/Produk'));
const Laporan = lazy(() => import('./pages/Laporan'));
const Pengaturan = lazy(() => import('./pages/Pengaturan'));
const Profil = lazy(() => import('./pages/Profil'));
const Login = lazy(() => import('./pages/Login'));
const KalkulatorHPP = lazy(() => import('./pages/KalkulatorHPP'));
const Produksi = lazy(() => import('./pages/Produksi'));
const Resep = lazy(() => import('./pages/Resep'));

const PageLoader = () => (
  <div className="min-h-[320px] flex items-center justify-center text-gray-400">
    <Loader2 size={28} className="animate-spin" />
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
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
      </Suspense>
    </BrowserRouter>
  );
}
