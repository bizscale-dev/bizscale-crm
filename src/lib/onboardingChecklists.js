import { createNotificationsForUsers, getTasksLinkForRole } from '@/lib/notifications';

// Onboarding checklists admin can edit from Manager Tasks → Onboarding. Each is
// a list of sections; every section becomes one manager task (tickable items)
// with its own due date, counted in working days (Sat/Sun skipped).
//
//  - gbp: created automatically for each new SEO client (see
//    clientOnboardingSync.js), one task for the manager who owns the client.
//  - web: assigned by admin by hand to a Web SEO manager for a client + website.
//
// Editing a checklist only affects tasks created after the edit.

export const ONBOARDING_KEYS = ['gbp', 'web'];

export const DEFAULT_ONBOARDING_TEMPLATES = {
  gbp: {
    name: 'GBP onboarding task',
    sections: [
      {
        title: 'Checklist',
        due_days: 2,
        items: [
          'Keyword Research',
          'Current Keywords Ranking',
          'Initial Audit ( Find the issues)',
          'Demand For GMB Posting',
          'Business Description',
          'Service Areas',
          'Services Optimization',
          'Check if logo is uploaded To GMB',
          'Secondary Categories',
          'Audit Social media Accounts',
          'Attach Social media Accounts To GMB',
        ],
      },
    ],
  },
  web: {
    name: 'Web onboarding task',
    sections: [
      {
        title: 'Tools Set Up',
        due_days: 2,
        items: [
          'Google Search Console connect + ownership verify',
          'Google Analytics 4 connect and real-time data test',
          'Google Tag Manager connect',
          'GA4 events configure: form submission, phone click, email click',
          'Conversion tracking test in GA4',
        ],
      },
      {
        title: 'Rank Math Set Up',
        due_days: 2,
        items: [
          'Rank Math setup wizard complete',
          'Search Engine Visibility: discourage search engines',
          'XML sitemap enabled and accessible',
          'Global title separator and SEO defaults configure',
          'Noindex rules review for thin or unnecessary archives',
          'Organization/Local Business details and logo configure',
          'Schema defaults and social metadata configure',
        ],
      },
      {
        title: 'All Pages On-Page SEO',
        due_days: 2,
        items: [
          'Unique meta title (50–60 characters where practical)',
          'Meta description (around 150–160 characters where practical)',
          'Website Site Title',
          'One clear H1 per page and logical H2/H3 hierarchy',
          'Primary keyword mapped to the correct page',
          'Image alt text descriptive and relevant',
          'Featured image set where appropriate',
          'Internal links to relevant service and location pages',
          'Canonical URL verified on each important page',
          'Relevant schema added and validated',
          'CTA, phone number, email and forms tested',
          'Content quality, grammar and search intent checked',
        ],
      },
      {
        title: 'Technical SEO Setup',
        due_days: 2,
        items: [
          'Website speed and Core Web Vitals checked',
          'Mobile responsiveness tested on a real phone',
          'XML sitemap submitted in Google Search Console',
          'robots.txt checked for accidental crawl blocks',
          'Canonical tags checked for important URLs',
          'Broken internal links and 404 pages checked',
          'Duplicate URLs and unwanted indexable pages checked',
          '404 and 5xx responses investigated',
          'Featured image set where appropriate',
        ],
      },
      {
        title: 'Indexing Monitoring & 7-Day Target',
        due_days: 7,
        items: [
          'Homepage indexed by Google within 7 days of launch.',
          'Important service pages indexed within 7 days of publication.',
          'About Us and Contact Us pages checked for indexing.',
          'New blog posts monitored for indexing within 7 days of publication.',
          'All important URLs included in the XML sitemap.',
          'Important URLs inspected in Google Search Console.',
          'Indexing status checked on Day 1, Day 3, Day 5, and Day 7.',
          'Pages not indexed by Day 7 investigated for technical or content-related issues.',
          'Crawlability, canonical tags, noindex directives, content quality, and internal links checked for unindexed pages.',
          'Onsite blog titles and keyword research demand',
          'Off page guest post and Web 2.0 titles demand',
        ],
      },
    ],
  },
};

// Stored sections, or the built-in defaults until admin first saves an edit.
export async function getOnboardingTemplate(db, key) {
  const fallback = DEFAULT_ONBOARDING_TEMPLATES[key];
  if (!fallback) return null;
  const row = await db.prepare('SELECT sections FROM onboarding_checklists WHERE key = ?').get(key);
  if (row) {
    try {
      const sections = JSON.parse(row.sections);
      if (Array.isArray(sections) && sections.length > 0) return { name: fallback.name, sections };
    } catch {
      // fall through to the defaults
    }
  }
  return { name: fallback.name, sections: fallback.sections };
}

// Cleans admin-submitted sections; returns { sections } or { error }.
export function validateSections(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > 15) return { error: 'A checklist needs between 1 and 15 sections' };
  const sections = [];
  for (const s of input) {
    const title = String(s?.title || '').trim().slice(0, 120);
    const dueDays = parseInt(s?.due_days, 10);
    const items = (Array.isArray(s?.items) ? s.items : []).map((i) => String(i || '').trim().slice(0, 400)).filter(Boolean);
    if (!title) return { error: 'Every section needs a title' };
    if (!Number.isInteger(dueDays) || dueDays < 1 || dueDays > 60) return { error: `"${title}": due days must be between 1 and 60` };
    if (items.length === 0 || items.length > 100) return { error: `"${title}": add at least one item (max 100)` };
    sections.push({ title, due_days: dueDays, items });
  }
  return { sections };
}

// Due at the end of the Nth working day after today (Pakistan time) — Saturdays
// and Sundays are not counted.
export function dueDateInWorkingDays(days) {
  const pkt = new Date(Date.now() + 5 * 60 * 60 * 1000);
  let left = days;
  while (left > 0) {
    pkt.setUTCDate(pkt.getUTCDate() + 1);
    const dow = pkt.getUTCDay();
    if (dow !== 0 && dow !== 6) left--;
  }
  return pkt.toISOString().split('T')[0];
}

/**
 * Creates one checklist task per section of the template, all assigned to the
 * given manager and tagged is_default = 1. `label` is what the task is about,
 * e.g. "Greg The Contractor" or "Acme (acme.com)". Returns the task count.
 */
export async function createOnboardingTasks(db, { key, label, manager, adminId }) {
  const template = await getOnboardingTemplate(db, key);
  if (!template) return 0;

  const lines = [];
  for (const section of template.sections) {
    const text = template.sections.length > 1
      ? `${label} — ${template.name} · ${section.title}`
      : `${label} — ${template.name}`;
    const dueDate = dueDateInWorkingDays(section.due_days);
    const result = await db.prepare(`
      INSERT INTO manager_tasks (task_text, due_date, due_time, created_by, urgency, is_default, checklist)
      VALUES (?, ?, '23:59', ?, 'moderate', 1, ?)
    `).run(text, dueDate, adminId, JSON.stringify(section.items));
    await db.prepare('INSERT INTO manager_task_assignees (task_id, user_id) VALUES (?, ?)').run(result.lastInsertRowid, manager.id);
    lines.push(`${section.title} (${section.items.length} items, due ${dueDate})`);
  }

  await createNotificationsForUsers(db, [manager.id], {
    title: `New ${template.name}`,
    message: `${label} — ${template.sections.length === 1 ? lines[0] : `${template.sections.length} checklists`}`.slice(0, 300),
    link: getTasksLinkForRole(manager.role),
  });
  return template.sections.length;
}
