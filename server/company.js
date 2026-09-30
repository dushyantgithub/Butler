import { z } from 'zod';
import { publicWebsite } from './projects.js';
import { DEPARTMENTS, HAIR_STYLES, SKIN_TONES, HAIR_COLORS } from '../shared/roster.js';

// ---------------------------------------------------------------------------
// Company profile (the onboarding questionnaire). Editable any time.
// ---------------------------------------------------------------------------
export const GOALS = {
  social: 'Grow on social media',
  content: 'Blog & content marketing',
  seo: 'Rank on Google (SEO)',
  leads: 'Generate leads & sales',
  launch: 'Launch a product or feature',
  email: 'Email & newsletters',
  ads: 'Paid advertising',
  brand: 'Brand & positioning',
  pr: 'PR, press & influencers',
  video: 'Video, reels & YouTube',
  research: 'Market & competitor research',
  news: 'AI news desk for LinkedIn & X',
  pricing: 'Pricing & business model',
  fundraising: 'Fundraising & investors',
  analytics: 'Analytics & KPIs',
  engineering: 'Engineering & product',
  support: 'Customer support & success',
  legal: 'Legal, privacy & compliance',
  operations: 'Operations, OKRs & planning',
  hiring: 'Hiring & team building',
  personal: 'My own productivity & wellbeing',
  career: 'My job search',
};
export const CHANNELS = {
  linkedin: 'LinkedIn',
  x: 'X / Twitter',
  instagram: 'Instagram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  newsletter: 'Email newsletter',
  blog: 'Blog / website',
  whatsapp: 'WhatsApp',
  podcast: 'Podcast',
  reddit: 'Reddit / communities',
};
export const STAGES = {
  idea: 'Just an idea',
  solo: 'Solo founder / creator',
  startup: 'Early-stage startup',
  growing: 'Growing business',
  established: 'Established company',
  agency: 'Agency or consultancy',
  nonprofit: 'Non-profit',
};
export const TEAM_SIZES = { lean: 8, balanced: 14, full: 24, all: 40 };

const text = (max) => z.string().trim().max(max).default('');
const https = z
  .string()
  .trim()
  .max(600)
  .refine((v) => {
    if (!v) return true;
    try {
      publicWebsite(v);
      return true;
    } catch {
      return false;
    }
  }, 'Use a public HTTPS URL.')
  .default('');
export const companySchema = z
  .object({
    ceo: z
      .object({
        name: z.string().trim().min(1).max(60),
        avatar: z
          .object({
            skin: z
              .number()
              .int()
              .min(0)
              .max(SKIN_TONES.length - 1)
              .default(3),
            hair: z.enum(HAIR_STYLES).default('side'),
            hairColor: z
              .number()
              .int()
              .min(0)
              .max(HAIR_COLORS.length - 1)
              .default(1),
            facial: z.enum(['none', 'beard', 'stubble', 'mustache']).default('none'),
            glasses: z.enum(['none', 'round', 'square']).default('none'),
          })
          .strict()
          .default({}),
      })
      .strict(),
    companyName: z.string().trim().min(1).max(100),
    website: https,
    industry: text(80),
    stage: z.enum(Object.keys(STAGES)).default('startup'),
    tagline: text(200),
    description: z.string().trim().min(10).max(3000),
    mission: text(600),
    products: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(100),
            description: text(800),
            audience: text(300),
            price: text(100),
            url: https,
          })
          .strict(),
      )
      .max(12)
      .default([]),
    audience: text(1500),
    regions: text(300),
    competitors: text(800),
    goals: z
      .array(z.enum(Object.keys(GOALS)))
      .min(1)
      .max(Object.keys(GOALS).length)
      .refine((a) => new Set(a).size === a.length),
    needs: text(2000),
    channels: z
      .array(z.enum(Object.keys(CHANNELS)))
      .max(Object.keys(CHANNELS).length)
      .refine((a) => new Set(a).size === a.length)
      .default([]),
    voice: text(800),
    voiceTags: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
    facts: text(6000),
    restrictions: text(2000),
    sources: z.array(https).max(8).default([]),
    approvals: z
      .object({
        verifyFacts: z.boolean().default(true),
        outreach: z.boolean().default(true),
        spending: z.boolean().default(true),
      })
      .strict()
      .default({}),
    teamSize: z.enum(Object.keys(TEAM_SIZES)).default('balanced'),
  })
  .strict();

