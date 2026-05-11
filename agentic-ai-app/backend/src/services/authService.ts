/**
 * Auth Service — Demo hardcoded users
 * ─────────────────────────────────────
 * Three users with three roles loaded from .env.
 * No database, no JWT — simple session token stored in memory.
 * Suitable for localhost demo only.
 */

import crypto from 'crypto';

export type UserRole = 'ADMIN' | 'EMPLOYEE' | 'INTERN';

export interface DemoUser {
  id: number;
  email: string;
  password: string;
  role: UserRole;
  name: string;
}

export interface AuthSession {
  token: string;
  userId: number;
  email: string;
  role: UserRole;
  name: string;
  createdAt: number;
}

// ─── Load demo users from env ─────────────────────────────────────────────────

function parseDemoUser(envKey: string, id: number): DemoUser | null {
  const raw = process.env[envKey];
  if (!raw) return null;
  const parts = raw.split(':');
  if (parts.length < 3) return null;
  const [email, password, role] = parts;
  const nameMap: Record<string, string> = {
    ADMIN: 'Admin User',
    EMPLOYEE: 'Employee User',
    INTERN: 'Intern User',
  };
  return {
    id,
    email: email.trim(),
    password: password.trim(),
    role: role.trim() as UserRole,
    name: nameMap[role.trim()] ?? role.trim(),
  };
}

const DEMO_USERS: DemoUser[] = [
  parseDemoUser('DEMO_USER_1', 1),
  parseDemoUser('DEMO_USER_2', 2),
  parseDemoUser('DEMO_USER_3', 3),
].filter(Boolean) as DemoUser[];

// Fallback if env not set
if (DEMO_USERS.length === 0) {
  DEMO_USERS.push(
    { id: 1, email: 'admin@agenticai.demo',    password: 'AgentAdmin@2026',    role: 'ADMIN',    name: 'Admin User' },
    { id: 2, email: 'employee@agenticai.demo', password: 'AgentEmp@2026',      role: 'EMPLOYEE', name: 'Employee User' },
    { id: 3, email: 'intern@agenticai.demo',   password: 'AgentIntern@2026',   role: 'INTERN',   name: 'Intern User' }
  );
}

// ─── In-memory session store ──────────────────────────────────────────────────
// Token → AuthSession. Sessions expire after 8 hours.

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const sessions = new Map<string, AuthSession>();

// Cleanup expired sessions every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(token);
    }
  }
}, 30 * 60 * 1000);

// ─── Public API ───────────────────────────────────────────────────────────────

export function login(email: string, password: string): AuthSession | null {
  const user = DEMO_USERS.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  );
  if (!user) return null;

  // Invalidate any existing session for this user
  for (const [token, session] of sessions.entries()) {
    if (session.userId === user.id) sessions.delete(token);
  }

  const token = crypto.randomBytes(32).toString('hex');
  const session: AuthSession = {
    token,
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    createdAt: Date.now(),
  };
  sessions.set(token, session);
  return session;
}

export function getSession(token: string): AuthSession | null {
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return null;
  }
  return session;
}

export function logout(token: string): void {
  sessions.delete(token);
}

export function getDemoUsers(): Array<{ email: string; role: UserRole; name: string }> {
  return DEMO_USERS.map(({ email, role, name }) => ({ email, role, name }));
}
