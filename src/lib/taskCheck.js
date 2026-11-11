// Shared config for the Executives who check submitted tasks (Pass / Fail / Report):
//   Web Developer Executive      -> checks the Web Developer - SEO's tasks
//   Graphic Designer Executive   -> checks the Graphics Designers' tasks
export const CHECK_TARGETS = {
  web_developer_executive: { targetRole: 'web_developer_seo', targetLabel: 'Web Developer', execLabel: 'Web Developer Executive', base: '/web-dev-executive', checksPath: '/web-dev-executive/checks', reportsPath: '/web-dev-executive/reports' },
  // The Web SEO managers (Ammar, Sikandar) check the Web Developer's tasks too, from their own portal.
  web_seo_manager: { targetRole: 'web_developer_seo', targetLabel: 'Web Developer', execLabel: 'Web SEO Manager', base: '/web-seo-manager', checksPath: '/web-seo-manager/developer-checks', reportsPath: '/web-seo-manager/developer-reports' },
  graphic_designer_executive: { targetRole: 'graphic_designer', targetLabel: 'Graphics Designer', execLabel: 'Graphic Designer Executive', base: '/graphic-executive', checksPath: '/graphic-executive/checks', reportsPath: '/graphic-executive/reports' },
};

// The roles whose submitted tasks get checked (the reported side), and where their pages live.
export const CHECKED_ROLES = ['web_developer_seo', 'graphic_designer'];
export const EXEC_ROLES = Object.keys(CHECK_TARGETS);
