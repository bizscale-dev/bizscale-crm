// Hardcoded Funnel Month 1 checklist — seeded once per campaign into `tunnel_templates`
// (week_number = 0, meaning "flat list, not week-scheduled").
export const FUNNEL_MONTH1_ITEMS = [
  { category: 'Citations', platform: 'n49.com', url: null, note: null },
  { category: 'Citations', platform: 'manta.com', url: null, note: null },
  { category: 'Citations', platform: 'anibookmark.com', url: null, note: null },
  { category: 'Citations', platform: 'chamberofcommerce.com', url: null, note: null },
  { category: 'Citations', platform: 'citysquares.com', url: null, note: 'Requires GBP Link' },
  { category: 'Citations', platform: 'ezlocal.com', url: null, note: 'Optional' },
  { category: 'Citations', platform: 'brownbook.net', url: null, note: null },
  { category: 'Citations', platform: 'blinx.biz', url: 'https://www.blinx.biz/', note: 'Profile from Brownbook' },
  { category: 'Citations', platform: 'cybo.com', url: 'https://www.cybo.com/', note: null },
  { category: 'Citations', platform: 'provenexpert.com', url: 'https://www.provenexpert.com', note: null },
  { category: 'Citations', platform: 'freelistingusa.com', url: 'https://www.freelistingusa.com/', note: null },
  { category: 'Citations', platform: 'mylifegb.com', url: 'https://www.mylifegb.com/', note: null },
  { category: 'Citations', platform: 'letsknowit.com', url: 'https://www.letsknowit.com/', note: null },
  { category: 'Citations', platform: 'merchantcircle.com', url: 'https://www.merchantcircle.com/', note: null },
  { category: 'Citations', platform: 'hotfrog.com', url: 'https://www.hotfrog.com', note: null },
  { category: 'Citations', platform: 'dibiz.com', url: 'https://www.dibiz.com', note: null },

  { category: 'Profiles', platform: 'about.me', url: 'https://about.me/', note: 'Requires Gmail Account' },
  { category: 'Profiles', platform: 'quora.com', url: 'https://www.quora.com/', note: null },
  { category: 'Profiles', platform: 'ted.com', url: 'https://www.ted.com/', note: null },
  { category: 'Profiles', platform: 'issuu.com', url: 'https://issuu.com/', note: null },
  { category: 'Profiles', platform: 'reddit.com', url: 'https://www.reddit.com/', note: 'Use VPN' },
  { category: 'Profiles', platform: 'inkitt.com', url: 'https://www.inkitt.com/', note: null },
  { category: 'Profiles', platform: 'pinterest.com', url: 'https://www.pinterest.com/', note: null },
  { category: 'Profiles', platform: 'linkcentre.com', url: 'https://www.linkcentre.com', note: null },
  { category: 'Profiles', platform: 'peatix.com', url: 'https://peatix.com', note: null },
  { category: 'Profiles', platform: 'pexels.com', url: 'https://www.pexels.com', note: null },

  { category: 'Web 2.0', platform: 'Medium', url: null, note: null },
  { category: 'Web 2.0', platform: 'Wix', url: null, note: null },
  { category: 'Web 2.0', platform: 'Weebly', url: null, note: null },
  { category: 'Web 2.0', platform: 'Google Sites', url: null, note: null },
  { category: 'Web 2.0', platform: 'Blogger', url: null, note: null },

  { category: 'Guest Post', platform: 'Guest Post #1', url: null, note: null },
  { category: 'Guest Post', platform: 'Guest Post #2', url: null, note: null },
  { category: 'Guest Post', platform: 'Guest Post #3', url: null, note: null },
  { category: 'Guest Post', platform: 'Guest Post #4', url: null, note: null },
  { category: 'Guest Post', platform: 'Guest Post #5', url: null, note: null },

  { category: 'Image Submission', platform: 'tripadvisor.com', url: 'https://www.tripadvisor.com/', note: null },
  { category: 'Image Submission', platform: 'pinterest.com', url: 'https://www.pinterest.com/', note: null },
  { category: 'Image Submission', platform: 'behance.net', url: 'https://www.behance.net/', note: null },
  { category: 'Image Submission', platform: '500px', url: null, note: null },

  { category: 'PDF Submission', platform: 'slideshare.net', url: 'https://www.slideshare.net/', note: null },
  { category: 'PDF Submission', platform: 'issuu.com', url: 'https://issuu.com/', note: null },
  { category: 'PDF Submission', platform: '4shared.com', url: 'https://www.4shared.com/', note: null },
  { category: 'PDF Submission', platform: 'SlideShare', url: null, note: null },
];

// Maps each LINK_TYPES entry to the campaigns column holding its funnel-month bonus count.
export const FUNNEL_BONUS_FIELDS = {
  web2: 'funnel_bonus_web2',
  guestpost: 'funnel_bonus_guestpost',
  pdf: 'funnel_bonus_pdf',
  profile: 'funnel_bonus_profile',
  citation: 'funnel_bonus_citation',
  image: 'funnel_bonus_image',
};
