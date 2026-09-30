// Butler's people: departments, role placement, diverse brick-figure looks,
// personalities and thought bubbles. Pure data + deterministic functions so the
// server catalog and the browser office always agree without a database.

export const DEPARTMENTS = [
  {
    id: 'research',
    name: 'Strategy & Research',
    short: 'Strategy',
    color: '#5E5CE6',
    head: 'research-planner',
    blurb: 'Market research, competitors, pricing, finance and business planning.',
  },
  {
    id: 'marketing',
    name: 'Marketing & Growth',
    short: 'Marketing',
    color: '#FF9F0A',
    head: 'brand-strategist',
    blurb: 'Positioning, campaigns, SEO, email, ads, launches and growth experiments.',
  },
  {
    id: 'creative',
    name: 'Content & Creative',
    short: 'Creative',
    color: '#BF5AF2',
    head: 'campaign-creative',
    blurb: 'Social posts, articles, scripts, newsletters, brand voice and visual direction.',
  },
  {
    id: 'analytics',
    name: 'Data & Insights',
    short: 'Data',
    color: '#30D158',
    head: 'performance-analyst',
    blurb: 'KPIs, dashboards, experiments, SQL, cohorts and measurement plans.',
  },
  {
    id: 'engineering',
    name: 'Engineering',
    short: 'Engineering',
    color: '#0A84FF',
    head: 'technology-advisor',
    blurb: 'Architecture, code review, security, testing, APIs and technical docs.',
  },
  {
    id: 'operations',
    name: 'Operations',
    short: 'Operations',
    color: '#E0A800',
    head: 'employee-okr-coach',
    blurb: 'OKRs, SOPs, meetings, customer support, status reports and planning.',
  },
  {
    id: 'compliance',
    name: 'Legal & Trust',
    short: 'Legal',
    color: '#FF453A',
    head: 'evidence-reviewer',
    blurb: 'Claim checks, contracts, privacy, policies, trademarks and tax helpers.',
  },
  {
    id: 'personal',
    name: 'People & Growth',
    short: 'People',
    color: '#FF375F',
    head: 'employee-learning-coach',
    blurb: 'Hiring, learning, careers, coaching and the founder’s personal office.',
  },
];

// Skill categories each department owns. The department head knows every skill
// in these categories, so all built-in skills always have an expert owner.
export const CATEGORY_DEPARTMENT = {
  'AI & Technology': 'engineering',
  'Ads & Paid Media': 'marketing',
  'Analytics & Data': 'analytics',
  'Branding & Design': 'creative',
  'Client & Consulting': 'research',
  'Content & Copywriting': 'creative',
  'Courses & Education': 'personal',
  'E-commerce & Products': 'marketing',
  'Email Marketing & Automation': 'marketing',
  'Events & Speaking': 'marketing',
  'Finance & Pricing': 'research',
  'HR & Team': 'personal',
  'Industry-Specific': 'operations',
  'Launch & Growth': 'operations',
  'Legal & Compliance': 'compliance',
  'Nonprofit & Community': 'marketing',
  'Operations & Systems': 'operations',
  'SEO & Search': 'marketing',
  'Sales & Funnels': 'research',
  'Social Media': 'marketing',
};

const C = {
  ai: 'AI & Technology',
  ads: 'Ads & Paid Media',
  data: 'Analytics & Data',
  brand: 'Branding & Design',
  client: 'Client & Consulting',
  content: 'Content & Copywriting',
  edu: 'Courses & Education',
  ecom: 'E-commerce & Products',
  email: 'Email Marketing & Automation',
  events: 'Events & Speaking',
  finance: 'Finance & Pricing',
  hr: 'HR & Team',
  industry: 'Industry-Specific',
  growth: 'Launch & Growth',
  legal: 'Legal & Compliance',
  nonprofit: 'Nonprofit & Community',
  ops: 'Operations & Systems',
  seo: 'SEO & Search',
  sales: 'Sales & Funnels',
  social: 'Social Media',
};

