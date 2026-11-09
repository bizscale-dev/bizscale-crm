// Shared config for the Executives who check submitted tasks (Pass / Fail / Report):
//   Web Developer Executive      -> checks the Web Developer - SEO's tasks
//   Graphic Designer Executive   -> checks the Graphics Designers' tasks
export const CHECK_TARGETS = {
  web_developer_executive: { targetRole: 'web_developer_seo', targetLabel: 'Web Developer', execLabel: 'Web Developer Executive', base: '/web-dev-executive' },
  graphic_designer_executive: { targetRole: 'graphic_designer', targetLabel: 'Graphics Designer', execLabel: 'Graphic Designer Executive', base: '/graphic-executive' },
};

// The roles whose submitted tasks get checked (the reported side), and where their pages live.
export const CHECKED_ROLES = ['web_developer_seo', 'graphic_designer'];
export const EXEC_ROLES = Object.keys(CHECK_TARGETS);
