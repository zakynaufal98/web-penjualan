import { useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

const VARIANTS = {
  success: {
    container: 'bg-emerald-500 dark:bg-emerald-600',
    icon: <CheckCircle size={18} />,
  },
  error: {
    container: 'bg-red-500 dark:bg-red-600',
    icon: <AlertCircle size={18} />,
  },
  info: {
    container: 'bg-blue-500 dark:bg-blue-600',
    icon: <Info size={18} />,
  },
};

export default function Toast({ message, type = 'success', onClose, duration = 3500 }) {
  useEffect(() => {
    if (!message || !onClose) return;
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [message, duration, onClose]);

  if (!message) return null;

  const { container, icon } = VARIANTS[type] || VARIANTS.success;

  return (
    <div
      className={`fixed bottom-24 md:bottom-8 right-4 md:right-8 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl text-white text-sm font-medium max-w-xs ${container}`}
      style={{ animation: 'slideUp 0.25s ease-out' }}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="shrink-0 opacity-70 hover:opacity-100 transition-opacity ml-1">
        <X size={14} />
      </button>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
