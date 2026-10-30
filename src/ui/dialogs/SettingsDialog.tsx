import { useSettings } from '../../store/settingsStore';
import { useUi } from '../../store/uiStore';
import { Modal } from './Modal';

export function SettingsDialog() {
  const clockEnabled = useSettings((s) => s.clockEnabled);
  const setClockEnabled = useSettings((s) => s.setClockEnabled);
  return (
    <Modal title="설정" onClose={() => useUi.getState().setSettingsOpen(false)}>
      <label className="check">
        <input type="checkbox" checked={clockEnabled} onChange={(e) => setClockEnabled(e.target.checked)} />
        클럭 부품 사용
      </label>
      <p className="muted small">켜면 팔레트에 클럭이 보입니다. 클럭은 시뮬레이션 속도와 관계없이 설정한 주파수(Hz)로 반전합니다.</p>
    </Modal>
  );
}
