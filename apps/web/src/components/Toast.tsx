import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

type Kind = 'success' | 'error';
interface Toast { id: number; kind: Kind; message: string }

interface ToastCtx { toast: (kind: Kind, message: string) => void }
const Ctx = createContext<ToastCtx | null>(null);
let _id = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);

  const toast = useCallback((kind: Kind, message: string) => {
    const id = ++_id;
    setList(p => [...p, { id, kind, message }]);
    setTimeout(() => setList(p => p.filter(t => t.id !== id)), 4000);
  }, []);

  const dismiss = (id: number) => setList(p => p.filter(t => t.id !== id));

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed top-16 inset-x-4 z-50 space-y-2 pointer-events-none">
        {list.map(t => (
          <div
            key={t.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-white text-sm pointer-events-auto
              ${t.kind === 'success' ? 'bg-green-600' : 'bg-red-600'}`}
          >
            {t.kind === 'success'
              ? <CheckCircle2 size={18} className="shrink-0" />
              : <XCircle size={18} className="shrink-0" />}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="shrink-0 opacity-75 hover:opacity-100">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.toast;
}
