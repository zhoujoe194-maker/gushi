'use client';
import { useEffect, useRef, useState } from 'react';

/** Protect a form's current edits; successful saves close through the parent. */
export function useUnsavedChanges(
  snapshot: string,
  close: () => void,
  busy: boolean,
) {
  const [initial] = useState(snapshot);
  const [confirming, setConfirming] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  const dirty = snapshot !== initial;
  useEffect(() => {
    if (!confirming) trigger.current?.focus();
  }, [confirming]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  return {
    confirming,
    busy,
    requestClose: () => {
      if (busy) return;
      if (!dirty) return close();
      trigger.current = document.activeElement as HTMLElement | null;
      setConfirming(true);
    },
    keepEditing: () => setConfirming(false),
    discard: () => {
      if (!busy) close();
    },
  };
}
