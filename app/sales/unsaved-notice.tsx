'use client';
import { useEffect, useRef } from 'react';
import type { useUnsavedChanges } from '../../hooks/use-unsaved-changes';

export function UnsavedNotice({
  guard,
}: {
  guard: ReturnType<typeof useUnsavedChanges>;
}) {
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (guard.confirming) keep.current?.focus();
  }, [guard.confirming]);
  if (!guard.confirming) return null;
  return (
    <div className="sales-unsaved-notice">
      <p role="alert">
        填写内容尚未提交。继续填写可保留当前内容；放弃修改后将无法恢复。
      </p>
      <div className="sales-unsaved-actions">
        <button
          ref={keep}
          type="button"
          className="button primary"
          disabled={guard.busy}
          onClick={guard.keepEditing}
        >
          继续填写
        </button>
        <button
          type="button"
          className="button"
          disabled={guard.busy}
          onClick={guard.discard}
        >
          放弃修改并关闭
        </button>
      </div>
    </div>
  );
}