// Every employee: department, the skill categories their specialty draws on,
// and optional title / preferred skills. Keys are worker ids.
const R = (dept, focus, extra = {}) => ({ dept, focus, ...extra });
export const ROLES = {
  // Core crew
  researcher: R('research', [C.sales, C.data], {
    title: 'AI News Researcher',
    prefer: ['market-research', 'competitor-analysis', 'benchmarking-report', 'user-research-plan'],
  }),
  manager: R('creative', [C.social, C.content], {
    title: 'Social Media Manager',
    prefer: ['linkedin-article', 'twitter-thread', 'content-repurpose', 'social-media-calendar'],
  }),
  'brand-strategist': R('marketing', [], { title: 'Head of Marketing', head: true }),
  'campaign-creative': R('creative', [], { title: 'Creative Director', head: true }),
  'evidence-reviewer': R('compliance', [], { title: 'Head of Legal & Trust', head: true }),
  'research-planner': R('research', [], { title: 'Head of Strategy & Research', head: true }),
  'performance-analyst': R('analytics', [], { title: 'Head of Data', head: true }),
  'technology-advisor': R('engineering', [], { title: 'CTO · Head of Engineering', head: true }),
  'job-hunter': R('personal', [C.hr], {
    title: 'Career Agent',
    prefer: ['executive-resume', 'professional-bio', 'linkedin-profile-optimizer'],
  }),
  // Strategy & Research
  'employee-board-deck-builder': R('research', [C.finance, C.sales], {
    prefer: ['investor-update', 'pitch-deck', 'quarterly-review'],
  }),
  'employee-business-plan-builder': R('research', [C.sales, C.finance]),
  'employee-competitor-analyst': R('research', [C.sales, C.seo], {
    prefer: ['competitor-analysis', 'seo-competitor-analysis', 'sales-battlecard', 'swot-analysis'],
  }),
  'employee-customer-research-interviewer': R('research', [C.sales, C.growth, C.data], {
    prefer: ['customer-persona', 'user-research-plan', 'voice-of-customer', 'survey-analysis'],
  }),
  'employee-fundraising-pitch-coach': R('research', [C.finance, C.sales], {
    prefer: ['pitch-deck', 'investor-update', 'fundraising-tracker', 'financial-projection'],
  }),
  'employee-market-sizing-analyst': R('research', [C.sales, C.finance], {
    prefer: ['market-sizing', 'market-research', 'revenue-model'],
  }),
  'employee-one-pager-builder': R('research', [C.sales, C.content]),
  'employee-partnership-deal-structurer': R('research', [C.sales, C.legal, C.client], {
    prefer: ['partnership-proposal', 'joint-venture-proposal', 'partnership-agreement'],
  }),
  'employee-pricing-strategist': R('research', [C.finance, C.sales], {
    prefer: ['pricing-strategy', 'pricing-analysis', 'pricing-page-copy', 'discount-strategy'],
  }),
  'employee-unit-economics-analyst': R('research', [C.finance, C.data], {
    prefer: ['unit-economics', 'customer-lifetime-value', 'breakeven-analysis'],
  }),
  // Content & Creative
  'employee-blog-post-writer': R('creative', [C.content, C.seo]),
  'employee-case-study-writer': R('creative', [C.content, C.sales]),
  'employee-email-copywriter': R('creative', [C.email, C.content]),
  'employee-landing-page-copywriter': R('creative', [C.content, C.seo, C.ads]),
  'employee-linkedin-post-writer': R('creative', [C.social, C.content], {
    prefer: ['linkedin-article', 'linkedin-strategy', 'hook-generator', 'thought-leadership'],
  }),
  'employee-newsletter-writer': R('creative', [C.email, C.content]),
  'employee-podcast-show-notes-writer': R('creative', [C.content, C.social]),
  'employee-press-release-writer': R('creative', [C.content, C.social], {
    prefer: ['press-release', 'press-kit', 'pr-pitch', 'media-kit'],
  }),
  'employee-tweet-thread-writer': R('creative', [C.social, C.content], {
    prefer: ['twitter-thread', 'thread-hook-writer', 'hook-generator'],
  }),
  'employee-video-script-writer': R('creative', [C.content, C.social, C.ads]),
  'employee-youtube-script-writer': R('creative', [C.social, C.content, C.seo]),
  'employee-hindi-english-content-writer': R('creative', [C.content, C.social]),
  'employee-instagram-reels-script-writer': R('creative', [C.social, C.content], {
    prefer: ['short-form-video-plan', 'instagram-carousel', 'hook-generator', 'caption-writer'],
  }),
  'employee-brand-voice-coach': R('creative', [C.brand, C.content]),
  // Marketing & Growth
  'employee-gtm-strategist': R('marketing', [C.growth, C.events, C.sales], {
    prefer: ['product-launch-plan', 'launch-checklist', 'customer-journey-map'],
  }),
  'employee-ad-copywriter': R('marketing', [C.ads, C.content]),
  'employee-cold-outreach-writer': R('marketing', [C.email, C.sales]),
  'employee-content-calendar-planner': R('marketing', [C.content, C.social]),
  'employee-funnel-architect': R('marketing', [C.sales, C.email, C.ads]),
  'employee-growth-hacker': R('marketing', [C.growth, C.email, C.social]),
  'employee-influencer-pitch-writer': R('marketing', [C.social]),
  'employee-lifecycle-marketing-strategist': R('marketing', [C.email, C.growth]),
  'employee-paid-campaign-optimizer': R('marketing', [C.ads, C.data]),
  'employee-retention-strategist': R('marketing', [C.growth, C.email]),
  'employee-seo-strategist': R('marketing', [C.seo, C.content]),
  'employee-whatsapp-marketing-writer': R('marketing', [C.email, C.social]),
  'employee-zomato-swiggy-listing-optimizer': R('marketing', [C.ecom, C.seo, C.industry]),
  // Data & Insights
  'employee-ab-test-analyzer': R('analytics', [C.data]),
  'employee-analytics-narrator': R('analytics', [C.data]),
  'employee-cohort-analyst': R('analytics', [C.data, C.growth]),
  'employee-csv-investigator': R('analytics', [C.data]),
  'employee-dashboard-designer': R('analytics', [C.data, C.finance]),
  'employee-data-cleaner': R('analytics', [C.data]),
  'employee-data-vis-designer': R('analytics', [C.data]),
  'employee-etl-pipeline-builder': R('analytics', [C.data, C.ai]),
  'employee-metric-definer': R('analytics', [C.data]),
  'employee-spreadsheet-formula-builder': R('analytics', [C.data, C.finance]),
  'employee-sql-expert': R('analytics', [C.data]),
  'employee-sql-query-optimizer': R('analytics', [C.data]),
  'employee-kpi-dashboard-builder': R('analytics', [C.data, C.ops]),
  // Engineering
  'employee-api-designer': R('engineering', [C.ai, C.industry], { prefer: ['api-documentation'] }),
  'employee-bug-hunter': R('engineering', [C.ai, C.ops]),
  'employee-ci-cd-architect': R('engineering', [C.ai, C.ops], {
    prefer: ['process-automation-audit', 'workflow-mapper'],
  }),
  'employee-code-reviewer': R('engineering', [C.ai, C.ops], {
    prefer: ['quality-assurance-checklist'],
  }),
  'employee-database-schema-designer': R('engineering', [C.ai, C.data]),
  'employee-dependency-upgrader': R('engineering', [C.ai, C.industry]),
  'employee-git-rebase-coach': R('engineering', [C.ai]),
  'employee-legacy-code-explainer': R('engineering', [C.ai, C.ops]),
  'employee-observability-engineer': R('engineering', [C.ai, C.ops], {
    prefer: ['report-automation', 'escalation-procedure'],
  }),
  'employee-performance-profiler': R('engineering', [C.ai]),
  'employee-refactor-specialist': R('engineering', [C.ai]),
  'employee-security-auditor': R('engineering', [C.ai, C.legal], {
    prefer: ['gdpr-compliance-checklist', 'risk-assessment', 'data-processing-agreement'],
  }),
  'employee-tech-debt-prioritizer': R('engineering', [C.ai, C.ops], {
    prefer: ['task-prioritization', 'decision-matrix'],
  }),
  'employee-test-writer': R('engineering', [C.ai, C.ops]),
  'employee-typescript-migrator': R('engineering', [C.ai, C.industry]),
  'employee-technical-docs-writer': R('engineering', [C.industry, C.content, C.ai], {
    prefer: ['api-documentation', 'help-center-article', 'release-notes', 'tutorial-writer'],
  }),
  // Operations
  'employee-okr-coach': R('operations', [], { title: 'Head of Operations', head: true }),
  'employee-calendar-optimizer': R('operations', [C.ops]),
  'employee-decision-journal': R('operations', [C.ops]),
  'employee-delegation-coach': R('operations', [C.ops, C.hr]),
  'employee-focus-coach': R('operations', [C.ops]),
  'employee-inbox-triage': R('operations', [C.ops, C.email]),
  'employee-meeting-summarizer': R('operations', [C.ops]),
  'employee-note-organizer': R('operations', [C.ops]),
  'employee-one-on-one-prepper': R('operations', [C.ops, C.hr]),
  'employee-project-status-reporter': R('operations', [C.ops]),
  'employee-retrospective-facilitator': R('operations', [C.ops]),
  'employee-weekly-review-coach': R('operations', [C.ops]),
  'employee-customer-support-responder': R('operations', [C.growth, C.ops], {
    prefer: ['support-response-templates', 'customer-support-kb', 'complaint-resolution'],
  }),
  // Legal & Trust
  'employee-cease-and-desist-drafter': R('compliance', [C.legal]),
  'employee-data-protection-checker': R('compliance', [C.legal]),
  'employee-employment-contract-reviewer': R('compliance', [C.legal, C.hr]),
  'employee-licensing-agreement-reviewer': R('compliance', [C.legal]),
  'employee-nda-reviewer': R('compliance', [C.legal]),
  'employee-privacy-policy-drafter': R('compliance', [C.legal]),
  'employee-tos-drafter': R('compliance', [C.legal]),
  'employee-trademark-research': R('compliance', [C.legal, C.brand]),
  'employee-vendor-contract-reviewer': R('compliance', [C.legal, C.ops]),
  'employee-gst-india-helper': R('compliance', [C.finance, C.legal]),
  'employee-india-tax-filing-helper': R('compliance', [C.finance]),
  // People & Growth
  'employee-learning-coach': R('personal', [], { title: 'Head of People & Learning', head: true }),
  'employee-hiring-jd-writer': R('personal', [C.hr]),
  'employee-founder-journal-coach': R('personal', [C.ops]),
  'employee-book-summarizer': R('personal', [C.edu, C.content]),
  'employee-burnout-recovery-coach': R('personal', [C.ops, C.edu]),
  'employee-financial-planner': R('personal', [C.finance]),
  'employee-fitness-planner': R('personal', [C.edu]),
  'employee-interview-prepper': R('personal', [C.hr]),
  'employee-journaling-prompter': R('personal', [C.ops]),
  'employee-negotiation-coach': R('personal', [C.sales, C.finance]),
  'employee-nutrition-coach': R('personal', [C.edu]),
  'employee-parenting-advisor': R('personal', [C.edu]),
  'employee-relationship-letter-writer': R('personal', [C.content]),
  'employee-resume-writer': R('personal', [C.hr, C.brand], {
    prefer: ['executive-resume', 'professional-bio', 'linkedin-profile-optimizer'],
  }),
  'employee-side-project-coach': R('personal', [C.growth, C.events]),
  'employee-travel-planner': R('personal', [C.events]),
};

