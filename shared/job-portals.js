// Public portal metadata only. No account credentials or browser sessions belong here.
export const JOB_PORTALS = [
  {
    id: 'linkedin',
    name: 'LinkedIn',
    url: 'https://www.linkedin.com/jobs/search/',
    mode: 'public',
    note: 'Reads public search cards. Sign in on LinkedIn for account-only results and applications.',
  },
  {
    id: 'indeed',
    name: 'Indeed',
    url: 'https://www.indeed.com/jobs',
    mode: 'public',
    note: 'Attempts public results; if access is blocked, use the browser search and import a listing.',
  },
  {
    id: 'handshake',
    name: 'Handshake',
    url: 'https://joinhandshake.com/find-jobs/',
    mode: 'browser',
    note: 'Search and apply in your Handshake account, then import a chosen listing for local review and tracking.',
  },
  {
    id: 'ziprecruiter',
    name: 'ZipRecruiter',
    url: 'https://www.ziprecruiter.com/jobs-search',
    mode: 'public',
    note: 'Attempts public results. Account and challenge screens need your browser.',
  },
  {
    id: 'google-jobs',
    name: 'Google Jobs',
    url: 'https://www.google.com/search',
    mode: 'browser',
    note: 'Opens a jobs search. Import the employer’s original listing; Google search pages are not applications.',
  },
  {
    id: 'wonderin',
    name: 'Wonderin.ai',
    url: 'https://wonderin.ai/',
    mode: 'browser',
    note: 'A separate job application service. Open your account there; Butler does not share your résumé, credentials, or subscription with it.',
  },
  {
    id: 'instahyre',
    name: 'Instahyre',
    url: 'https://www.instahyre.com/search-jobs/',
    mode: 'browser',
    note: 'Use your account’s matching opportunities, then import a chosen listing into Butler.',
  },
  {
    id: 'foundit',
    name: 'Foundit',
    url: 'https://www.foundit.in/',
    mode: 'public',
    note: 'Searches the India portal. Blocked or signed-in results can be imported manually.',
  },
  {
    id: 'atlassian',
    name: 'Atlassian',
    url: 'https://www.atlassian.com/company/careers/all-jobs',
    mode: 'feed',
    note: 'Reads Atlassian’s public careers feed. Applications are completed on Atlassian’s hiring site.',
  },
  {
    id: 'protocoljobs',
    name: 'Protocoljobs',
    url: null,
    mode: 'unverified',
    note: 'Website address needed before this portal can be connected.',
  },
];
export const PORTAL_IDS = JOB_PORTALS.map((p) => p.id);
export function portalSearch(id, role, location, modes = [], customURL = '') {
  const portal = JOB_PORTALS.find((p) => p.id === id);
  const destination = id === 'protocoljobs' ? customURL : portal?.url;
  if (!destination) return null;
  const u = new URL(destination);
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  const remote = modes.length === 1 && modes[0] === 'remote';
  const query = [role, 'jobs', location, remote ? 'remote' : ''].filter(Boolean).join(' ');
  if (id === 'linkedin') {
    u.searchParams.set('keywords', role);
    if (location) u.searchParams.set('location', location);
    if (modes.length && modes.length < 3)
      u.searchParams.set(
        'f_WT',
        modes.map((m) => ({ office: '1', remote: '2', hybrid: '3' })[m]).join(','),
      );
  } else if (id === 'indeed') {
    u.searchParams.set('q', role + (remote ? ' remote' : ''));
    if (location) u.searchParams.set('l', location);
  } else if (id === 'ziprecruiter') {
    u.searchParams.set('search', role + (remote ? ' remote' : ''));
    if (location) u.searchParams.set('location', location);
  } else if (id === 'google-jobs') u.searchParams.set('q', query);
  else if (id === 'foundit') {
    const slug = (s) => encodeURIComponent(s.trim().toLowerCase().replace(/\s+/g, '-'));
    u.pathname = `/search/${slug(role + (remote ? ' remote' : ''))}-jobs${location ? '-in-' + slug(location) : ''}`;
  }
  return {
    url: u.href,
    query,
    role,
    location,
    filtersInLink: ['linkedin', 'indeed', 'ziprecruiter', 'google-jobs', 'foundit'].includes(id),
  };
}
export function portalPlans(prefs) {
  return JOB_PORTALS.filter((p) => (prefs.portals || []).includes(p.id)).map((original) => {
    const p =
      original.id === 'protocoljobs' && prefs.protocoljobsUrl
        ? {
            ...original,
            url: prefs.protocoljobsUrl,
            mode: 'browser',
            note: 'User-configured website. Search there and import a chosen listing; no account or résumé data is sent automatically.',
          }
        : original;
    const searches = (prefs.roles.length ? prefs.roles : [''])
      .flatMap((role) =>
        (prefs.locations.length ? prefs.locations : ['']).map((location) =>
          portalSearch(p.id, role, location, prefs.modes, prefs.protocoljobsUrl),
        ),
      )
      .filter(Boolean);
    return {
      ...p,
      searches,
      automaticSearchLimit: p.mode === 'public' ? 4 : p.mode === 'feed' ? 1 : 0,
    };
  });
}
