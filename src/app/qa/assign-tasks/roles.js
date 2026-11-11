// Who QA can assign tasks to, split by which task system carries the task:
//  - manager tier  -> manager_tasks (the managers' own Tasks pages)
//  - associate tier -> associate_tasks (the associates' / Web Developers' / Graphics Designers' / Writers' Manager Tasks pages)
// Roles with no page to receive a task (HR, the Executives, admin) are left out.
export const MANAGER_TIER_ROLES = ['seo_manager', 'web_seo_manager', 'writers_manager'];
export const ASSOCIATE_TIER_ROLES = ['senior_seo_associate', 'seo_associate', 'web_seo_associate', 'web_developer_seo', 'graphic_designer', 'writer'];

export const ROLE_GROUPS = [
  { label: 'Managers', roles: ['seo_manager', 'web_seo_manager', 'writers_manager'] },
  { label: 'SEO team', roles: ['senior_seo_associate', 'seo_associate'] },
  { label: 'Web SEO team', roles: ['web_seo_associate', 'web_developer_seo'] },
  { label: 'Graphics', roles: ['graphic_designer'] },
  { label: 'Writers', roles: ['writer'] },
];

export const ROLE_LABELS = {
  seo_manager: 'SEO Manager',
  web_seo_manager: 'Web SEO Manager',
  writers_manager: 'Writers Manager',
  senior_seo_associate: 'Senior SEO Associate',
  seo_associate: 'SEO Associate',
  web_seo_associate: 'Web SEO Associate',
  web_developer_seo: 'Web Developer',
  graphic_designer: 'Graphics Designer',
  writer: 'Writer',
};
