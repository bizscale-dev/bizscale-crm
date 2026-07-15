export const LINK_TYPES = ['web2', 'guestpost', 'pdf', 'profile', 'citation', 'image'];

export const LINK_TYPE_LABELS = {
  web2: 'Web 2.0',
  guestpost: 'Guest Post',
  pdf: 'PDF',
  profile: 'Profile',
  citation: 'Citation',
  image: 'Image',
};

export const LINK_TYPE_TARGET_FIELDS = {
  web2: 'web2_target',
  guestpost: 'guestpost_target',
  pdf: 'pdf_target',
  profile: 'profile_target',
  citation: 'citation_target',
  image: 'image_target',
};

export const DEFAULT_LINK_TARGETS = {
  web2: 7,
  guestpost: 7,
  pdf: 7,
  profile: 10,
  citation: 10,
  image: 9,
};

export function getInitialLinkTargetRows(initialData) {
  if (!initialData) {
    return LINK_TYPES.map((linkType) => ({
      linkType,
      target: DEFAULT_LINK_TARGETS[linkType],
    }));
  }

  const active = LINK_TYPES.filter(
    (linkType) => (initialData[LINK_TYPE_TARGET_FIELDS[linkType]] ?? 0) > 0
  ).map((linkType) => ({
    linkType,
    target: initialData[LINK_TYPE_TARGET_FIELDS[linkType]],
  }));

  if (active.length > 0) return active;

  return LINK_TYPES.map((linkType) => ({
    linkType,
    target: DEFAULT_LINK_TARGETS[linkType],
  }));
}
