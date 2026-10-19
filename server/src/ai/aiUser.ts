import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

// The person an AI call is for. The assistant (assistant.ts) asks the AI
// service with a 5-minute read-only token for the logged-in member; the AI
// service sends it back on every /api/ai/* call (X-User-Token), so the
// answers follow that member's role: the admin everything, a member only
// their own savings, dues, loans and transactions.
//
// It is NOT the login token (7 days, can do admin writes): it is signed with
// a key derived from JWT_SECRET, so requireAuth/requireAdmin never accept it,
// and it is useless outside /api/ai/*.
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';
export const AI_USER_SECRET = crypto.createHmac('sha256', JWT_SECRET).update('kmcc-ai-user-token').digest('base64');
const AI_USER_TOKEN_TTL = '5m';

export interface AiUser {
  memberId: string;
  memberCode: string;
  isAdmin: boolean;
}

// The member asking, as the login token gives it (req.user) or a linked chat account.
export interface Asker {
  memberId: string;
  memberCode: string;
  role: 'ADMIN' | 'MEMBER';
}

export function aiUserToken(user: Asker): string {
  return jwt.sign(
    { sub: user.memberId, code: user.memberCode, isAdmin: user.role === 'ADMIN', scope: 'ai-read' },
    AI_USER_SECRET,
    { expiresIn: AI_USER_TOKEN_TTL }
  );
}

// The user an AI call is for, from its X-User-Token; throws without a valid one.
export function aiUserFrom(token: string | undefined): AiUser {
  try {
    const claims = jwt.verify(String(token ?? ''), AI_USER_SECRET) as jwt.JwtPayload;
    if (claims.scope !== 'ai-read' || !claims.sub) throw new Error('wrong scope');
    return { memberId: String(claims.sub), memberCode: String(claims.code ?? ''), isAdmin: claims.isAdmin === true };
  } catch {
    throw new Error('a user token is required (X-User-Token missing or expired)');
  }
}

// Who is asking, for the AI service's usage dashboard (its Command Center):
// "admin" or "member:KMCC0012" - never a name.
export function aiUserRef(user: Asker): string {
  if (user.role === 'ADMIN') return 'admin';
  const code = String(user.memberCode).replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 60);
  return `member:${code || user.memberId}`;
}
