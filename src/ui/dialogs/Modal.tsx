import { useEffect, useId, useRef, type ReactNode } from 'react';

interface Props {
  title: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

/** 공용 대화상자: Esc로 닫고, 열릴 때 첫 입력에 포커스 */
export function Modal({ title, onClose, children, footer, wide }: Props) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.modal-close)');
    (first ?? ref.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, []);

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className={`modal${wide ? ' wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button modal-close" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}
