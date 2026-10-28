import { useUi } from './store/uiStore';
import { Board } from './ui/Canvas/Board';
import { Header } from './ui/Header/Header';
import { Inspector } from './ui/Inspector/Inspector';
import { Palette } from './ui/Palette/Palette';
import { TruthTableDialog } from './ui/TruthTable/TruthTableDialog';
import { Waveform } from './ui/Waveform/Waveform';

export function App() {
  const truthOpen = useUi((s) => s.truthOpen);
  return (
    <div className="app">
      <Header />
      <div className="workspace">
        <Palette />
        <main className="canvas-area">
          <Board />
          <Waveform />
        </main>
        <Inspector />
      </div>
      {truthOpen && <TruthTableDialog />}
    </div>
  );
}
