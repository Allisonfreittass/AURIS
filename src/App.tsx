import { useEffect, useState } from 'react';
import { ApiKeySetup } from './components/ApiKeySetup';
import { AuthScreen } from './components/AuthScreen';
import { Overlay } from './components/Overlay';
import { PopupOverlay } from './components/PopupOverlay';
import { AurisLogo } from './components/logo/AurisLogo';
import { auris } from './lib/ipc';
import type { AuthState } from '../shared/ipc';

const isPopup = window.location.hash === '#popup';

export default function App() {
  if (isPopup) return <PopupOverlay />;
  return <MainApp />;
}

type Phase = 'loading' | AuthState | 'no-bridge';

function MainApp() {
  const [phase, setPhase] = useState<Phase>('loading');

  async function refreshPhase() {
    if (!auris || typeof auris.authState !== 'function') {
      setPhase('no-bridge');
      return;
    }
    try {
      const state = await auris.authState();
      setPhase(state);
    } catch {
      setPhase('needs-key');
    }
  }

  useEffect(() => {
    void refreshPhase();
  }, []);

  if (phase === 'loading') {
    return (
      <div className="drag flex h-full w-full items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-4 opacity-90">
          <AurisLogo className="h-[64px] w-[64px]" />
          <div className="font-mono text-[9px] uppercase tracking-widest text-faint">
            Carregando…
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'no-bridge') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg p-6">
        <div className="max-w-[420px] rounded-lg border border-danger/25 bg-danger/[0.08] px-4 py-3 font-sans text-[12px] leading-relaxed text-danger">
          Falha ao inicializar a ponte segura entre o renderer e o processo
          principal (preload). Reinicie o aplicativo.
        </div>
      </div>
    );
  }

  if (phase === 'needs-login') {
    return <AuthScreen onAuthed={refreshPhase} />;
  }

  if (phase === 'needs-key') {
    return <ApiKeySetup onSaved={refreshPhase} />;
  }

  return <Overlay onSignedOut={refreshPhase} />;
}
