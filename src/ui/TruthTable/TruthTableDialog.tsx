import { useState } from 'react';
import { useUi } from '../../store/uiStore';
import { Modal } from '../dialogs/Modal';
import { TruthTableView, useTruthTable } from './TruthTableView';

export function TruthTableDialog() {
  const setOpen = useUi((s) => s.setTruthOpen);
  const [force, setForce] = useState(false);
  const state = useTruthTable(force);
  return (
    <Modal title="진리표" onClose={() => setOpen(false)} wide>
      <TruthTableView state={state} onForce={() => setForce(true)} />
    </Modal>
  );
}