export function roleFor(id) {
  return ROLES[id] || null;
}
export function headOf(departmentId) {
  return DEPARTMENTS.find((d) => d.id === departmentId)?.head || null;
}

// FNV-1a: stable across server and browser.
export function hash(text, salt = 0) {
  let h = 2166136261 ^ salt;
  for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h >>> 0;
}
const pick = (list, seed) => list[seed % list.length];

// Name pools from many backgrounds. Employees are assigned round-robin across
// pools so every office floor is genuinely mixed.
const NAME_POOLS = [
  {
    first: [
      'Aarav',
      'Priya',
      'Rohan',
      'Ananya',
      'Vikram',
      'Meera',
      'Arjun',
      'Kavya',
      'Ishaan',
      'Nikhil',
      'Diya',
      'Sana',
    ],
    last: [
      'Sharma',
      'Iyer',
      'Patel',
      'Reddy',
      'Nair',
      'Singh',
      'Kapoor',
      'Menon',
      'Chatterjee',
      'Desai',
      'Rao',
      'Bose',
    ],
  },
  {
    first: [
      'Hana',
      'Kenji',
      'Mei',
      'Jun',
      'Yuna',
      'Haruto',
      'Lian',
      'Minjun',
      'Sora',
      'Wei',
      'Aiko',
      'Daniel',
    ],
    last: [
      'Tanaka',
      'Chen',
      'Kim',
      'Park',
      'Watanabe',
      'Liu',
      'Nakamura',
      'Zhang',
      'Choi',
      'Wong',
      'Sato',
      'Huang',
    ],
  },
  {
    first: [
      'Linh',
      'Arif',
      'Mai',
      'Rizal',
      'Siti',
      'Kiet',
      'Mariel',
      'Dewi',
      'Paolo',
      'Nat',
      'Bea',
      'Hieu',
    ],
    last: [
      'Nguyen',
      'Santos',
      'Rahman',
      'Tan',
      'Reyes',
      'Wijaya',
      'Pham',
      'Lim',
      'Cruz',
      'Suwan',
      'Aquino',
      'Tran',
    ],
  },
  {
    first: [
      'Amara',
      'Kwame',
      'Zainab',
      'Chidi',
      'Nia',
      'Tendai',
      'Folake',
      'Kofi',
      'Wanjiru',
      'Tunde',
      'Adaeze',
      'Sipho',
    ],
    last: [
      'Okafor',
      'Mensah',
      'Adeyemi',
      'Kamau',
      'Diallo',
      'Nwosu',
      'Boateng',
      'Mwangi',
      'Abebe',
      'Osei',
      'Ndlovu',
      'Achebe',
    ],
  },
  {
    first: [
      'Jasmine',
      'Marcus',
      'Imani',
      'Darnell',
      'Aaliyah',
      'Andre',
      'Keisha',
      'Malik',
      'Simone',
      'Jalen',
      'Tiana',
      'Xavier',
    ],
    last: [
      'Washington',
      'Jackson',
      'Robinson',
      'Brooks',
      'Coleman',
      'Charles',
      'Baptiste',
      'Joseph',
      'Grant',
      'Greene',
      'Harris',
      'Pierre',
    ],
  },
  {
    first: [
      'Sofía',
      'Mateo',
      'Valentina',
      'Diego',
      'Camila',
      'Joaquín',
      'Lucía',
      'Rafael',
      'Isabela',
      'Tomás',
      'Gabriela',
      'Emilio',
    ],
    last: [
      'García',
      'Rodríguez',
      'Hernández',
      'López',
      'Morales',
      'Silva',
      'Castillo',
      'Ortiz',
      'Vargas',
      'Souza',
      'Rojas',
      'Medina',
    ],
  },
  {
    first: [
      'Layla',
      'Omar',
      'Yasmin',
      'Karim',
      'Noor',
      'Tariq',
      'Leila',
      'Samir',
      'Rania',
      'Youssef',
      'Dalia',
      'Emre',
    ],
    last: [
      'Haddad',
      'Khalil',
      'Nasser',
      'Saleh',
      'Mansour',
      'Aziz',
      'Farouk',
      'Rahimi',
      'Kaya',
      'Demir',
      'Sabbagh',
      'Amin',
    ],
  },
  {
    first: [
      'Emma',
      'Lucas',
      'Chloé',
      'Luca',
      'Clara',
      'Felix',
      'Elena',
      'Hugo',
      'Anna',
      'Leo',
      'Giulia',
      'Matteo',
    ],
    last: [
      'Müller',
      'Rossi',
      'Dubois',
      'Novak',
      'Bianchi',
      'Fischer',
      'Laurent',
      'Jansen',
      'Moreau',
      'Weber',
      'Conti',
      'Lambert',
    ],
  },
  {
    first: [
      'Freya',
      'Oliver',
      'Ingrid',
      'Liam',
      'Astrid',
      'Noah',
      'Ella',
      'Erik',
      'Maya',
      'Theo',
      'Sienna',
      'Callum',
    ],
    last: [
      'Andersson',
      'Nielsen',
      "O'Brien",
      'Walsh',
      'Campbell',
      'Hughes',
      'Larsen',
      'Berg',
      'Murphy',
      'Evans',
      'Lindqvist',
      'Byrne',
    ],
  },
  {
    first: [
      'Kai',
      'Leilani',
      'Tane',
      'Moana',
      'Aroha',
      'Keanu',
      'Mere',
      'Nalu',
      'Sione',
      'Talia',
      'Hemi',
      'Lani',
    ],
    last: [
      'Kealoha',
      'Ngata',
      'Fonoti',
      'Tupou',
      'Makoa',
      'Rangi',
      'Paewai',
      'Kahale',
      'Tuilagi',
      'Aperahama',
      'Keawe',
      'Faleolo',
    ],
  },
  {
    first: [
      'Mila',
      'Ivan',
      'Katya',
      'Dmitri',
      'Zofia',
      'Luka',
      'Petra',
      'Nikola',
      'Irina',
      'Marek',
      'Ana',
      'Bogdan',
    ],
    last: [
      'Petrov',
      'Horvat',
      'Lazić',
      'Kovač',
      'Popescu',
      'Nowak',
      'Sokolov',
      'Dvořák',
      'Marković',
      'Volkov',
      'Kowalczyk',
      'Babić',
    ],
  },
  {
    first: [
      'Sam',
      'Alex',
      'Riley',
      'Jordan',
      'Noa',
      'Ezra',
      'Rowan',
      'Sasha',
      'Kiran',
      'River',
      'Avery',
      'Jules',
    ],
    last: [
      'Fernandes',
      'Costa',
      'Duarte',
      'Hassan',
      'Yilmaz',
      'Bennett',
      'Ali',
      'Mendes',
      'Okoro',
      'Lee',
      'Martin',
      'Pereira',
    ],
  },
];
const NAME_OVERRIDES = {
  researcher: ['Scout', 'Okafor'],
  manager: ['Quinn', 'Tanaka'],
};