export const COMPANY_PROJECT_ID = 'company';
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
export function projectFromCompany(c) {
  const products = c.products
    .map(
      (p) =>
        `${p.name}${p.price ? ` (${p.price})` : ''}: ${p.description}${p.audience ? ` Audience: ${p.audience}.` : ''}${p.url ? ` ${p.url}` : ''}`,
    )
    .join('\n');
  return {
    name: cut(c.companyName, 100),
    website: c.website || '',
    company: cut(
      [
        c.tagline,
        c.description,
        c.mission && `Mission: ${c.mission}`,
        c.industry && `Industry: ${c.industry}`,
        `Stage: ${STAGES[c.stage]}`,
        c.regions && `Markets: ${c.regions}`,
        c.competitors && `Competitors: ${c.competitors}`,
      ]
        .filter(Boolean)
        .join('\n'),
      2000,
    ),
    products: cut(products, 4000),
    audience: cut(c.audience, 1500),
    voice: cut([c.voiceTags.join(', '), c.voice].filter(Boolean).join('. '), 1500),
    goals: cut([c.goals.map((g) => GOALS[g]).join('; '), c.needs].filter(Boolean).join('\n'), 2000),
    facts: cut(c.facts, 6000),
    restrictions: cut(c.restrictions, 2000),
    sources: [...new Set(c.sources.filter(Boolean))].slice(0, 8),
  };
}

// ---------------------------------------------------------------------------
// Staffing: who should work here, and why.
// ---------------------------------------------------------------------------
const E = (role) => `employee-${role}`;
export const GOAL_TEAMS = {
  social: [
    'manager',
    'brand-strategist',
    E('linkedin-post-writer'),
    E('content-calendar-planner'),
    E('tweet-thread-writer'),
    E('instagram-reels-script-writer'),
    'campaign-creative',
  ],
  content: [
    'campaign-creative',
    E('blog-post-writer'),
    E('content-calendar-planner'),
    E('seo-strategist'),
    E('case-study-writer'),
    E('brand-voice-coach'),
  ],
  seo: [
    E('seo-strategist'),
    E('blog-post-writer'),
    E('landing-page-copywriter'),
    E('competitor-analyst'),
    'technology-advisor',
  ],
  leads: [
    E('funnel-architect'),
    E('cold-outreach-writer'),
    E('landing-page-copywriter'),
    E('email-copywriter'),
    'brand-strategist',
    E('case-study-writer'),
  ],
  launch: [
    E('gtm-strategist'),
    'brand-strategist',
    E('press-release-writer'),
    E('landing-page-copywriter'),
    'campaign-creative',
    E('growth-hacker'),
  ],
  email: [
    E('email-copywriter'),
    E('newsletter-writer'),
    E('lifecycle-marketing-strategist'),
    E('retention-strategist'),
  ],
  ads: [
    E('ad-copywriter'),
    E('paid-campaign-optimizer'),
    'campaign-creative',
    'performance-analyst',
  ],
  brand: ['brand-strategist', E('brand-voice-coach'), 'campaign-creative', E('trademark-research')],
  pr: [
    E('press-release-writer'),
    E('influencer-pitch-writer'),
    'brand-strategist',
    E('case-study-writer'),
  ],
  video: [
    E('youtube-script-writer'),
    E('video-script-writer'),
    E('instagram-reels-script-writer'),
    E('podcast-show-notes-writer'),
  ],
  research: [
    'research-planner',
    E('competitor-analyst'),
    E('customer-research-interviewer'),
    E('market-sizing-analyst'),
  ],
  news: ['researcher', 'manager', 'evidence-reviewer'],
  pricing: [
    E('pricing-strategist'),
    E('unit-economics-analyst'),
    'research-planner',
    E('market-sizing-analyst'),
  ],
  fundraising: [
    E('fundraising-pitch-coach'),
    E('board-deck-builder'),
    E('unit-economics-analyst'),
    E('market-sizing-analyst'),
    E('one-pager-builder'),
  ],
  analytics: [
    'performance-analyst',
    E('metric-definer'),
    E('kpi-dashboard-builder'),
    E('analytics-narrator'),
    E('ab-test-analyzer'),
  ],
  engineering: [
    'technology-advisor',
    E('code-reviewer'),
    E('security-auditor'),
    E('test-writer'),
    E('api-designer'),
    E('technical-docs-writer'),
  ],
  support: [E('customer-support-responder'), E('retention-strategist'), E('technical-docs-writer')],
  legal: [
    'evidence-reviewer',
    E('privacy-policy-drafter'),
    E('tos-drafter'),
    E('data-protection-checker'),
    E('nda-reviewer'),
  ],
  operations: [
    E('okr-coach'),
    E('project-status-reporter'),
    E('meeting-summarizer'),
    E('inbox-triage'),
    E('weekly-review-coach'),
  ],
  hiring: [
    E('learning-coach'),
    E('hiring-jd-writer'),
    E('interview-prepper'),
    E('employment-contract-reviewer'),
  ],
  personal: [
    E('founder-journal-coach'),
    E('focus-coach'),
    E('calendar-optimizer'),
    E('burnout-recovery-coach'),
  ],
  career: ['job-hunter', E('resume-writer'), E('interview-prepper'), E('negotiation-coach')],
};
const CHANNEL_TEAM = {
  linkedin: [E('linkedin-post-writer'), 'manager'],
  x: [E('tweet-thread-writer'), 'manager'],
  instagram: [E('instagram-reels-script-writer')],
  youtube: [E('youtube-script-writer')],
  tiktok: [E('instagram-reels-script-writer'), E('video-script-writer')],
  facebook: [E('ad-copywriter')],
  newsletter: [E('newsletter-writer')],
  blog: [E('blog-post-writer'), E('seo-strategist')],
  whatsapp: [E('whatsapp-marketing-writer')],
  podcast: [E('podcast-show-notes-writer')],
  reddit: [E('growth-hacker')],
};
const PUBLISHING_GOALS = ['social', 'news', 'content', 'pr', 'ads', 'launch', 'video', 'brand'];

