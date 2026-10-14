import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const secretKey = process.env.SESSION_SECRET || 'bizscale-secret-key';
const encodedKey = new TextEncoder().encode(secretKey);

export async function encrypt(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(encodedKey);
}

export async function decrypt(session) {
  try {
    const { payload } = await jwtVerify(session, encodedKey, {
      algorithms: ['HS256'],
    });
    return payload;
  } catch (error) {
    return null;
  }
}

export async function createSession(userId, role) {
  // 30 days instead of 1 — people were getting logged out mid-day/overnight
  // despite never logging out themselves. Someone stays signed in for this
  // whole window unless they actually hit Logout.
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const session = await encrypt({ userId, role, expiresAt });
  
  const cookieStore = await cookies();
  cookieStore.set('session', session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    sameSite: 'lax',
    path: '/',
  });
}

export async function verifySession() {
  const cookieStore = await cookies();
  const session = cookieStore.get('session')?.value;
  if (!session) return null;
  
  return await decrypt(session);
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete('session');
}
