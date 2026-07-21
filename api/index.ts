import type { IncomingMessage, ServerResponse } from 'http';
import app from '../server/src/app';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
}
