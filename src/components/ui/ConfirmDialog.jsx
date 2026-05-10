import { AlertTriangle, X } from 'lucide-react';

export default function ConfirmDialog({ isOpen, title, message, confirmText = 'Hapus', cancelText = 'Batal', variant = 'danger', onConfirm, onCancel }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 w-full max-w-sm animate-fade-up">
        <div className="flex items-start justify-between p-5 pb-3">
          <div className={`p-2 rounded-xl ${variant === 'danger' ? 'bg-red-50 dark:bg-red-900/20' : 'bg-amber-50 dark:bg-amber-900/20'}`}>
            <AlertTriangle size={20} className={variant === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'} />
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 pb-5">
          <h3 className="font-bold text-gray-900 dark:text-white text-base mb-1">{title}</h3>
          {message && <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>}
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-xl transition-colors ${
              variant === 'danger'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-amber-500 hover:bg-amber-600'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}