import { useUi } from './store/uiStore';
import { Board } from './ui/Canvas/Board';
import { ImportDialog, MessageDialog } from './ui/dialogs/ImportDialog';
import { SaveChipDialog } from './ui/dialogs/SaveChipDialog';
import { Header } from './ui/Header/Header';
import { Inspector } from './ui/Inspector/Inspector';
import { Palette } from './ui/Palette/Palette';
import { TruthTableDialog } from './ui/TruthTable/TruthTableDialog';
import { Waveform } from './ui/Waveform/Waveform';

export function App() {
  const truthOpen = useUi((s) => s.truthOpen);
  const saveOpen = useUi((s) => s.saveOpen);
  const pendingImport = useUi((s) => s.pendingImport);
  const message = useUi((s) => s.message);
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
      {saveOpen && <SaveChipDialog />}
      {pendingImport && <ImportDialog />}
      {message && <MessageDialog />}
    </div>
  );
}
