import { useId, useState } from 'react';
import { chipCategories } from '../../model/library';
import { editorStore, useEditor } from '../../store/editorStore';
import { useUi } from '../../store/uiStore';
import { Modal } from './Modal';

/** 칩 하나의 분류를 바꾸거나, 분류 이름을 바꾼다 */
export function CategoryDialog() {
  const edit = useUi((s) => s.categoryEdit)!;
  const close = () => useUi.getState().setCategoryEdit(null);
  const library = useEditor((s) => s.library);
  const listId = useId();
  const chip = 'chipId' in edit ? library[edit.chipId] : undefined;
  const [value, setValue] = useState(chip ? (chip.category ?? '') : 'rename' in edit ? edit.rename : '');

  const apply = () => {
    if ('chipId' in edit) editorStore.getState().setChipCategory(edit.chipId, value);
    else editorStore.getState().renameCategory(edit.rename, value);
    close();
  };

  return (
    <Modal
      title={chip ? `분류 바꾸기 · ${chip.name}` : '분류 이름 바꾸기'}
      onClose={close}
      footer={
        <>
          <button type="button" className="text-button" onClick={close}>
            취소
          </button>
          <button type="button" className="text-button primary" onClick={apply}>
            확인
          </button>
        </>
      }
    >
      <label className="field-label">
        {chip ? '분류 (비우면 분류 없음)' : '새 이름 (비우면 이 분류의 칩은 분류 없음으로)'}
        <input
          className="field"
          aria-label="분류"
          list={listId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
        />
      </label>
      <datalist id={listId}>
        {chipCategories(library).map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </Modal>
  );
}