// Brick-figure looks. Skin tones range from light to deep brown; appearance is
// independent of name so nothing is stereotyped from a background.
export const SKIN_TONES = [
  '#F4D5B8',
  '#E7BC95',
  '#D29C71',
  '#B97D52',
  '#96623C',
  '#704629',
  '#4E301C',
];
export const HAIR_STYLES = [
  'short',
  'side',
  'long',
  'bob',
  'bun',
  'afro',
  'curly',
  'ponytail',
  'buzz',
  'braids',
  'wavy',
  'spiky',
  'wrap',
  'bald',
];
export const HAIR_COLORS = [
  '#1F1A17',
  '#3A281E',
  '#5E3F2B',
  '#8A5634',
  '#C99A5B',
  '#8E8C8A',
  '#CFC9C0',
  '#2E4F86',
  '#A8487A',
];
const LEG_COLORS = ['#2C3E57', '#3A3A3C', '#6B5B47', '#44689A', '#D5CEBF', '#1D1D1F', '#5B6B5A'];
const OUTFITS = ['tee', 'hoodie', 'blazer', 'sweater', 'shirt', 'overshirt'];
const MOUTHS = ['smile', 'grin', 'smirk', 'open', 'smile'];

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v + amount * (amount > 0 ? 255 - v : v))));
  const r = ch(n >> 16),
    g = ch((n >> 8) & 255),
    b = ch(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase();
}