const stem = (w) => (w.length > 4 ? w.replace(/(ies|es|s)$/, '') : w).slice(0, 5);
const STOP = new Set([
  'and',
  'the',
  'for',
  'our',
  'you',
  'are',
  'but',
  'not',
  'can',
  'all',
  'its',
  'with',
  'that',
  'this',
  'from',
  'your',
  'have',
  'into',
  'more',
  'about',
  'will',
  'they',
  'what',
  'want',
  'need',
  'help',
  'make',
  'get',
  'new',
  'use',
  'who',
  'how',
  'out',
  'one',
  'app',
  'write',
  'writer',
  'create',
  'prepare',
  'plan',
  'build',
  'builder',
  'draft',
  'some',
  'next',
  'week',
  'month',
]);
const tokens = (s) =>
  new Set(
    (
      String(s)
        .toLowerCase()
        .match(/[a-z]{3,}/g) || []
    )
      .filter((w) => !STOP.has(w))
      .map(stem),
  );
function workerVocabulary(worker, skillsById) {
  const skillNames = worker.skillIds
    .slice(0, 30)
    .map((id) => skillsById.get(id)?.name || '')
    .join(' ');
  return tokens(`${worker.name} ${worker.title} ${worker.description} ${skillNames}`);
}
function companyText(c) {
  return [
    c.description,
    c.needs,
    c.tagline,
    c.industry,
    c.audience,
    ...c.products.map((p) => `${p.name} ${p.description}`),
  ].join(' ');
}
export function planTeam(company, catalog) {
  const workers = catalog.workers.filter((w) => w.origin === 'built-in');
  const byId = new Map(workers.map((w) => [w.id, w]));
  const skillsById = new Map(catalog.skills.map((s) => [s.id, s]));
  const score = new Map(),
    reasons = new Map();
  const add = (id, points, reason) => {
    if (!byId.has(id)) return;
    score.set(id, (score.get(id) || 0) + points);
    if (reason && !reasons.get(id)?.includes(reason))
      reasons.set(id, [...(reasons.get(id) || []), reason]);
  };
  for (const goal of company.goals)
    (GOAL_TEAMS[goal] || []).forEach((id, i) => add(id, 12 - i * 1.5, GOALS[goal]));
  for (const channel of company.channels)
    (CHANNEL_TEAM[channel] || []).forEach((id) => add(id, 4, `You use ${CHANNELS[channel]}`));
  if (
    /india|bharat|hindi|mumbai|delhi|bengal|bangalore|chennai|hyderabad|pune/i.test(
      `${company.regions} ${company.audience}`,
    )
  ) {
    add(E('hindi-english-content-writer'), 6, 'You reach audiences in India');
    if (company.channels.includes('whatsapp') || company.goals.includes('leads'))
      add(E('whatsapp-marketing-writer'), 4, 'WhatsApp matters in India');
    if (company.goals.some((g) => ['legal', 'pricing', 'fundraising'].includes(g)))
      add(E('gst-india-helper'), 5, 'GST questions for Indian operations');
  }
  if (
    /restaurant|food|cafe|café|bakery|cloud kitchen|delivery|dining/i.test(
      `${company.industry} ${company.description}`,
    )
  )
    add(E('zomato-swiggy-listing-optimizer'), 9, 'You sell food through delivery apps');
  if (
    /saas|software|app|platform|api|developer|ai\b/i.test(
      `${company.industry} ${company.description}`,
    )
  )
    add('technology-advisor', 3, 'You build software');
  // Free-text needs: match what the CEO wrote against each role and its skills.
  const wanted = tokens(companyText(company));
  for (const worker of workers) {
    const overlap = [...workerVocabulary(worker, skillsById)].filter((w) => wanted.has(w)).length;
    if (overlap >= 2) add(worker.id, Math.min(6, overlap * 1.2), 'Matches what you described');
  }
  const mustHave = new Set();
  if (company.goals.some((g) => PUBLISHING_GOALS.includes(g))) {
    add('evidence-reviewer', 7, 'Checks every claim before anything goes public');
    mustHave.add('evidence-reviewer');
  }
  const limit = TEAM_SIZES[company.teamSize] || 14;
  const ranked = [...score.entries()].filter(([, s]) => s >= 4).sort((a, b) => b[1] - a[1]);
  const chosen = new Set(mustHave);
  for (const [id] of ranked) if (chosen.size < limit) chosen.add(id);
  // Every department with a team gets its head, who coordinates and owns all its skills.
  for (const dept of DEPARTMENTS) {
    const members = [...chosen].filter((id) => byId.get(id)?.department === dept.id);
    if (members.length >= 2 && !chosen.has(dept.head) && byId.has(dept.head)) {
      chosen.add(dept.head);
      add(dept.head, 1, `Leads your ${dept.name} team`);
    }
  }
  // Keep close to the size cap after adding heads by dropping the weakest specialists.
  let ids = [...chosen].sort((a, b) => (score.get(b) || 0) - (score.get(a) || 0));
  const protectedIds = new Set([...DEPARTMENTS.map((d) => d.head), ...mustHave]);
  while (ids.length > limit + 2) {
    const weakest = [...ids].reverse().find((id) => !protectedIds.has(id));
    if (!weakest) break;
    ids = ids.filter((id) => id !== weakest);
  }
  return ids.map((id) => {
    const worker = byId.get(id);
    return {
      workerId: id,
      name: worker.persona.fullName,
      title: worker.title,
      department: worker.department,
      head: worker.head,
      score: Math.round((score.get(id) || 0) * 10) / 10,
      reasons: reasons.get(id) || [],
      starter: suggestTasks(worker, catalog, company)[0] || null,
    };
  });
}

