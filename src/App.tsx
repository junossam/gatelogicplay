import { useEditor } from './store/editorStore';
import { useUi } from './store/uiStore';
import { ChallengeListDialog } from './ui/challenges/ChallengeListDialog';
import { ChallengePanel } from './ui/challenges/ChallengePanel';
import { Board } from './ui/Canvas/Board';
import { ImportDialog, MessageDialog } from './ui/dialogs/ImportDialog';
import { SaveChipDialog } from './ui/dialogs/SaveChipDialog';
import { SettingsDialog } from './ui/dialogs/SettingsDialog';
import { SamplesDialog } from './ui/dialogs/SamplesDialog';
import { ShareDialog } from './ui/dialogs/ShareDialog';
import { CategoryDialog } from './ui/dialogs/CategoryDialog';
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
  const settingsOpen = useUi((s) => s.settingsOpen);
  const challengesOpen = useUi((s) => s.challengesOpen);
  const shareOpen = useUi((s) => s.shareOpen);
  const samplesOpen = useUi((s) => s.samplesOpen);
  const categoryEdit = useUi((s) => s.categoryEdit);
  const challengeId = useEditor((s) => s.openChallengeId);
  return (
    <div className="app">
      <Header />
      <div className="workspace">
        <Palette />
        <main className="canvas-area">
          <Board />
          <Waveform />
        </main>
        <Inspector top={challengeId ? <ChallengePanel id={challengeId} /> : null} />
      </div>
      {truthOpen && <TruthTableDialog />}
      {saveOpen && <SaveChipDialog />}
      {pendingImport && <ImportDialog />}
      {settingsOpen && <SettingsDialog />}
      {challengesOpen && <ChallengeListDialog />}
      {shareOpen && <ShareDialog />}
      {samplesOpen && <SamplesDialog />}
      {categoryEdit && <CategoryDialog />}
      {message && <MessageDialog />}
    </div>
  );
}
