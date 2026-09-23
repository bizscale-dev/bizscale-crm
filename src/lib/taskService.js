import moment from 'moment';
import { getDb } from './db';
import { LINK_TYPES } from './services';
import { getOffDaysSet, getWorkingDays } from './offDays';
import { FUNNEL_BONUS_FIELDS, FUNNEL_MONTH1_WEEK_TARGETS } from './funnelConstants';

// A funnel client in Month 2 or 3 is tracked through this same seo_tasks pipeline
// (day-distributed, Google Sheet-synced) — their target for each link type is ONLY the
// Month 2 & 3 Bonus Link Targets configured on the campaign (Admin → Funnel),
// not the normal campaign target plus the bonus.
function isFunnelBonusMonthClient(client) {
  return client.tunnel_status === 'active' && (client.funnel_month === 2 || client.funnel_month === 3);
}

// A funnel client in Month 1 is tracked through this same pipeline too, but with a
// fixed 4-week target schedule (FUNNEL_MONTH1_WEEK_TARGETS) instead of one flat
// monthly total — see the week-grouping logic below.
function isMonth1FunnelClient(client) {
  return client.tunnel_status === 'active' && client.funnel_month === 1;
}

// Splits `total` across `count` occurrences as evenly as possible (front-loaded
// remainder, same guarantee as before: the full total is always delivered), but
// starting the "+1" occurrences at `offset` instead of always at index 0. Every
// client sharing a rotation slot shares the exact same set of occurrence days —
// if every client's remainder always landed on their own occurrence 0, every
// client in that slot would get bumped on the SAME calendar day, and every
// other slot's clients would be bumped on THEIR shared day 0 too, stacking into
// a visible staircase across the whole associate's daily totals (big early in
// the campaign, small later). Staggering `offset` by the client's position
// within their day-group spreads those bumps across different days instead, so
// no single day systematically ends up carrying every client's remainder.
function staggeredSplit(total, count, offset = 0) {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total % count;
  const sizes = new Array(count).fill(base);
  for (let r = 0; r < remainder; r++) {
    sizes[(offset + r) % count] += 1;
  }
  return sizes;
}

