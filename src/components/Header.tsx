import { GitBranchPlus, RefreshCw, X, Sun, Moon, Upload, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

interface HeaderProps {
  onConnect: () => void;
  onToggleDemo: () => void;
  viewingDemo: boolean;
  onImport: () => void;
  onSync: () => void;
  syncing: boolean;
}

const THEME_KEY = 'makerlog:theme';

export function Header({ onConnect, onToggleDemo, viewingDemo, onImport, onSync, syncing }: HeaderProps) {
  const [theme, setTheme] = useState<'auto' | 'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'auto';
    return (localStorage.getItem(THEME_KEY) as 'auto' | 'light' | 'dark') ?? 'auto';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const cycleTheme = () => {
    setTheme((t) => (t === 'auto' ? 'light' : t === 'light' ? 'dark' : 'auto'));
  };

  const themeIcon = theme === 'dark'
    ? <Moon size={16} strokeWidth={1.75} />
    : theme === 'light'
      ? <Sun size={16} strokeWidth={1.75} />
      : <Sun size={16} strokeWidth={1.75} style={{ opacity: 0.6 }} />;

  return (
    <header className="ml-header">
      <div className="ml-brand">
        <span className="ml-brand__mark" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M4 18 L4 8 L9 13 L13 6 L17 12 L20 5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="20" cy="5" r="2" fill="white" />
          </svg>
        </span>
        <div>
          <div>makerlog</div>
          <div className="ml-brand__sub">a journal of what you ship</div>
        </div>
      </div>
      <div className="ml-header__actions">
        <button
          className={`of-btn of-btn--md ${viewingDemo ? 'of-btn--secondary' : 'of-btn--ghost'}`}
          onClick={onToggleDemo}
          title={viewingDemo ? 'Return to your real data' : 'Preview with sample data'}
        >
          {viewingDemo
            ? <><X size={16} strokeWidth={1.75} /><span>Exit demo</span></>
            : <><RefreshCw size={16} strokeWidth={1.75} /><span>Demo data</span></>}
        </button>
        <button className="of-btn of-btn--ghost of-btn--md" onClick={cycleTheme} aria-label={`Theme: ${theme}`}>
          {themeIcon}
        </button>
        <button className="of-btn of-btn--ghost of-btn--md" onClick={onSync} disabled={syncing} title="Sync latest data from GitHub">
          {syncing
            ? <Loader2 size={16} strokeWidth={1.75} style={{ animation: 'ml-spin 1s linear infinite' }} />
            : <RefreshCw size={16} strokeWidth={1.75} />}
          <span>Sync</span>
        </button>
        <button className="of-btn of-btn--secondary of-btn--md" onClick={onConnect} title="Connect a GitLab repo via Personal Access Token">
          <GitBranchPlus size={16} strokeWidth={1.75} />
          <span>Connect repo</span>
        </button>
        <button className="of-btn of-btn--primary of-btn--md" onClick={onImport} title="Import a makerlog JSON snapshot">
          <Upload size={16} strokeWidth={1.75} />
          <span>Import your data</span>
        </button>
      </div>
    </header>
  );
}
