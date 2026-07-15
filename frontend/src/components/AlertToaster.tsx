import { useEffect } from 'react';
import type { AlertToast } from '../hooks/useChannelAlerts';
import './AlertToaster.css';

const AUTO_DISMISS_MS = 8_000;

export interface AlertToasterProps {
  toasts: AlertToast[];
  onDismiss: (id: number) => void;
}

interface ToastItemProps {
  toast: AlertToast;
  onDismiss: (id: number) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps): JSX.Element {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div className="alert-toast" role="status">
      <div className="alert-toast-body">
        <div className="alert-toast-title">{toast.title}</div>
        <div className="alert-toast-detail mono">{toast.body}</div>
      </div>
      <button
        type="button"
        className="icon-btn alert-toast-close"
        aria-label="Dismiss alert"
        onClick={() => onDismiss(toast.id)}
      >
        ×
      </button>
    </div>
  );
}

/** Fixed-position stack of dismissible, auto-expiring alert toasts. */
export function AlertToaster({ toasts, onDismiss }: AlertToasterProps): JSX.Element | null {
  if (toasts.length === 0) return null;
  return (
    <div className="alert-toaster" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
