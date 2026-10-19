import { lazy, Suspense } from 'react';
import { Loader } from '../components/Loader';

// The chat and its charts load only when opened (they are most of the bundle).
const AssistantChat = lazy(() => import('../components/assistant/AssistantChat'));

// The assistant as its own page (menu: Assistant), for both roles.
export function Assistant() {
  return (
    <Suspense fallback={<Loader />}>
      <AssistantChat />
    </Suspense>
  );
}