// ---------------------------------------------------------------------------
// Task suggestions for a free employee, grounded in the company profile.
// ---------------------------------------------------------------------------
const T = (title, brief, kind = 'report') => ({ title, brief, kind });
const ROLE_TASKS = {
  researcher: [
    T(
      'Brief me on this week’s AI news',
      'Summarise the most relevant recent AI announcements for {company} and why they matter to {audience}. Separate facts from interpretation.',
    ),
  ],
  manager: [
    T(
      'Draft a LinkedIn & X post about {product}',
      'Write a LinkedIn post and an X post introducing {product} to {audience}, using only confirmed facts. Include a clear call to action to {website}.',
      'campaign',
    ),
    T(
      'Plan next week’s social posts',
      'Create a 7-day social plan for {company} on {channels}: post angle, hook, format and CTA per day.',
    ),
  ],
  'brand-strategist': [
    T(
      'Positioning & messaging for {company}',
      'Write a positioning statement, three message pillars with proof points from our facts, and messaging do’s and don’ts for {company} aimed at {audience}.',
    ),
    T(
      '30-day marketing plan',
      'Build a 30-day marketing plan for {product}: goals, channels ({channels}), weekly themes, owners by role, and one measurable experiment per week.',
    ),
  ],
  'campaign-creative': [
    T(
      'Campaign concept for {product}',
      'Create a campaign for {product} aimed at {audience}: big idea, headline options, LinkedIn and X copy, and visual direction.',
      'campaign',
    ),
    T(
      'Three creative angles to test',
      'Propose three distinct creative angles for {product}, each with a headline, supporting line, visual idea and the audience it targets.',
    ),
  ],
  'evidence-reviewer': [
    T(
      'Audit our claims',
      'Review our website copy, product descriptions and confirmed facts for {company}. List every claim, whether it is supported, and exactly what the CEO must verify before we use it.',
    ),
  ],
  'research-planner': [
    T(
      'Research plan for {company}',
      'Write a research plan: the five questions that matter most for {company} now, what evidence answers each, and which specialist should dig in.',
    ),
    T(
      'Competitor landscape',
      'Map the competitive landscape for {company} ({competitors}): positioning, strengths, gaps and where we can win. Mark anything unverified.',
    ),
  ],
  'performance-analyst': [
    T(
      'KPI tree for {company}',
      'Define a KPI tree for {company}: north-star metric, input metrics, definitions, data sources and targets to set.',
    ),
    T(
      'Measurement plan for our next campaign',
      'Write a measurement plan for promoting {product}: success metrics, tracking setup, UTM scheme and a reporting cadence.',
    ),
  ],
  'technology-advisor': [
    T(
      'Technical roadmap review',
      'Review what {company} builds ({products}) and outline a pragmatic technical roadmap: architecture risks, quick wins, security basics and what to build next.',
    ),
  ],
  'job-hunter': [
    T(
      'Plan my job search',
      'Outline a weekly job-search plan with target roles, portals and follow-up rhythm. Use the Job search page for real applications.',
    ),
  ],
  [E('seo-strategist')]: [
    T(
      'Keyword & topic map',
      'Build a keyword and topic map for {company} around {product}: search intents, pillar pages, supporting articles and on-page priorities for {website}.',
    ),
    T(
      'SEO audit checklist for our site',
      'Create an SEO audit of {website} based on its readable content: titles, headings, internal links, schema ideas and the ten highest-impact fixes.',
    ),
  ],
  [E('blog-post-writer')]: [
    T(
      'Write a blog post about {product}',
      'Write a complete 900-word blog post for {audience} about the problem {product} solves, with headings, examples from our facts and a CTA.',
    ),
  ],
  [E('linkedin-post-writer')]: [
    T(
      'Three LinkedIn posts for {company}',
      'Write three finished LinkedIn posts for {company} with different hooks (story, insight, how-to) based on our confirmed facts.',
    ),
    T('Launch post for {product}', 'Write a LinkedIn and X launch post for {product}.', 'campaign'),
  ],
  [E('tweet-thread-writer')]: [
    T(
      'X thread about {product}',
      'Write a 6-tweet thread explaining the problem {product} solves for {audience}, with a strong hook and CTA to {website}.',
    ),
  ],
  [E('instagram-reels-script-writer')]: [
    T(
      'Three reel scripts',
      'Write three 30-second Instagram reel scripts for {product}: hook, shots, on-screen text, voiceover and caption.',
    ),
  ],
  [E('youtube-script-writer')]: [
    T(
      'YouTube explainer script',
      'Write a 5-minute YouTube explainer script for {product} with timestamps, B-roll directions, title and description.',
    ),
  ],
  [E('video-script-writer')]: [
    T(
      '60-second product video script',
      'Write a 60-second product video script for {product}: scenes, voiceover, on-screen text and music direction.',
    ),
  ],
  [E('email-copywriter')]: [
    T(
      'Welcome email sequence',
      'Write a 4-email welcome sequence for new {company} subscribers with subject lines, preview text and CTAs.',
    ),
  ],
  [E('newsletter-writer')]: [
    T(
      'This month’s newsletter',
      'Write this month’s {company} newsletter: headline story, product update from confirmed facts, tip for {audience} and CTA.',
    ),
  ],
  [E('landing-page-copywriter')]: [
    T(
      'Landing page copy for {product}',
      'Write full landing page copy for {product}: hero, benefits, how it works, proof from our facts, FAQ and CTA.',
    ),
  ],
  [E('press-release-writer')]: [
    T(
      'Press release draft',
      'Draft a press release announcing {product}, using only confirmed facts, with a media contact placeholder and boilerplate.',
    ),
  ],
  [E('case-study-writer')]: [
    T(
      'Case study template & questions',
      'Create a case study template for {company} and the interview questions to collect a customer story (no invented customers).',
    ),
  ],
  [E('content-calendar-planner')]: [
    T(
      'Content calendar for next month',
      'Build a 4-week content calendar across {channels} for {company}: themes, formats, owners by role and publishing days.',
    ),
  ],
  [E('funnel-architect')]: [
    T(
      'Lead funnel for {product}',
      'Design a lead funnel for {product}: lead magnet, landing page outline, nurture emails and conversion points with metrics.',
    ),
  ],
  [E('cold-outreach-writer')]: [
    T(
      'Cold outreach sequence',
      'Write a 3-step cold outreach email sequence for {audience} introducing {product}. Personalisation fields marked clearly.',
    ),
  ],
  [E('growth-hacker')]: [
    T(
      'Ten growth experiments',
      'List ten low-cost growth experiments for {company}, each with hypothesis, setup, metric and effort score.',
    ),
  ],
  [E('gtm-strategist')]: [
    T(
      'Go-to-market plan for {product}',
      'Create a go-to-market plan for {product}: ICP, positioning, channels, launch timeline, pricing questions and success metrics.',
    ),
  ],
  [E('ad-copywriter')]: [
    T(
      'Ad copy variations',
      'Write six ad variations for {product} (Meta and LinkedIn) with headlines, primary text and CTAs for {audience}.',
    ),
  ],
  [E('paid-campaign-optimizer')]: [
    T(
      'Paid campaign plan',
      'Plan a test paid campaign for {product}: channels, audiences, creatives to test, budget questions for the CEO and KPIs.',
    ),
  ],
  [E('lifecycle-marketing-strategist')]: [
    T(
      'Lifecycle journey map',
      'Map the customer lifecycle for {company} with the message, channel and trigger at each stage.',
    ),
  ],
  [E('retention-strategist')]: [
    T(
      'Retention playbook',
      'Write a retention playbook for {company}: churn signals, save offers to consider and a win-back sequence.',
    ),
  ],
  [E('competitor-analyst')]: [
    T(
      'Competitor battlecards',
      'Create battlecards for our main competitors ({competitors}): their pitch, our differentiators, objections and responses.',
    ),
  ],
  [E('customer-research-interviewer')]: [
    T(
      'Customer interview guide',
      'Write a customer interview guide for {audience}: screener, 12 questions, and how to synthesise answers.',
    ),
  ],
  [E('market-sizing-analyst')]: [
    T(
      'Market sizing model',
      'Build a TAM/SAM/SOM framework for {product} with assumptions listed and data we still need.',
    ),
  ],
  [E('pricing-strategist')]: [
    T(
      'Pricing options for {product}',
      'Propose three pricing models for {product} with packaging, price-testing plan and risks. Do not assume current prices unless given.',
    ),
  ],
  [E('unit-economics-analyst')]: [
    T(
      'Unit economics model',
      'Lay out the unit economics model for {company}: CAC, LTV, payback, margins — formulas, inputs needed and scenarios.',
    ),
  ],
  [E('fundraising-pitch-coach')]: [
    T(
      'Pitch deck outline',
      'Outline a 12-slide pitch deck for {company} with the story, key slides and the proof each slide needs.',
    ),
  ],
  [E('board-deck-builder')]: [
    T(
      'Monthly investor update',
      'Draft a monthly investor update template for {company} with sections, metrics to include and asks.',
    ),
  ],
  [E('one-pager-builder')]: [
    T(
      'Company one-pager',
      'Write a one-page overview of {company} and {product} for partners and investors.',
    ),
  ],
  [E('metric-definer')]: [
    T(
      'Metric dictionary',
      'Write a metric dictionary for {company}: each metric’s definition, formula, source and owner.',
    ),
  ],
  [E('kpi-dashboard-builder')]: [
    T(
      'KPI dashboard spec',
      'Specify a KPI dashboard for {company}: charts, metrics, filters, refresh cadence and data sources.',
    ),
  ],
  [E('analytics-narrator')]: [
    T(
      'Monthly insights report template',
      'Create a monthly insights report template that turns our metrics into a narrative with decisions.',
    ),
  ],
  [E('code-reviewer')]: [
    T(
      'Code review checklist',
      'Write a code review checklist tailored to {company}’s product ({products}): correctness, security, tests and readability.',
    ),
  ],
  [E('security-auditor')]: [
    T(
      'Security baseline audit',
      'Create a security baseline checklist for {company}: accounts, data, dependencies, backups and incident response.',
    ),
  ],
  [E('test-writer')]: [
    T(
      'Test strategy',
      'Write a test strategy for {product}: unit, integration and end-to-end priorities and the first ten tests to write.',
    ),
  ],
  [E('technical-docs-writer')]: [
    T(
      'Getting-started guide',
      'Write a getting-started guide for {product} users with steps, screenshots to capture and troubleshooting.',
    ),
  ],
  [E('api-designer')]: [
    T(
      'API design review',
      'Propose a clean API design for {product}’s core resources with endpoints, errors and versioning.',
    ),
  ],
  [E('okr-coach')]: [
    T(
      'Quarterly OKRs',
      'Draft quarterly OKRs for {company} based on our goals ({goals}), with 3 objectives and measurable key results.',
    ),
    T(
      'Weekly operating rhythm',
      'Design a weekly operating rhythm for {company}: meetings, reports, owners and templates.',
    ),
  ],
  [E('project-status-reporter')]: [
    T(
      'Status report template',
      'Create a weekly status report template for {company} projects with RAG status, risks and next steps.',
    ),
  ],
  [E('customer-support-responder')]: [
    T(
      'Support reply templates',
      'Write support reply templates for the ten most likely questions about {product}, in our voice.',
    ),
  ],
  [E('meeting-summarizer')]: [
    T(
      'Meeting notes system',
      'Create a meeting notes template and a decision/action log format for {company}.',
    ),
  ],
  [E('privacy-policy-drafter')]: [
    T(
      'Privacy policy draft',
      'Draft a privacy policy outline for {website} listing the facts the CEO must confirm (data collected, processors, regions).',
    ),
  ],
  [E('tos-drafter')]: [
    T(
      'Terms of service outline',
      'Draft terms of service for {product} with sections and questions the CEO must answer; flag for legal review.',
    ),
  ],
  [E('data-protection-checker')]: [
    T(
      'Data protection checklist',
      'Create a data-protection checklist for {company} in {regions}, noting what needs qualified legal review.',
    ),
  ],
  [E('nda-reviewer')]: [
    T(
      'NDA template review guide',
      'Write a guide to review incoming NDAs for {company}: red flags, standard positions and fallback wording.',
    ),
  ],
  [E('trademark-research')]: [
    T(
      'Trademark checklist for {company}',
      'Create a trademark research checklist for the {company} and {product} names, with search steps and risks to check.',
    ),
  ],
  [E('learning-coach')]: [
    T(
      'Team learning plan',
      'Create a learning plan for the {company} team: skills to build, resources, and a monthly rhythm.',
    ),
  ],
  [E('hiring-jd-writer')]: [
    T(
      'Job description for our next hire',
      'Write a job description for the most useful next hire for {company}, with scorecard and interview loop.',
    ),
  ],
  [E('founder-journal-coach')]: [
    T(
      'Founder weekly reflection',
      'Create a founder weekly reflection template with prompts on wins, lessons, energy and priorities.',
    ),
  ],
  [E('focus-coach')]: [
    T(
      'Deep-work schedule',
      'Design a weekly deep-work schedule for the CEO of {company} with focus blocks, admin batches and rules.',
    ),
  ],
  [E('hindi-english-content-writer')]: [
    T(
      'Hinglish social posts',
      'Write five Hinglish social posts for {company} for Indian audiences, with English translations for review.',
    ),
  ],
  [E('whatsapp-marketing-writer')]: [
    T(
      'WhatsApp broadcast messages',
      'Write five opt-in WhatsApp broadcast messages for {product} with clear value and opt-out wording.',
    ),
  ],
  [E('zomato-swiggy-listing-optimizer')]: [
    T(
      'Delivery app listing',
      'Optimise our Zomato/Swiggy listing: dish names, descriptions, photo brief, combos and offer ideas.',
    ),
  ],
  [E('brand-voice-coach')]: [
    T(
      'Brand voice guide',
      'Write a brand voice guide for {company}: personality, tone by channel, vocabulary, and before/after examples.',
    ),
  ],
  [E('influencer-pitch-writer')]: [
    T(
      'Influencer outreach pitch',
      'Write an influencer outreach brief and pitch for {product}, with the creator profile to target.',
    ),
  ],
};
const DEPARTMENT_TASKS = {
  research: T(
    'Opportunity brief',
    'As {title}, research one opportunity for {company} related to {product} and deliver findings, evidence, gaps and a recommendation.',
  ),
  marketing: T(
    'Growth idea for {product}',
    'As {title}, propose and fully draft one marketing initiative for {product} targeting {audience}, with a measurable test.',
  ),
  creative: T(
    'Content piece for {company}',
    'As {title}, create one finished content piece for {company} on {channels} in our voice, with a CTA.',
  ),
  analytics: T(
    'Measurement plan',
    'As {title}, define how {company} should measure progress on {goals}: metrics, formulas, data sources and a reporting template.',
  ),
  engineering: T(
    'Technical recommendation',
    'As {title}, prepare a practical technical recommendation for {company}’s product ({products}) with risks and next steps.',
  ),
  operations: T(
    'Process to streamline',
    'As {title}, design a better process for {company}: steps, owners, templates and a checklist.',
  ),
  compliance: T(
    'Risk review',
    'As {title}, review {company}’s current plans and copy for legal and trust risks, listing what needs CEO verification or a lawyer.',
  ),
  personal: T(
    'Personal plan for the CEO',
    'As {title}, prepare a practical plan to support the CEO of {company} in your specialty, with a first-week checklist.',
  ),
};
function fill(template, worker, company) {
  const product = company?.products?.[0]?.name || company?.companyName || 'our product';
  const values = {
    company: company?.companyName || 'the company',
    product,
    products: company?.products?.map((p) => p.name).join(', ') || product,
    audience: company?.audience?.split(/[.\n]/)[0]?.slice(0, 80) || 'our audience',
    website: company?.website || 'our website',
    channels: company?.channels?.map((c) => CHANNELS[c]).join(', ') || 'our channels',
    competitors: company?.competitors?.slice(0, 120) || 'our competitors',
    goals:
      company?.goals
        ?.map((g) => GOALS[g])
        .slice(0, 4)
        .join(', ') || 'our goals',
    regions: company?.regions || 'our markets',
    title: worker.title,
  };
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
}
export function suggestTasks(worker, catalog, company, recentTitles = []) {
  const skillsById = new Map(catalog.skills.map((s) => [s.id, s]));
  const wanted = company ? tokens(companyText(company)) : new Set();
  const roleTasks = ROLE_TASKS[worker.id] || [];
  const out = [];
  const push = (task, skill) => {
    const title = fill(task.title, worker, company);
    if (out.some((t) => t.title === title) || recentTitles.includes(title)) return;
    out.push({
      id: `${worker.id}:${out.length}`,
      title,
      brief: fill(task.brief, worker, company),
      kind: task.kind === 'campaign' && company ? 'campaign' : 'report',
      skillIds: skill ? [skill.id] : [],
      source: skill ? 'skill' : 'role',
    });
  };
  roleTasks.forEach((t) => push(t));
  if (!roleTasks.length) push(DEPARTMENT_TASKS[worker.department] || DEPARTMENT_TASKS.operations);
  const skills = (worker.skillIds || [])
    .map((id) => skillsById.get(id))
    .filter(Boolean)
    .map((s, i) => ({ s, i, score: [...tokens(s.name)].filter((w) => wanted.has(w)).length }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, 8);
  for (const { s } of skills) {
    if (out.length >= 6) break;
    push(
      T(
        `${s.name} for {company}`,
        `Use your ${s.name} skill to produce a finished ${s.name.toLowerCase()} for {company}${company ? ' focused on {product} and {audience}' : ''}. Deliver the complete document, not an outline, and list anything the CEO must confirm.`,
      ),
      s,
    );
  }
  return out.slice(0, 6);
}

// ---------------------------------------------------------------------------
// Missions: turn one CEO goal into assignments for the best-fit employees.
// ---------------------------------------------------------------------------
const ANGLES = {
  research:
    'Research the evidence behind this goal — customers, competitors or market — and deliver findings, gaps and a recommendation.',
  marketing:
    'Turn this goal into a channel plan with messaging, calls to action and one measurable experiment.',
  creative: 'Write the finished content this goal needs, with two variants of the key piece.',
  analytics: 'Define success metrics, tracking and a simple reporting plan for this goal.',
  engineering:
    'Outline technical requirements, risks and a step-by-step implementation plan for this goal.',
  operations: 'Create the execution checklist with owners, dates, dependencies and risks.',
  compliance:
    'Review the planned claims, legal and privacy risks, and list exactly what the CEO must verify.',
  personal: 'Prepare the people or personal-productivity side of this goal with a practical plan.',
};
export function planMission(goal, company, catalog, workerStates = {}) {
  const skillsById = new Map(catalog.skills.map((s) => [s.id, s]));
  const words = tokens(goal);
  const goalHints = Object.entries({
    social: /social|linkedin|twitter|\bx\b|instagram|post|followers|audience/i,
    content: /blog|article|content|copy\b/i,
    seo: /seo|google|rank|search|keyword/i,
    leads: /lead|sales|pipeline|customers|sign.?ups|demo/i,
    launch: /launch|release|announce|go.to.market|gtm/i,
    email: /email|newsletter|sequence/i,
    ads: /\bads?\b|paid|campaign budget|meta ads|google ads/i,
    brand: /brand|position|messag|tagline|name/i,
    pr: /press|pr\b|media|influencer/i,
    video: /video|youtube|reel|tiktok|podcast/i,
    research: /research|competitor|market|survey|interview/i,
    pricing: /pric|revenue model|monetiz/i,
    fundraising: /fundrais|investor|pitch deck|seed|series/i,
    analytics: /metric|kpi|dashboard|analytic|data/i,
    engineering: /code|api|bug|security|architecture|app|website build|tech/i,
    support: /support|customer service|faq|help center|churn/i,
    legal: /legal|privacy|terms|contract|gdpr|compliance|trademark/i,
    operations: /okr|process|sop|plan the quarter|operations|meeting/i,
    hiring: /hire|hiring|recruit|job description|onboard/i,
    personal: /productiv|burnout|habit|focus|my week/i,
    career: /job search|resume|interview prep|my career/i,
  }).filter(([, re]) => re.test(goal));
  const score = new Map();
  const add = (id, pts) => score.set(id, (score.get(id) || 0) + pts);
  for (const [g] of goalHints) (GOAL_TEAMS[g] || []).forEach((id, i) => add(id, 8 - i));
  for (const worker of catalog.workers) {
    if (worker.id === 'job-hunter') continue;
    // A goal that names the role ("LinkedIn", "SEO", "blog") points straight at the specialist.
    const roleWords = tokens(
      `${worker.id.replace(/^employee-/, '')} ${worker.name} ${worker.title}`,
    );
    const direct = [...roleWords].filter((w) => words.has(w)).length;
    const skillOverlap = Math.min(
      3,
      [...workerVocabulary(worker, skillsById)].filter((w) => words.has(w)).length,
    );
    add(worker.id, direct * 5 + skillOverlap);
    if (worker.head) add(worker.id, -4);
    if (workerStates[worker.id]?.deployment === 'deployed') add(worker.id, 2);
    if (workerStates[worker.id]?.busy) add(worker.id, -1);
  }
  let ranked = [...score.entries()]
    .filter(
      ([id, pts]) => pts > 0 && catalog.workers.some((w) => w.id === id) && id !== 'job-hunter',
    )
    .sort((a, b) => b[1] - a[1]);
  // Drop weak matches so a narrow goal gets a focused team.
  if (ranked.length) ranked = ranked.filter(([, pts]) => pts >= ranked[0][1] * 0.35);
  // One or two people per department keeps the plan varied and parallel.
  const picked = [],
    perDept = {};
  for (const [id] of ranked) {
    const worker = catalog.workers.find((w) => w.id === id);
    if ((perDept[worker.department] || 0) >= 2) continue;
    perDept[worker.department] = (perDept[worker.department] || 0) + 1;
    picked.push(worker);
    if (picked.length >= 5) break;
  }
  if (!picked.length) picked.push(catalog.workers.find((w) => w.id === 'research-planner'));
  const context = company ? ` Company: ${company.companyName}.` : '';
  return {
    summary: `A ${picked.length}-person plan for: “${goal}”. Each employee delivers a draft or plan for your review; nothing external happens without your approval.`,
    tasks: picked.map((worker) => {
      const own = ROLE_TASKS[worker.id]?.[0];
      const angle = ANGLES[worker.department] || ANGLES.operations;
      return {
        workerId: worker.id,
        brief:
          `Goal from the CEO: ${goal}.${context}\n\nYour part as ${worker.title}: ${angle}${own ? ` Where it fits, build on this: ${fill(own.brief, worker, company)}` : ''}`.slice(
            0,
            1500,
          ),
        why: `${worker.title} — ${worker.persona.traits.join(', ').toLowerCase()}`,
        kind: 'report',
      };
    }),
  };
}
