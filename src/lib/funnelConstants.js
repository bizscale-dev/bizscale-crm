// Hardcoded Funnel Month 1 reference platform list, organized into the 4 weeks the
// client's tasks are actually tracked and synced under (see FUNNEL_MONTH1_WEEK_TARGETS
// below for the real numeric targets — this list is informational only, shown to the
// admin/associate as "here's what this week's citations/profiles/etc. work looks like").
// Seeded once per campaign into `tunnel_templates` (week_number = 1-4).
export const FUNNEL_MONTH1_ITEMS = [
  // Week 1
  { week_number: 1, category: 'Citations', platform: 'n49.com', url: null, note: null },
  { week_number: 1, category: 'Citations', platform: 'manta.com', url: null, note: null },
  { week_number: 1, category: 'Citations', platform: 'anibookmark.com', url: null, note: null },
  { week_number: 1, category: 'Citations', platform: 'chamberofcommerce.com', url: null, note: null },
  { week_number: 1, category: 'Citations', platform: 'citysquares.com', url: null, note: 'Requires GBP Link' },
  { week_number: 1, category: 'Citations', platform: 'ezlocal.com', url: null, note: 'Optional — backup, not part of the 5-target count' },
  { week_number: 1, category: 'Profiles', platform: 'about.me', url: 'https://about.me/', note: 'Requires Gmail Account' },
  { week_number: 1, category: 'Profiles', platform: 'quora.com', url: 'https://www.quora.com/', note: null },
  { week_number: 1, category: 'Profiles', platform: 'ted.com', url: 'https://www.ted.com/', note: null },
  { week_number: 1, category: 'Profiles', platform: 'issuu.com', url: 'https://issuu.com/', note: null },
  { week_number: 1, category: 'Profiles', platform: 'reddit.com', url: 'https://www.reddit.com/', note: 'Use VPN' },
  { week_number: 1, category: 'Image Submission', platform: 'tripadvisor.com', url: 'https://www.tripadvisor.com/', note: null },
  { week_number: 1, category: 'PDF Submission', platform: 'slideshare.net', url: 'https://www.slideshare.net/slideshow/home-improvement-services-ac-windows-attic-roofing/272628047', note: null },

  // Week 2
  { week_number: 2, category: 'Citations', platform: 'brownbook.net', url: null, note: null },
  { week_number: 2, category: 'Citations', platform: 'blinx.biz', url: 'https://www.blinx.biz/', note: 'Profile created from Brownbook' },
  { week_number: 2, category: 'Citations', platform: 'cybo.com', url: 'https://www.cybo.com/', note: null },
  { week_number: 2, category: 'Citations', platform: 'provenexpert.com', url: 'https://www.provenexpert.com', note: null },
  { week_number: 2, category: 'Citations', platform: 'freelistingusa.com', url: 'https://www.freelistingusa.com/', note: null },
  { week_number: 2, category: 'Profiles', platform: 'inkitt.com', url: 'https://www.inkitt.com/', note: null },
  { week_number: 2, category: 'Profiles', platform: 'pinterest.com', url: 'https://www.pinterest.com/', note: null },
  { week_number: 2, category: 'Image Submission', platform: 'pinterest.com', url: 'https://www.pinterest.com/', note: null },
  { week_number: 2, category: 'Image Submission', platform: 'behance.net', url: 'https://www.behance.net/', note: null },
  { week_number: 2, category: 'PDF Submission', platform: 'issuu.com', url: 'https://issuu.com/', note: null },

  // Week 3
  { week_number: 3, category: 'Citations', platform: 'mylifegb.com', url: 'https://www.mylifegb.com/', note: null },
  { week_number: 3, category: 'Citations', platform: 'letsknowit.com', url: 'https://www.letsknowit.com/', note: null },
  { week_number: 3, category: 'Citations', platform: 'merchantcircle.com', url: 'https://www.merchantcircle.com/', note: null },
  { week_number: 3, category: 'Citations', platform: 'hotfrog.com', url: 'https://www.hotfrog.com', note: null },
  { week_number: 3, category: 'Citations', platform: 'dibiz.com', url: 'https://www.dibiz.com', note: null },
  { week_number: 3, category: 'Profiles', platform: 'linkcentre.com', url: 'https://www.linkcentre.com', note: null },
  { week_number: 3, category: 'Profiles', platform: 'peatix.com', url: 'https://peatix.com', note: null },
  { week_number: 3, category: 'Profiles', platform: 'pexels.com', url: 'https://www.pexels.com', note: null },
  { week_number: 3, category: 'Image Submission', platform: 'behance.net', url: 'https://www.behance.net/', note: null },
  { week_number: 3, category: 'Image Submission', platform: 'gifyu.com', url: 'https://gifyu.com/', note: null },
  { week_number: 3, category: 'PDF Submission', platform: '4shared.com', url: 'https://www.4shared.com/', note: null },

  // Week 4 — single day
  { week_number: 4, category: 'Web 2.0', platform: 'Medium', url: null, note: null },
  { week_number: 4, category: 'Web 2.0', platform: 'Wix', url: null, note: null },
  { week_number: 4, category: 'Web 2.0', platform: 'Weebly', url: null, note: null },
  { week_number: 4, category: 'Web 2.0', platform: 'Google Sites', url: null, note: null },
  { week_number: 4, category: 'Web 2.0', platform: 'Blogger', url: null, note: null },
];

// Real, numeric per-week targets for Month 1 — this is what actually drives the
// day-distributed, sheet-synced seo_tasks rows (see taskService.js's generateSEOTasks).
// The platform list above is reference-only; these numbers are the source of truth.
export const FUNNEL_MONTH1_WEEK_TARGETS = {
  1: { citation: 5, profile: 5, image: 1, pdf: 1 },
  2: { citation: 5, profile: 2, image: 2, pdf: 1 },
  3: { citation: 5, profile: 3, image: 2, pdf: 1 },
  4: { web2: 5 },
};

// Campaigns created from now on run Month 1 over 2 weeks (10 working days) instead of 4. The
// client's 38 links are unchanged — 20 in week 1, the other 18 in week 2. Campaigns that already
// exist keep funnel_month1_weeks = 4 and the table above, so no current funnel data changes.
export const FUNNEL_MONTH1_WEEK_TARGETS_2W = {
  1: { citation: 8, profile: 5, image: 3, pdf: 2, web2: 2 },
  2: { citation: 7, profile: 5, image: 2, pdf: 1, web2: 3 },
};

// How many weeks Month 1 lasts for this campaign (2 for new campaigns, 4 for older ones).
export function month1Weeks(campaign) {
  return campaign?.funnel_month1_weeks === 2 ? 2 : 4;
}

export function month1WeekTargets(campaign) {
  return month1Weeks(campaign) === 2 ? FUNNEL_MONTH1_WEEK_TARGETS_2W : FUNNEL_MONTH1_WEEK_TARGETS;
}

// Maps each LINK_TYPES entry to the campaigns column holding its funnel-month bonus count.
export const FUNNEL_BONUS_FIELDS = {
  web2: 'funnel_bonus_web2',
  guestpost: 'funnel_bonus_guestpost',
  pdf: 'funnel_bonus_pdf',
  profile: 'funnel_bonus_profile',
  citation: 'funnel_bonus_citation',
  image: 'funnel_bonus_image',
};
