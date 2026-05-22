import type { PublicApplication } from '@/api/types';

type TFn = (key: string, opts?: Record<string, unknown>) => string;

export interface HireStartInfo {
  label: string;
  relative: string;
}

export function getHireStartInfo(
  application: PublicApplication,
  locale: string,
  t: TFn,
): HireStartInfo | null {
  const interview = application.interview;
  if (interview?.status === 'scheduled') {
    const scheduledAt = new Date(interview.scheduledFor);
    if (Number.isFinite(scheduledAt.getTime())) {
      return {
        label: t('hire_share.starts_label'),
        relative: formatRelativeStart(scheduledAt, locale, t),
      };
    }
  }

  const schedule = application.job?.schedule;
  if (!schedule?.startTime) return null;

  const nextStart = resolveNextScheduledStart(schedule.days ?? null, schedule.startTime);
  if (!nextStart) {
    return {
      label: t('hire_share.starts_label'),
      relative: t('hire_share.starts_time_only', {
        time: formatTimeFromClock(schedule.startTime, locale),
      }),
    };
  }

  return {
    label: t('hire_share.starts_label'),
    relative: formatRelativeStart(nextStart, locale, t),
  };
}

function resolveNextScheduledStart(days: number[] | null, time: string): Date | null {
  const [hourStr, minuteStr = '00'] = time.split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  const now = new Date();
  if (!days || days.length === 0) {
    const candidate = new Date(now);
    candidate.setHours(hour, minute, 0, 0);
    return candidate;
  }

  for (let offset = 0; offset < 7; offset += 1) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    candidate.setHours(hour, minute, 0, 0);
    if (!days.includes(candidate.getDay())) continue;
    if (offset === 0 && candidate.getTime() < now.getTime()) continue;
    return candidate;
  }

  return null;
}

function formatRelativeStart(date: Date, locale: string, t: TFn): string {
  const time = formatDateTime(date, locale, { hour: 'numeric', minute: '2-digit' });
  if (isToday(date)) {
    return t('hire_share.starts_today_at', { time });
  }
  if (isTomorrow(date)) {
    return t('hire_share.starts_tomorrow_at', { time });
  }
  const day = formatDateTime(date, locale, { weekday: 'short' });
  return t('hire_share.starts_on_at', { day, time });
}

function formatTimeFromClock(time: string, locale: string): string {
  const [hourStr, minuteStr = '00'] = time.split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time;
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return formatDateTime(date, locale, { hour: 'numeric', minute: '2-digit' });
}

function formatDateTime(date: Date, locale: string, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function isTomorrow(date: Date): boolean {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return (
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate()
  );
}
