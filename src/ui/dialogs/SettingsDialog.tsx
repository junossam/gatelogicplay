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
      <p className="muted small">켜면 팔레트에 클럭이 보입니다. 클럭은 설정한 주파수(Hz)로 반전합니다. 단, 한 틱에 한 번보다 자주 바뀔 수는 없어서 시뮬레이션 속도의 절반보다 높은 주파수는 그만큼 느려집니다(예: 속도 1Hz에서는 클럭이 최대 0.5Hz).</p>
    </Modal>
  );
}
