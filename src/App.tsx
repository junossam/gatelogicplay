import { Board } from './ui/Canvas/Board';
import { Header } from './ui/Header/Header';
import { Inspector } from './ui/Inspector/Inspector';
import { Palette } from './ui/Palette/Palette';

export function App() {
  return (
    <div className="app">
      <Header />
      <div className="workspace">
        <Palette />
        <main className="canvas-area">
          <Board />
        </main>
        <Inspector />
      </div>
    </div>
  );
}