export async function generateSEOTasks(campaignId) {
  const db = await getDb();
  const campaign = await db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const associates = await db.prepare(`
    SELECT aa.*, u.name, u.email, u.id as user_id
    FROM associate_assignments aa
    JOIN users u ON u.id = aa.user_id
    WHERE aa.campaign_id = ?
    ORDER BY aa.id
  `).all(campaignId);

  if (associates.length === 0) throw new Error('No SEO associates assigned to this campaign');

  // Every active client participates here now, including all 3 funnel months — Month
  // 1 (fixed 4-week reference schedule), Month 2/3 (bonus-field-sourced monthly
  // target), and normal clients (campaign's normal monthly target) all get real
  // day-distributed, sheet-synced seo_tasks rows, just with different targets.
  // tunnel_status = 'hold' clients are excluded entirely — a newly-discovered
  // client sits on hold with zero tasks until an admin manually places them into
  // the Funnel (or straight into the normal rotation) — see src/lib/funnel.js.
  const clients = await db.prepare(`
    SELECT * FROM clients WHERE campaign_id = ? AND is_active = 1 AND (tunnel_status IS NULL OR tunnel_status != 'hold')
    ORDER BY sort_order, id
  `).all(campaignId);

  if (clients.length === 0) throw new Error('No clients found for this campaign');

  const totalDays = campaign.total_days || 16;
  const offDays = await getOffDaysSet(campaignId);
  // total_days means working days — the calendar range extends past weekends/off-days
  // as needed to fit all of them, e.g. a 16-working-day campaign typically spans ~22
  // calendar days.
  const workingDays = getWorkingDays(campaign.start_date || moment().format('YYYY-MM-DD'), totalDays, offDays);

  // Link targets from campaign (MONTHLY targets per link type per client)
  const monthlyLinkTargets = {
    web2: campaign.web2_target || 7,
    guestpost: campaign.guestpost_target || 7,
    pdf: campaign.pdf_target || 7,
    profile: campaign.profile_target || 10,
    citation: campaign.citation_target || 10,
    image: campaign.image_target || 9,
  };

  // Regeneration wipes and rebuilds every task row (needed since adding/removing a
  // client shifts the rotation), which would otherwise reset completed_count to 0 for
  // every already-passed day — the completed-links sync only ever writes to *today's*
  // row, so a wiped past day can never be refilled. Snapshot existing progress first,
  // keyed by (client, day, link type) — that combination stays stable across
  // regenerations since new clients are appended rather than inserted into existing
  // rotation slots — so it can be re-applied to the freshly generated rows below.
  const priorCompleted = new Map();
  const priorRows = await db.prepare(`
    SELECT client_id, day_number, link_type, completed_count
    FROM seo_tasks
    WHERE campaign_id = ? AND completed_count > 0
  `).all(campaignId);
  for (const row of priorRows) {
    priorCompleted.set(`${row.client_id}|${row.day_number}|${row.link_type}`, row.completed_count);
  }

  const todayStr = moment().format('YYYY-MM-DD');

  // Every past-dated row (task_date < today), for every client regardless of
  // current status — snapshotted verbatim before the wipe below and restored
  // unchanged afterward. This is the single source of truth for "what
  // already happened", and the second pass further down never recomputes a
  // past-dated occurrence for a client who already has one here — only
  // TODAY-and-future occurrences ever get freshly generated. Two real bugs
  // this fixes at the root instead of chasing each symptom:
  //   1. A client deactivated (or put back on hold) since the last
  //      regeneration used to drop out of the active roster below with NONE
  //      of their occurrences recomputed — including their past ones. Since
  //      target is always read live, that erased their real completed
  //      history from every past day's target sum while that day's frozen
  //      completed total (daily_activity_log) still included the real work
  //      genuinely done, producing a >100% ratio for a day that used to add
  //      up correctly.
  //   2. Even an ACTIVE client's rotation slot can land on a different
  //      calendar day purely because the roster composition changed
  //      elsewhere (someone else added/removed reshuffles everyone's slot) —
  //      previously this silently relabeled already-completed real work onto
  //      a new date, and the completed-links sync would then re-credit the
  //      NEW date too (since it just tops up toward the sheet's cumulative
  //      total), so the same real work ended up double-counted across two
  //      dates. Preserving past rows unconditionally makes a regeneration
  //      structurally unable to touch a day that's already happened, for
  //      any client, active or not.
  const pastRows = await db.prepare(`
    SELECT * FROM seo_tasks WHERE campaign_id = ? AND task_date < ?
  `).all(campaignId, todayStr);
  const clientsWithPastHistory = new Set(pastRows.map(r => r.client_id));

  // Already-used target per (client, link type) from the preserved past rows
  // — subtracted below from a Normal/funnel-Month-2-3 client's monthly
  // target, so the occurrences generated fresh only cover what's genuinely
  // still remaining instead of re-allocating the FULL monthly amount across
  // just the future occurrences (which would inflate their real total
  // whenever some of it was already earned on a preserved past day). Month 1
  // doesn't need this: each week's target is an independent fixed amount
  // (FUNNEL_MONTH1_WEEK_TARGETS), not a shared monthly pool to divide.
  const usedTargetByClientLinkType = new Map();
  for (const row of pastRows) {
    const key = `${row.client_id}|${row.link_type}`;
    usedTargetByClientLinkType.set(key, (usedTargetByClientLinkType.get(key) || 0) + row.target_count);
  }

  // Clear existing tasks for this campaign
  await db.prepare('DELETE FROM seo_tasks WHERE campaign_id = ?').run(campaignId);

  const allTasks = [];

  // Monthly targets for funnel Month 2/3 clients, from the campaign's Month 2 & 3
  // Bonus Link Targets (Admin → Funnel) instead — this is their WHOLE target for
  // that month, not the normal target plus the bonus. Split exactly across their
  // occurrences below.
  const funnelMonthlyLinkTargets = {};
  for (const linkType of LINK_TYPES) {
    funnelMonthlyLinkTargets[linkType] = campaign[FUNNEL_BONUS_FIELDS[linkType]] || 0;
  }

  // Get all clients with their assigned associates
  const clientsWithAssignments = await db.prepare(`
    SELECT c.*, u.id as associate_id
    FROM clients c
    LEFT JOIN users u ON u.id = c.assigned_associate_id
    WHERE c.campaign_id = ? AND c.is_active = 1 AND (c.tunnel_status IS NULL OR c.tunnel_status != 'hold')
    ORDER BY c.sort_order
  `).all(campaignId);

  // Group clients by associate
  const clientsByAssociate = {};
  for (const client of clientsWithAssignments) {
    if (!client.associate_id) continue; // Skip unassigned clients
    
    if (!clientsByAssociate[client.associate_id]) {
      clientsByAssociate[client.associate_id] = [];
    }
    clientsByAssociate[client.associate_id].push(client);
  }

  // For each associate, create tasks with client rotation
  for (const associate of associates) {
    const assignedClients = clientsByAssociate[associate.user_id] || [];

    if (assignedClients.length === 0) continue;

    // First pass: work out exactly which days each client appears on (their
    // rotation slot recurs every 5 working days — see below), before generating
    // any rows. Needed so a funnel bonus-month client's EXACT monthly target can
    // be split across their real occurrence count, rather than approximated by
    // a shared daily rate.
    //
    // Month 1 funnel clients are excluded from this rotation entirely (filtered
    // out below) — they get their own dedicated week-bucket schedule further down,
    // which fully replaces whatever this loop would have assigned them. Including
    // them here anyway would still burn one of that day's rotation slots on a
    // client whose occurrence gets reassigned elsewhere, leaving that day short a
    // regular client for no reason — exactly the "2 clients one day, 4 the next"
    // unevenness this excludes them to avoid.
    const rotationClients = assignedClients.filter(c => !isMonth1FunnelClient(c));

    // Split into 5 rotation slots (one per working day of the week) as evenly as
    // possible — front-loaded remainder, e.g. 18 clients -> 4/4/4/3/3 — rather
    // than always filling each slot to a fixed size (e.g. the campaign's
    // clients_per_day setting) and dumping whatever doesn't divide evenly into
    // the last slot (e.g. 4/4/4/4/2 for the same 18 clients), which is what
    // made some days come up noticeably short on both client count and target.
    const rotationSlotCount = 5;
    const slotBase = Math.floor(rotationClients.length / rotationSlotCount);
    const slotRemainder = rotationClients.length % rotationSlotCount;
    const rotationSlots = [];
    let slotCursor = 0;
    for (let s = 0; s < rotationSlotCount; s++) {
      const size = slotBase + (s < slotRemainder ? 1 : 0);
      rotationSlots.push(rotationClients.slice(slotCursor, slotCursor + size));
      slotCursor += size;
    }

    // Position within its own day-group — the clients sharing a day-group are
    // consecutive in rotationClients, so this gives each of them a distinct
    // stagger offset (see staggeredSplit above) instead of all sharing 0.
    const staggerIndexByClientId = new Map();
    rotationSlots.forEach(slot => slot.forEach((c, idx) => staggerIndexByClientId.set(c.id, idx)));

    const clientOccurrenceDays = new Map();
    for (const { dayNumber: currentWorkday, dateStr: taskDateStr } of workingDays) {
      // Which rotation slot works on this day — wraps every 5 working days (e.g.
      // days 1,6,11 -> slot 0, days 2,7,12 -> slot 1, and so on).
      const dayInWeek = ((currentWorkday - 1) % 5); // 0-4 for which rotation
      const dayClientsToProcess = rotationSlots[dayInWeek];

      for (const client of dayClientsToProcess) {
        if (!clientOccurrenceDays.has(client.id)) clientOccurrenceDays.set(client.id, []);
        clientOccurrenceDays.get(client.id).push({ dayNumber: currentWorkday, dateStr: taskDateStr });
      }
    }

    // Month 1 funnel clients get a DEDICATED per-week occurrence schedule, computed
    // separately from the general rotation above — that rotation recurs every 5
    // working days across the whole campaign, which doesn't reliably guarantee an
    // occurrence inside each of the 3 distinct week-ranges (e.g. when totalDays is an
    // exact multiple of 5, one rotation slot's natural 3rd occurrence lands exactly
    // on the campaign's last working day, colliding with the day reserved for week 4
    // and leaving that client with no week-3 occurrence at all). Instead: the single
    // LAST working day is always week 4 for every Month 1 client; the remaining
    // working days split into 3 roughly-equal chronological chunks for weeks 1-3, and
    // each Month 1 client is assigned one day from each chunk (spread by their
    // position among the associate's Month 1 clients) — guaranteed coverage
    // regardless of client count or how totalDays divides.
    const month1ClientsForAssociate = assignedClients.filter(isMonth1FunnelClient);
    if (month1ClientsForAssociate.length > 0 && workingDays.length > 0) {
      const sortedWorkingDays = [...workingDays].sort((a, b) => a.dayNumber - b.dayNumber);
      const week4WorkingDay = sortedWorkingDays[sortedWorkingDays.length - 1];
      const remainingWorkingDays = sortedWorkingDays.slice(0, -1);

      const bucketCount = 3;
      const baseSize = Math.floor(remainingWorkingDays.length / bucketCount);
      const remainder = remainingWorkingDays.length % bucketCount;
      const weekBuckets = [];
      let cursor = 0;
      for (let w = 0; w < bucketCount; w++) {
        const size = baseSize + (w < remainder ? 1 : 0);
        weekBuckets.push(remainingWorkingDays.slice(cursor, cursor + size));
        cursor += size;
      }

      month1ClientsForAssociate.forEach((client, clientIdx) => {
        staggerIndexByClientId.set(client.id, clientIdx);
        const occurrences = [];
        weekBuckets.forEach((bucket, weekIdx) => {
          if (bucket.length === 0) return;
          const day = bucket[clientIdx % bucket.length];
          occurrences.push({ dayNumber: day.dayNumber, dateStr: day.dateStr, week: weekIdx + 1 });
        });
        if (week4WorkingDay) {
          occurrences.push({ dayNumber: week4WorkingDay.dayNumber, dateStr: week4WorkingDay.dateStr, week: 4 });
        }
        clientOccurrenceDays.set(client.id, occurrences);
      });
    }

    // Two different treatments for a past-dated occurrence, depending on
    // whether this client has any real history at all (clientsWithPastHistory,
    // built from pastRows above):
    //
    // - A client with NO past history (brand new to this campaign's rotation
    //   — just enrolled in the Funnel, or freshly assigned) has never
    //   genuinely been due on any past day, so a past-dated occurrence here
    //   gets CLAMPED forward to the nearest today-or-later working day
    //   instead of dropped — guarantees their full target is always
    //   delivered somewhere current/future, never silently lost (tried
    //   dropping first; it left a brand-new Month 1 enrollment — which only
    //   has ONE eligible occurrence, week 1 — with zero tasks anywhere).
    // - A client WHO ALREADY has past history simply has any past-dated
    //   occurrence DROPPED here (not clamped) — that day's real record
    //   already lives in pastRows and gets restored verbatim below, so
    //   generating a second, freshly-computed version of it here would
    //   either duplicate it or (worse) relabel it onto today's date.
    //
    // Both paths dedupe by (dayNumber, week) afterward — Month 1 occurrences
    // carry a `week` field that must stay distinct even if two different
    // weeks clamp onto the same day; regular/M2/M3 occurrences have no
    // `week` field, so plain dayNumber dedup applies to them.
    const sortedWorkingDaysForClamp = [...workingDays].sort((a, b) => a.dayNumber - b.dayNumber);
    const firstFutureWorkingDay = sortedWorkingDaysForClamp.find(d => d.dateStr >= todayStr)
      || sortedWorkingDaysForClamp[sortedWorkingDaysForClamp.length - 1];

    for (const client of assignedClients) {
      const occurrences = clientOccurrenceDays.get(client.id);
      if (!occurrences) continue;

      const hasHistory = clientsWithPastHistory.has(client.id);

      const adjusted = hasHistory
        ? occurrences.filter(o => o.dateStr >= todayStr)
        : (firstFutureWorkingDay
          ? occurrences.map(o => o.dateStr < todayStr
            ? { ...o, dayNumber: firstFutureWorkingDay.dayNumber, dateStr: firstFutureWorkingDay.dateStr }
            : o)
          : occurrences);

      const seen = new Set();
      const deduped = adjusted.filter(o => {
        const key = `${o.dayNumber}|${o.week ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      clientOccurrenceDays.set(client.id, deduped);
    }

    // Second pass: generate each client's rows across their own occurrence days.
    for (const client of assignedClients) {
      const occurrences = clientOccurrenceDays.get(client.id);
      if (!occurrences || occurrences.length === 0) continue;

      if (isMonth1FunnelClient(client)) {
        const occurrencesByWeek = new Map();
        for (const occurrence of occurrences) {
          if (!occurrencesByWeek.has(occurrence.week)) occurrencesByWeek.set(occurrence.week, []);
          occurrencesByWeek.get(occurrence.week).push(occurrence);
        }

        // Manual week-by-week control (see advanceMonth1Week in src/lib/funnel.js):
        // only weeks from this client's start week through their current week
        // (inclusive) ever get task rows — weeks before start never existed for
        // this client, weeks after current haven't been reached yet. Both default
        // to week 1 for a normal enrollment (all 4 weeks still generate as before
        // once current_week is advanced up to 4).
        const month1StartWeek = client.funnel_month1_start_week || 1;
        const month1CurrentWeek = client.funnel_month1_current_week || month1StartWeek;
        const staggerIdx = staggerIndexByClientId.get(client.id) || 0;

        for (const [week, weekOccurrences] of occurrencesByWeek.entries()) {
          if (week < month1StartWeek || week > month1CurrentWeek) continue;
          const weekTargets = FUNNEL_MONTH1_WEEK_TARGETS[week] || {};

          for (const linkType of LINK_TYPES) {
            const weekTarget = weekTargets[linkType] || 0;
            if (weekTarget <= 0) continue;

            const sizes = staggeredSplit(weekTarget, weekOccurrences.length, staggerIdx % weekOccurrences.length);

            weekOccurrences.forEach(({ dayNumber, dateStr }, i) => {
              const chunkSize = sizes[i];
              if (chunkSize <= 0) return;

              const priorKey = `${client.id}|${dayNumber}|${linkType}`;
              allTasks.push({
                campaign_id: campaignId,
                associate_id: associate.user_id,
                client_id: client.id,
                day_number: dayNumber,
                task_date: dateStr,
                link_type: linkType,
                target_count: chunkSize,
                completed_count: Math.min(priorCompleted.get(priorKey) || 0, chunkSize)
              });
            });
          }
        }
      } else if (isFunnelBonusMonthClient(client)) {
        // Exact distribution: split each link type's WHOLE monthly bonus target
        // across this client's occurrences, front-loaded remainder (same
        // convention used elsewhere in the app for exact monthly splits), so the
        // full defined number is always delivered by month's end instead of an
        // approximated daily rate. A client with past history only has FUTURE
        // occurrences left in the list at this point (see the filter above) —
        // subtract what pastRows already accounts for so this only splits the
        // genuinely remaining target across them, not the full monthly amount
        // again (that history's own target already exists, restored verbatim).
        const staggerIdx = staggerIndexByClientId.get(client.id) || 0;
        const hasHistory = clientsWithPastHistory.has(client.id);
        for (const linkType of LINK_TYPES) {
          const fullMonthlyTarget = funnelMonthlyLinkTargets[linkType];
          if (fullMonthlyTarget <= 0) continue;
          const usedKey = `${client.id}|${linkType}`;
          const monthlyTarget = hasHistory
            ? Math.max(0, fullMonthlyTarget - (usedTargetByClientLinkType.get(usedKey) || 0))
            : fullMonthlyTarget;
          if (monthlyTarget <= 0) continue;

          const sizes = staggeredSplit(monthlyTarget, occurrences.length, staggerIdx % occurrences.length);

          occurrences.forEach(({ dayNumber, dateStr }, i) => {
            const chunkSize = sizes[i];
            if (chunkSize <= 0) return;

            const priorKey = `${client.id}|${dayNumber}|${linkType}`;
            allTasks.push({
              campaign_id: campaignId,
              associate_id: associate.user_id,
              client_id: client.id,
              day_number: dayNumber,
              task_date: dateStr,
              link_type: linkType,
              target_count: chunkSize,
              completed_count: Math.min(priorCompleted.get(priorKey) || 0, chunkSize)
            });
          });
        }
      } else {
        // Normal clients: exact distribution, same as funnel Month 2/3 clients
        // above — split each link type's WHOLE monthly target across this
        // client's own occurrence count, front-loaded remainder, so the full
        // defined number is always delivered by month's end regardless of how
        // many times campaign.total_days actually lets their rotation slot
        // recur (previously approximated via a shared daily rate derived from
        // a hardcoded 16-day/3.2-occurrence assumption, which silently
        // shorted every client whenever a campaign didn't run exactly 16 days).
        // Same remaining-target treatment as the funnel M2/M3 branch above for
        // a client with past history — only the genuinely-remaining amount
        // gets split across their future-only occurrence list.
        const staggerIdx = staggerIndexByClientId.get(client.id) || 0;
        const hasHistory = clientsWithPastHistory.has(client.id);
        for (const linkType of LINK_TYPES) {
          const fullMonthlyTarget = monthlyLinkTargets[linkType];
          if (fullMonthlyTarget <= 0) continue;
          const usedKey = `${client.id}|${linkType}`;
          const monthlyTarget = hasHistory
            ? Math.max(0, fullMonthlyTarget - (usedTargetByClientLinkType.get(usedKey) || 0))
            : fullMonthlyTarget;
          if (monthlyTarget <= 0) continue;

          const sizes = staggeredSplit(monthlyTarget, occurrences.length, staggerIdx % occurrences.length);

          occurrences.forEach(({ dayNumber, dateStr }, i) => {
            const chunkSize = sizes[i];
            if (chunkSize <= 0) return;

            const priorKey = `${client.id}|${dayNumber}|${linkType}`;
            allTasks.push({
              campaign_id: campaignId,
              associate_id: associate.user_id,
              client_id: client.id,
              day_number: dayNumber,
              task_date: dateStr,
              link_type: linkType,
              target_count: chunkSize,
              completed_count: Math.min(priorCompleted.get(priorKey) || 0, chunkSize)
            });
          });
        }
      }
    }
  }

  // Insert all tasks atomically
  if (allTasks.length > 0) {
    const insertSql = `
      INSERT INTO seo_tasks (campaign_id, associate_id, client_id, day_number, task_date, link_type, target_count, completed_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await db.batch(allTasks.map(t => ({
      sql: insertSql,
      args: [t.campaign_id, t.associate_id, t.client_id, t.day_number, t.task_date, t.link_type, t.target_count, t.completed_count],
    })));
  }

  // Restore every client's past rows exactly as they were — see the
  // snapshot/comment above. Verbatim re-insert, not re-derived, so real
  // historical target/completed stays exactly what it always was for every
  // client, not just ones excluded from this regeneration's active roster.
  if (pastRows.length > 0) {
    const restoreSql = `
      INSERT INTO seo_tasks (campaign_id, associate_id, client_id, day_number, task_date, link_type, target_count, completed_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await db.batch(pastRows.map(r => ({
      sql: restoreSql,
      args: [r.campaign_id, r.associate_id, r.client_id, r.day_number, r.task_date, r.link_type, r.target_count, r.completed_count],
    })));
  }

  return allTasks.length + pastRows.length;
}

// Get today's SEO tasks for an associate
export async function getAssociateTodayTasks(associateId, campaignId, date) {
  const db = await getDb();
  const taskDate = date || moment().format('YYYY-MM-DD');

  return db.prepare(`
    SELECT st.*, c.name as client_name, c.website as client_website,
           u.name as associate_name
    FROM seo_tasks st
    JOIN clients c ON c.id = st.client_id
    JOIN users u ON u.id = st.associate_id
    WHERE st.associate_id = ? AND st.campaign_id = ? AND st.task_date = ?
    ORDER BY c.sort_order, st.link_type
  `).all(associateId, campaignId, taskDate);
}
