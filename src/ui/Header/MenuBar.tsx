import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

export interface MenuItem {
  label: string;
  /** 오른쪽에 보이는 단축키 안내 (캔버스 포커스일 때 동작) */
  shortcut?: string;
  disabled?: boolean;
  run(): void;
}

/** null은 구분선 */
export interface MenuDef {
  label: string;
  items: (MenuItem | null)[];
}

/**
 * 상단 메뉴바 (파일·편집·…). 메뉴를 하나 열면 다른 메뉴 이름에 마우스를 올리거나 ←→로 옮겨 갈 수 있다.
 * ↑↓로 항목 이동, Enter로 실행, Esc·바깥 클릭으로 닫는다.
 */
export function MenuBar({ menus }: { menus: MenuDef[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);
  // 키보드로 열었으면 첫 항목에 포커스
  const focusFirst = useRef(false);

  useEffect(() => {
    if (open === null) return;
    if (focusFirst.current) {
      focusFirst.current = false;
      barRef.current?.querySelector<HTMLButtonElement>('[role="menu"] button:not(:disabled)')?.focus();
    }
    const onDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const openAt = (i: number, withFocus: boolean) => {
    focusFirst.current = withFocus;
    setOpen((i + menus.length) % menus.length);
    triggers.current[(i + menus.length) % menus.length]?.focus();
  };

  const close = (focusTrigger: boolean) => {
    if (focusTrigger && open !== null) triggers.current[open]?.focus();
    setOpen(null);
  };

  const onTriggerKey = (e: KeyboardEvent, i: number) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openAt(i, true);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const d = e.key === 'ArrowRight' ? 1 : -1;
      if (open !== null) openAt(i + d, true);
      else triggers.current[(i + d + menus.length) % menus.length]?.focus();
    } else if (e.key === 'Escape' && open !== null) {
      e.preventDefault();
      close(true);
    }
  };

  const onMenuKey = (e: KeyboardEvent, i: number) => {
    const items = [...(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const k = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      items[(k + d + items.length) % items.length]?.focus();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      openAt(i + (e.key === 'ArrowRight' ? 1 : -1), true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === 'Tab') {
      setOpen(null);
    }
  };

  return (
    <div className="menubar" role="menubar" aria-label="메뉴" ref={barRef}>
      {menus.map((m, i) => (
        <div key={m.label} className="menubar-menu">
          <button
            ref={(el) => {
              triggers.current[i] = el;
            }}
            type="button"
            role="menuitem"
            className="menubar-trigger"
            aria-haspopup="menu"
            aria-expanded={open === i}
            onClick={() => (open === i ? setOpen(null) : openAt(i, false))}
            onPointerEnter={() => open !== null && open !== i && setOpen(i)}
            onKeyDown={(e) => onTriggerKey(e, i)}
          >
            {m.label}
          </button>
          {open === i && (
            <div className="menubar-dropdown" role="menu" aria-label={m.label} onKeyDown={(e) => onMenuKey(e, i)}>
              {m.items.map((item, k) =>
                item === null ? (
                  <div key={`sep${k}`} className="menubar-sep" role="separator" />
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    className="menubar-item"
                    aria-keyshortcuts={item.shortcut}
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(null);
                      item.run();
                    }}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <kbd className="menubar-kbd" aria-hidden="true">
                        {item.shortcut}
                      </kbd>
                    )}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
