'use client';

import {useEffect, useRef, type RefObject} from 'react';

type ModalEntry = {
  element: HTMLElement;
  close: () => void;
  previousFocus: HTMLElement | null;
};

const openModals: ModalEntry[] = [];
const isolatedElements = new Map<HTMLElement, boolean>();
let bodyOverflow = '';

function canFocus(element: HTMLElement) {
  return element.isConnected && !element.closest('[inert]') &&
    !element.matches(':disabled') && element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== 'hidden';
}

function focusableElements(element: HTMLElement) {
  return Array.from(element.querySelectorAll<HTMLElement>(
    'a[href],button,input:not([type="hidden"]),select,textarea,summary,[tabindex],[contenteditable="true"]'
  )).filter(item => item.tabIndex >= 0 && canFocus(item));
}

function firstFocus(element: HTMLElement) {
  const preferred = element.querySelector<HTMLElement>('[data-modal-initial-focus]');
  return preferred && canFocus(preferred) ? preferred : focusableElements(element)[0] || element;
}

function updateIsolation() {
  for (const [element, previous] of isolatedElements) element.inert = previous;
  isolatedElements.clear();

  // Walk the active dialog's ancestors, so nested dialogs keep only their own
  // content available to keyboard and assistive technology users.
  let branch: HTMLElement | null = openModals.at(-1)?.element || null;
  while (branch && branch !== document.body) {
    const parent: HTMLElement | null = branch.parentElement;
    if (!parent) break;
    for (const sibling of Array.from(parent.children)) {
      if (sibling !== branch && sibling instanceof HTMLElement) {
        isolatedElements.set(sibling, sibling.inert);
        sibling.inert = true;
      }
    }
    branch = parent;
  }
}

function handleKey(event: KeyboardEvent) {
  const current = openModals.at(-1);
  if (!current || event.isComposing || event.defaultPrevented) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    current.close();
    return;
  }
  if (event.key !== 'Tab') return;
  const elements = focusableElements(current.element);
  const active = document.activeElement;
  const index = elements.findIndex(element => element === active);
  if (!elements.length) {
    event.preventDefault();
    current.element.focus();
  } else if (event.shiftKey && index <= 0) {
    event.preventDefault();
    elements.at(-1)?.focus();
  } else if (!event.shiftKey && (index === -1 || index === elements.length - 1)) {
    event.preventDefault();
    elements[0].focus();
  }
}

function handleFocus(event: FocusEvent) {
  const current = openModals.at(-1);
  if (current && event.target instanceof Node && !current.element.contains(event.target)) {
    firstFocus(current.element).focus({preventScroll: true});
  }
}

/** Focus handling shared by dialogs, drawers and the mobile navigation. */
export function useModalFocus<T extends HTMLElement>(
  ref: RefObject<T | null>,
  close: () => void,
  active = true,
) {
  const closeRef = useRef(close);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => { closeRef.current = close; }, [close]);
  useEffect(() => {
    const element = ref.current;
    if (!active || !element) return;
    // React may replay an effect while focus is already inside the dialog.
    // Preserve the original trigger instead of treating the dialog as its own trigger.
    if (document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body &&
      document.activeElement !== document.documentElement &&
      !element.contains(document.activeElement)) {
      returnFocusRef.current = document.activeElement;
    }
    const entry: ModalEntry = {
      element,
      close: () => closeRef.current(),
      previousFocus: returnFocusRef.current,
    };
    if (!openModals.length) {
      bodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleKey);
      document.addEventListener('focusin', handleFocus);
    }
    openModals.push(entry);
    updateIsolation();
    firstFocus(element).focus({preventScroll: true});
    return () => {
      const wasTop = openModals.at(-1) === entry;
      openModals.splice(openModals.indexOf(entry), 1);
      updateIsolation();
      if (!openModals.length) {
        document.body.style.overflow = bodyOverflow;
        document.removeEventListener('keydown', handleKey);
        document.removeEventListener('focusin', handleFocus);
      }
      if (!wasTop) return;
      // A newly mounted dialog may already own focus after a dialog-to-dialog
      // transition. Do not steal it during the previous dialog's cleanup.
      requestAnimationFrame(() => {
        const top = openModals.at(-1);
        if (top && top.element.contains(document.activeElement)) return;
        const previous = entry.previousFocus;
        if (previous && canFocus(previous) && (!top || top.element.contains(previous))) {
          previous.focus({preventScroll: true});
        } else if (top) {
          firstFocus(top.element).focus({preventScroll: true});
        } else {
          document.getElementById('workspace-page-title')?.focus({preventScroll: true});
        }
      });
    };
  }, [ref, active]);
}
