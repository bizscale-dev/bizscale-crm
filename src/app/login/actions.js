'use server';

import { initDb } from '@/lib/db';
import { createSession } from '@/lib/session';
import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';

export async function login(prevState, formData) {
  const email = formData.get('email');
  const password = formData.get('password');

  if (!email || !password) {
    return { error: 'Email and password are required' };
  }

  const db = await initDb();

  
  try {
    const user = await db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);
    
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return { error: 'Invalid email or password' };
    }

    await createSession(user.id, user.role);
    
  } catch (error) {
    console.error('Login error:', error);
    return { error: 'An unexpected error occurred during login' };
  }

  // We need to fetch the user role again or pass it directly to redirect
  // But since we can't redirect inside a try-catch block catching it, we do it outside
  const user = await db.prepare('SELECT role FROM users WHERE email = ? AND is_active = 1').get(email);
  
  const redirectMap = {
    admin: '/admin',
    seo_associate: '/associate',
    writer: '/writer',
    manager: '/manager',
    web_seo_associate: '/web-associate',
    writers_manager: '/writers-manager',
    seo_manager: '/seo-manager',
    web_seo_manager: '/web-seo-manager'
  };

  redirect(redirectMap[user.role] || '/');
}

export async function logout() {
  const { deleteSession } = await import('@/lib/session');
  await deleteSession();
  redirect('/login');
}
