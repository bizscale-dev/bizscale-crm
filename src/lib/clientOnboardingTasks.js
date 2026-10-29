import { SEO_SUPPORT_RANGES } from '@/lib/qaClientOwners';
import { createOnboardingTasks } from '@/lib/onboardingChecklists';

/**
 * Creates the GBP onboarding task for one new SEO client, assigned to the SEO
 * manager who owns the client (Support column: 1-5 M Hussain, 6-10 Talha — see
 * qaClientOwners.js). The checklist and its due days are edited by admin in
 * Manager Tasks → Onboarding (see onboardingChecklists.js). Does nothing when
 * the client has no Support number or its manager can't be found. Returns the
 * number of tasks created.
 */
export async function createClientOnboardingTasks(db, { clientName, supportNumber }) {
  const range = supportNumber == null
    ? null
    : SEO_SUPPORT_RANGES.find((r) => supportNumber >= r.from && supportNumber <= r.to);
  if (!range) return 0;

  const manager = await db.prepare(`
    SELECT id, role FROM users
    WHERE role = 'seo_manager' AND is_active = 1 AND lower(trim(name)) = ?
  `).get(range.managerName.toLowerCase());
  const admin = await db.prepare(`
    SELECT id FROM users WHERE role = 'admin' AND is_active = 1 ORDER BY id LIMIT 1
  `).get();
  if (!manager || !admin) return 0;

  return createOnboardingTasks(db, { key: 'gbp', label: clientName, manager, adminId: admin.id });
}
