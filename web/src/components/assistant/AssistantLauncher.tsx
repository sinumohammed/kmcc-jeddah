import { lazy, Suspense, useState } from 'react';
import { Drawer, Grid } from 'antd';
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

  return (
    <>
      <button type="button" className="assistant-launcher" onClick={() => setOpen(true)} aria-label="Ask the KMCC assistant" title="Ask the KMCC assistant">
        <AssistantIcon size={38} bare />
        <span className="assistant-launcher-label">Ask Assistant</span>
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
