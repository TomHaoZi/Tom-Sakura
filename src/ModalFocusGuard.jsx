import { useEffect } from 'react';

export default function ModalFocusGuard() {
  useEffect(() => {
    const dialogs = () => [...document.querySelectorAll('[role="dialog"]')];
    const dialog = dialogs().at(-1);
    if (!dialog) return;
    const previous = document.activeElement;
    const focusable = () => [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), video, [tabindex="0"]')].filter(node => node.getClientRects().length);
    const focusFirst = () => focusable()[0]?.focus();
    const keydown = event => {
      if (event.key !== 'Tab' || dialogs().at(-1) !== dialog) return;
      const nodes = focusable();
      const first = nodes[0], last = nodes.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (!dialog.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const focusin = event => { if (dialogs().at(-1) === dialog && !dialog.contains(event.target)) focusFirst(); };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', focusin);
    focusFirst();
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', focusin);
      if (!dialogs().some(node => node !== dialog) && previous?.isConnected) previous.focus();
    };
  }, []);
  return null;
}