export function employeeLook(id, departmentId) {
  const s = hash(id, 11),
    t = hash(id, 29),
    u = hash(id, 47);
  const color = DEPARTMENTS.find((d) => d.id === departmentId)?.color || '#8E8E93';
  const hair = pick(HAIR_STYLES, s >>> 3);
  // Dyed colours stay rare; grey mostly for a few seniors.
  let hairColor = HAIR_COLORS[(t >>> 5) % 7];
  if (u % 17 === 0) hairColor = HAIR_COLORS[7 + (u % 2)];
  const facialChance = u % 9;
  return {
    skin: SKIN_TONES[(s >>> 9) % SKIN_TONES.length],
    hair,
    hairColor,
    facial:
      ['bald', 'buzz', 'short', 'side', 'spiky', 'curly'].includes(hair) && facialChance < 3
        ? ['beard', 'stubble', 'mustache'][facialChance]
        : 'none',
    glasses: t % 10 < 3 || departmentId === 'engineering' ? (t % 2 ? 'round' : 'square') : 'none',
    accessory:
      departmentId === 'engineering' && s % 3 === 0
        ? 'headphones'
        : departmentId === 'operations' && s % 4 === 0
          ? 'headset'
          : s % 11 === 0
            ? 'cap'
            : s % 13 === 0
              ? 'beanie'
              : 'none',
    outfit: pick(OUTFITS, u >>> 4),
    torso: shade(color, ((t >>> 12) % 5) * 0.08 - 0.12),
    accent: shade(color, 0.55),
    legs: pick(LEG_COLORS, t >>> 16),
    mouth: pick(MOUTHS, s >>> 20),
    freckles: u % 7 === 0,
    lashes: s % 3 === 0,
    seed: s,
  };
}

