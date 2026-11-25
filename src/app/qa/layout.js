'use client';

import { useEffect, useState } from 'react';
import RoleLayoutShell from '@/components/RoleLayoutShell';
import { getDueFollowUpCount } from './follow-ups/actions';
import { getPendingReviewCount } from './reports/actions';

export default function QaLayout({ children }) {
  const [followUpCount, setFollowUpCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const [count, review] = await Promise.all([getDueFollowUpCount(), getPendingReviewCount()]);
      if (!cancelled) {
        setFollowUpCount(count);
        setReviewCount(review);
      }
    };
    poll();
    const interval = setInterval(poll, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const navItems = [
    { href: '/qa/stats', label: 'Stats' },
    { href: '/qa/clients-stats', label: 'Clients Stats' },
    { href: '/qa/seo-associates', label: 'SEO Associates' },
    { href: '/qa/web-seo-associates', label: 'Web SEO Associates' },
    { href: '/qa/seo-clients', label: 'SEO Clients' },
    { href: '/qa/web-clients', label: 'Web Clients' },
    { href: '/qa/eod', label: 'EOD' },
    { href: '/qa/manager-tasks', label: 'Managers Tasks' },
    { href: '/qa/assign-tasks', label: 'Assign Task' },
    { href: '/qa/executives', label: 'Executives' },
    { href: '/qa/reports', label: 'Reports', badgeCount: reviewCount },
    { href: '/qa/resolved', label: 'Resolved' },
    { href: '/qa/follow-ups', label: 'Follow-ups', badgeCount: followUpCount },
  ];

  const byHref = Object.fromEntries(navItems.map((i) => [i.href, i]));
  const pick = (icon, ...pairs) => pairs.map(([href, ic]) => ({ ...byHref[href], icon: ic || icon }));
  const navGroups = [
    { label: 'Performance & Reports', icon: 'chart', items: pick('chart', ['/qa/stats', 'chart'], ['/qa/clients-stats', 'users'], ['/qa/reports', 'doc'], ['/qa/resolved', 'check']) },
    { label: 'Team Management', icon: 'users', items: pick('user', ['/qa/manager-tasks', 'clipboard'], ['/qa/seo-associates', 'user'], ['/qa/web-seo-associates', 'monitor'], ['/qa/seo-clients', 'users'], ['/qa/web-clients', 'grid'], ['/qa/executives', 'star']) },
    { label: 'Daily Operations', icon: 'calendar', items: pick('doc', ['/qa/eod', 'doc'], ['/qa/assign-tasks', 'plus'], ['/qa/follow-ups', 'bell']) },
  ];

  return (
    <RoleLayoutShell navItems={navItems} navGroups={navGroups} portalLabel="QA" headerTitle="QA Portal">
      {children}
    </RoleLayoutShell>
  );
}
