import { useState } from 'react';
import { editorStore } from '../../store/editorStore';
import { useUi } from '../../store/uiStore';
import { Modal } from './Modal';

/** 선택한 부품을 그룹으로 묶거나, 그룹 이름을 바꾼다 */
export function GroupDialog() {
  const edit = useUi((s) => s.groupEdit)!;
  const close = () => useUi.getState().setGroupEdit(null);
  const group = 'id' in edit ? editorStore.getState().circuit.groups?.find((g) => g.id === edit.id) : undefined;
  const count = editorStore.getState().selection.parts.length;
  const [name, setName] = useState(group?.name ?? '');

  const apply = () => {
    const st = editorStore.getState();
    if (group) st.renameGroup(group.id, name);
    else st.groupSelection(name);
    close();
  };

  return (
    <Modal
      title={group ? '그룹 이름 바꾸기' : '그룹으로 묶기'}
      onClose={close}
      footer={
        <>
          <button type="button" className="text-button" onClick={close}>
            취소
          </button>
          <button type="button" className="text-button primary" onClick={apply}>
            {group ? '확인' : '묶기'}
          </button>
        </>
      }
    >
      {!group && <p className="muted small">선택한 부품 {count}개를 점선 사각형으로 묶습니다. 그룹 이름을 누르면 그룹 전체가 선택되고, 파형에는 그룹 경계를 드나드는 신호가 보입니다.</p>}
      <label className="field-label">
        그룹 이름
        <input
          className="field"
          aria-label="그룹 이름"
          placeholder={group ? undefined : '비우면 "그룹 N"'}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
        />
      </label>
    </Modal>
  );
}