export const CEO_LOOK_DEFAULT = {
  skin: 3,
  hair: 'side',
  hairColor: 1,
  facial: 'none',
  glasses: 'none',
  outfit: 'blazer',
};
export function ceoLook(avatar = {}) {
  const a = { ...CEO_LOOK_DEFAULT, ...avatar };
  return {
    skin: SKIN_TONES[a.skin] || SKIN_TONES[3],
    hair: HAIR_STYLES.includes(a.hair) ? a.hair : 'side',
    hairColor: HAIR_COLORS[a.hairColor] || HAIR_COLORS[1],
    facial: ['none', 'beard', 'stubble', 'mustache'].includes(a.facial) ? a.facial : 'none',
    glasses: ['none', 'round', 'square'].includes(a.glasses) ? a.glasses : 'none',
    accessory: 'none',
    outfit: a.outfit || 'blazer',
    torso: '#1D1D1F',
    accent: '#F5F5F7',
    legs: '#3A3A3C',
    mouth: 'smile',
    freckles: false,
    lashes: false,
    seed: 7,
    ceo: true,
  };
}

const TRAITS = [
  'Detail-obsessed',
  'Big-picture thinker',
  'Calm under pressure',
  'Endlessly curious',
  'Numbers person',
  'Quick-witted',
  'Warm & encouraging',
  'Fast mover',
  'Perfectionist',
  'Natural storyteller',
  'Night owl',
  'Early riser',
  'Healthy skeptic',
  'Relentless optimist',
  'Team player',
  'Quietly brilliant',
  'Plain-spoken',
  'Idea machine',
];
const STYLES = [
  'Plans first, then moves fast.',
  'Writes a messy draft, then edits hard.',
  'Asks “why?” three times before starting.',
  'Loves a checklist more than coffee.',
  'Thinks out loud and sketches on anything.',
  'Works in focused 50-minute sprints.',
  'Starts with the customer, always.',
  'Keeps receipts for every claim.',
];
const DRINKS = [
  'oat flat white',
  'masala chai',
  'matcha',
  'espresso',
  'green tea',
  'sparkling water',
  'cold brew',
  'hot chocolate',
  'filter coffee',
  'mint tea',
];
const HOBBIES = [
  'bouldering',
  'sourdough baking',
  'chess',
  'film photography',
  'cricket',
  'salsa dancing',
  'marathon training',
  'board games',
  'balcony gardening',
  'vinyl collecting',
  'surfing',
  'sketching',
  'football',
  'pottery',
  'K-dramas',
  'hiking',
];
const CATCHPHRASES = {
  research: [
    'Show me the source.',
    'Data first, opinions later.',
    'Let’s find out what’s really true.',
  ],
  marketing: [
    'Who is this for, exactly?',
    'Let’s make it impossible to ignore.',
    'Ship the test, then learn.',
  ],
  creative: ['The first line does all the work.', 'Say it simpler.', 'Every word earns its place.'],
  analytics: [
    'Define the metric before you chase it.',
    'Correlation is a starting point.',
    'Numbers tell stories too.',
  ],
  engineering: [
    'Small changes, fewer surprises.',
    'If it isn’t tested, it’s a rumor.',
    'Make it work, then make it nice.',
  ],
  operations: [
    'Clear owners, clear dates.',
    'Let’s make Monday easier.',
    'Process should feel invisible.',
  ],
  compliance: [
    'Better to ask now than apologize later.',
    'Every claim needs a receipt.',
    'Plain words, fewer risks.',
  ],
  personal: ['Small habits, big wins.', 'Progress over perfection.', 'People first, always.'],
};

