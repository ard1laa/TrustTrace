// Email-domain rules for recruiter and university staff sign-up. Shared by the
// API (authoritative) and the web app (instant feedback while typing).

// Personal mailbox providers: staff using one must upload an ID instead.
export const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.com.my', 'ymail.com', 'rocketmail.com', 'hotmail.com', 'hotmail.my',
  'outlook.com', 'outlook.my', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me',
  'protonmail.com', 'pm.me', 'gmx.com', 'gmx.net', 'mail.com', 'zoho.com', 'yandex.com', 'yandex.ru', 'qq.com',
  '163.com', '126.com', 'tutanota.com', 'fastmail.com', 'hey.com', 'duck.com', 'inbox.com', 'mail.ru', 'naver.com'
]);

// Throwaway inboxes are never accepted, even with a document.
export const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'yopmail.com',
  'trashmail.com', 'sharklasers.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'throwawaymail.com'
]);

export const ACADEMIC_DOMAIN = /(\.edu(\.[a-z]{2})?|\.ac\.[a-z]{2}|\.edu\.my|\.university)$/i;

export function emailDomain(email) {
  return String(email || '').trim().toLowerCase().split('@')[1] || '';
}

// kind: invalid | disposable | personal | non-academic | academic | corporate
export function classifyEmail(email, role, extraAcademicDomains = []) {
  const domain = emailDomain(email);
  if (!domain || !domain.includes('.')) return { domain, kind: 'invalid', institutional: false };
  if (DISPOSABLE_DOMAINS.has(domain)) return { domain, kind: 'disposable', institutional: false };
  if (FREE_EMAIL_DOMAINS.has(domain)) return { domain, kind: 'personal', institutional: false };
  if (role === 'admin' && !ACADEMIC_DOMAIN.test(domain) && !extraAcademicDomains.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return { domain, kind: 'non-academic', institutional: false };
  }
  return { domain, kind: role === 'admin' ? 'academic' : 'corporate', institutional: true };
}
