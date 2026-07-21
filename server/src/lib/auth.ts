import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

export interface AuthPayload {
  memberId: string;
  memberCode: string;
  role: 'ADMIN' | 'MEMBER';
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, JWT_SECRET) as AuthPayload;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