export function personaFor(id, departmentId, index = 0) {
  const s = hash(id, 3),
    pool = NAME_POOLS[(index + (s % 3)) % NAME_POOLS.length];
  const [first, last] = NAME_OVERRIDES[id] || [pick(pool.first, s >>> 2), pick(pool.last, s >>> 7)];
  const t1 = pick(TRAITS, s >>> 11);
  let t2 = pick(TRAITS, s >>> 15);
  if (t2 === t1) t2 = TRAITS[(TRAITS.indexOf(t1) + 5) % TRAITS.length];
  return {
    firstName: first,
    lastName: last,
    fullName: `${first} ${last}`,
    traits: [t1, t2],
    style: pick(STYLES, s >>> 19),
    drink: pick(DRINKS, s >>> 5),
    hobby: pick(HOBBIES, s >>> 13),
    catchphrase: pick(CATCHPHRASES[departmentId] || CATCHPHRASES.operations, s >>> 23),
    look: employeeLook(id, departmentId),
  };
}

// Assign unique first and last names across a roster. Consecutive employees are
// drawn from different name pools (7 is coprime with 12, so every pool is used).
export function assignPersonas(workers) {
  const usedFirst = new Set(Object.values(NAME_OVERRIDES).map(([f]) => f)),
    usedLast = new Set(Object.values(NAME_OVERRIDES).map(([, l]) => l));
  const take = (list, seed, used) => {
    for (let i = 0; i < list.length; i++) {
      const name = list[(seed + i) % list.length];
      if (!used.has(name)) {
        used.add(name);
        return name;
      }
    }
    return null;
  };
  return workers.map((worker, index) => {
    const persona = personaFor(worker.id, worker.department, index);
    if (NAME_OVERRIDES[worker.id]) return persona;
    const s = hash(worker.id, 3);
    let first = null,
      last = null;
    for (let p = 0; p < NAME_POOLS.length && !(first && last); p++) {
      const pool = NAME_POOLS[(index * 7 + p) % NAME_POOLS.length];
      first ||= take(pool.first, s >>> 2, usedFirst);
      last ||= take(pool.last, s >>> 7, usedLast);
    }
    persona.firstName = first || persona.firstName;
    persona.lastName = last || persona.lastName;
    persona.fullName = `${persona.firstName} ${persona.lastName}`;
    return persona;
  });
}

