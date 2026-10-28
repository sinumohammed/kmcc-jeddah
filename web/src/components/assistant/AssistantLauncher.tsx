import { lazy, Suspense, useEffect, useState } from 'react';
import { Badge, Drawer, Grid } from 'antd';
import { getAssistantStatus } from '../../api/assistant';
import { Loader } from '../Loader';
import AssistantIcon from './AssistantIcon';
import './AssistantLauncher.css';

// The chat and its charts load only when first opened (they are most of the bundle).
const AssistantChat = lazy(() => import('./AssistantChat'));

// The assistant from any screen (AppLayout): a floating button that opens
// the chat in a drawer - the whole screen on a phone.
export function AssistantLauncher() {
  const [open, setOpen] = useState(false);
  const isMobile = !Grid.useBreakpoint().sm;
  // Unread replies to "Ask a person" (AskPerson.tsx): a count on the button. Asked again when the
  // app comes back into view and when the chat is closed (it reads them while open).
  const [replies, setReplies] = useState(0);
  useEffect(() => {
    if (open) return undefined;
    let cancelled = false;
    const check = () => getAssistantStatus().then((s) => !cancelled && setReplies(s.handover?.newReplies ?? 0)).catch(() => {});
    check();
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [open]);

  return (
    <>
      <button type="button" className="assistant-launcher" onClick={() => setOpen(true)} aria-label="Ask the KMCC assistant" title="Ask the KMCC assistant">
        <Badge count={replies} size="small" offset={[-4, 4]}>
          <AssistantIcon size={38} bare />
        </Badge>
        <span className="assistant-launcher-label">{replies ? 'New reply' : 'Ask Assistant'}</span>
      </button>
      <Drawer
        title={null}
        closable={false}
        open={open}
        onClose={() => setOpen(false)}
        placement="right"
        size={isMobile ? '100%' : 460}
        destroyOnHidden
        styles={{ body: { padding: 0, overflow: 'hidden' } }}
      >
        <Suspense fallback={<Loader />}>
          <AssistantChat embedded onClose={() => setOpen(false)} />
        </Suspense>
      </Drawer>
    </>
  );
}
