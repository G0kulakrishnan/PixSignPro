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

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 right-4 z-50 space-y-2 w-80">
        {list.map(t => (
          <div
            key={t.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white text-sm
              ${t.kind === 'success' ? 'bg-green-600' : 'bg-red-600'}`}
          >
            {t.kind === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => setList(p => p.filter(x => x.id !== t.id))}>
              <X size={14} />
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