const clip = (text, n = 42) => {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
};

// Thought bubbles reflect real state: current task, queue, approvals and
// finished work. Idle thoughts suggest what the employee could do next.
export function thoughtFor(worker, ctx = {}, tick = 0) {
  const p = worker.persona || {};
  const seed = hash(worker.id, tick);
  const task = clip(ctx.task || worker.activity?.task || '', 40);
  const skill = ctx.skill ? clip(ctx.skill, 30) : null;
  const product = ctx.product ? clip(ctx.product, 24) : null;
  const status = ctx.status || worker.activity?.status || 'idle';
  const options = [];
  if (status === 'working') {
    const phase = worker.activity?.phase;
    options.push(
      task ? `On it: “${task}”` : 'Heads down on my assignment.',
      phase === 'researching'
        ? 'Reading the sources before I write a word.'
        : 'Drafting now — structure first, polish after.',
      'Checking every claim against the brief.',
      task
        ? `Next step for “${clip(task, 24)}”: tighten the summary.`
        : 'Almost there. Final pass next.',
    );
    if (p.drink) options.push(`Fuelled by ${p.drink}. Writing the good part now.`);
  } else if (status === 'queued') {
    options.push(
      task ? `Up next: “${task}”` : 'I’m in the queue — outlining while I wait.',
      'Waiting for a free brain slot. Sketching my outline.',
      ctx.queueCount > 1
        ? `${ctx.queueCount} tasks lined up. Taking them one by one.`
        : 'Gathering notes so I can start fast.',
    );
  } else if (status === 'approval') {
    options.push(
      ctx.waitingTitle
        ? `Waiting on the boss: “${clip(ctx.waitingTitle, 34)}”`
        : 'Waiting for the boss to approve.',
      'Nothing goes live without the boss’s OK.',
      'Folder in hand. Ready when you are, boss!',
    );
  } else if (status === 'bench') {
    options.push(
      'On the bench. Ready when needed.',
      `Reading up on ${p.hobby || 'new ideas'} in the lounge.`,
    );
  } else {
    if (ctx.lastDone) options.push(`Shipped “${clip(ctx.lastDone, 32)}”. What’s next?`);
    if (skill && product) options.push(`I could do a ${skill.toLowerCase()} for ${product}.`);
    if (skill) options.push(`Planning: a fresh ${skill.toLowerCase()} could help.`);
    options.push(
      p.drink
        ? `${p.drink[0].toUpperCase() + p.drink.slice(1)} first, then planning.`
        : 'Coffee first, then planning.',
      p.catchphrase || 'Ready for the next brief.',
      'Free right now — tap me for a task idea.',
    );
  }
  return options[seed % options.length];
}

export function titleFor(id, fallbackName) {
  const role = ROLES[id];
  return role?.title || fallbackName;
}
