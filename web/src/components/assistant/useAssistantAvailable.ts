import { useEffect, useState } from 'react';
import { getAssistantStatus } from '../../api/assistant';
import { useAuthStore } from '../../store/auth';

// Whether the server has the assistant set up (AI_ASK_URL, AI_ASK_KEY,
// KMCC_AI_TOKEN): the menu item, the floating button and the Settings cards
// show only then. Asked again when someone else logs in.
export function useAssistantAvailable() {
  const memberId = useAuthStore((s) => s.member?.id);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!memberId) return;
    let cancelled = false;
    getAssistantStatus()
      .then(({ available }) => !cancelled && setAvailable(available))
      .catch(() => !cancelled && setAvailable(false));
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  return memberId ? available : false;
}
