import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
  className?: string;
}

export function Modal({ open, onClose, children, labelledBy, className }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="ml-modal__scrim" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`ml-modal${className ? ` ${className}` : ''}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          className="of-btn of-btn--ghost of-btn--sm"
          aria-label="Close"
          onClick={onClose}
          style={{ position: 'absolute', right: 16, top: 16 }}
        >
          <X size={16} strokeWidth={1.75} />
        </button>
        {children}
      </div>
    </div>
  );
}
