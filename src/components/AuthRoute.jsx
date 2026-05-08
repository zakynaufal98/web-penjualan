import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2 } from 'lucide-react';
import { useStore } from '../store/useStore';

export default function AuthRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const { user, setUser } = useStore();
  const location = useLocation();

  useEffect(() => {
    // Cek session saat ini
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      setLoading(false);
    };

    checkSession();

    // Listen untuk perubahan auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, [setUser]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Loader2 className="animate-spin text-primary-500" size={32} />
      </div>
    );
  }

  if (!user) {
    // Redirect ke login jika belum ada user
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
