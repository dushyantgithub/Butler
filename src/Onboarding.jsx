import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Cloud,
  Cpu,
  Lock,
  Plus,
  Rocket,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { EmployeeFigure } from './EmployeeFigure.jsx';
import { FaceAvatar, api, deptOf } from './ui.jsx';
import { SKIN_TONES, HAIR_STYLES, HAIR_COLORS } from '../shared/roster.js';

const INDUSTRIES = [
  'SaaS',
  'E-commerce',
  'Consumer app',
  'AI / ML',
  'Agency',
  'Creator',
  'Restaurant & food',
  'Education',
  'Healthcare',
  'Fintech',
  'Media',
  'Real estate',
  'Non-profit',
  'Hardware',
];
const VOICE_TAGS = [
  'Friendly',
  'Professional',
  'Bold',
  'Witty',
  'Technical',
  'Warm',
  'Inspiring',
  'Minimal',
  'Playful',
  'Authoritative',
];
const HAIR_NAMES = {
  short: 'Short',
  side: 'Side part',
  long: 'Long',
  bob: 'Bob',
  bun: 'Bun',
  afro: 'Afro',
  curly: 'Curly',
  ponytail: 'Ponytail',
  buzz: 'Buzz',
  braids: 'Braids',
  wavy: 'Wavy',
  spiky: 'Spiky',
  wrap: 'Head wrap',
  bald: 'Bald',
};

export const blankCompany = {
  ceo: {
    name: '',
    avatar: { skin: 3, hair: 'side', hairColor: 1, facial: 'none', glasses: 'none' },
  },
  companyName: '',
  website: '',
  industry: '',
  stage: 'startup',
  tagline: '',
  description: '',
  mission: '',
  products: [{ name: '', description: '', audience: '', price: '', url: '' }],
  audience: '',
  regions: '',
  competitors: '',
  goals: [],
  needs: '',
  channels: [],
  voice: '',
  voiceTags: [],
  facts: '',
  restrictions: '',
  sources: [],
  approvals: { verifyFacts: true, outreach: true, spending: true },
  teamSize: 'balanced',
};
export function fromCompany(company) {
  if (!company) return structuredClone(blankCompany);
  const { updatedAt, onboardedAt, ...rest } = company;
  return {
    ...structuredClone(blankCompany),
    ...rest,
    ceo: {
      ...blankCompany.ceo,
      ...rest.ceo,
      avatar: { ...blankCompany.ceo.avatar, ...rest.ceo?.avatar },
    },
    products: rest.products?.length ? rest.products : structuredClone(blankCompany.products),
  };
}
export function cleanCompany(form) {
  return {
    ...form,
    products: form.products.filter((p) => p.name.trim()).map((p) => ({ ...p, url: p.url.trim() })),
    sources: (Array.isArray(form.sources) ? form.sources : String(form.sources).split('\n'))
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8),
    website: form.website.trim(),
  };
}

function Chips({ options, value, onChange, multi = true, labels }) {
  const list = Array.isArray(options) ? options : Object.keys(options);
  return (
    <div className="g-chips" role="group">
      {list.map((key) => {
        const on = multi ? value.includes(key) : value === key;
        return (
          <button
            type="button"
            key={key}
            className={on ? 'on' : ''}
            aria-pressed={on}
            onClick={() =>
              onChange(multi ? (on ? value.filter((v) => v !== key) : [...value, key]) : key)
            }
          >
            {on && multi && <Check size={13} />}
            {labels?.[key] || (Array.isArray(options) ? key : options[key])}
          </button>
        );
      })}
    </div>
  );
}
function Field({ label, hint, children, wide }) {
  return (
    <label className={`g-field ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

// Every question, grouped so the wizard and the Company page share one form.
export function CompanySections({ form, setForm, options, only }) {
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setProduct = (i, key, value) =>
    setForm((f) => ({
      ...f,
      products: f.products.map((p, j) => (j === i ? { ...p, [key]: value } : p)),
    }));
  const avatar = form.ceo.avatar;
  const setAvatar = (key, value) =>
    setForm((f) => ({ ...f, ceo: { ...f.ceo, avatar: { ...f.ceo.avatar, [key]: value } } }));
  const show = (id) => !only || only === id;
  return (
    <>
      {show('you') && (
        <section className="g-form-section" id="section-you">
          <h3>You, the CEO</h3>
          <div className="ceo-builder">
            <div className="ceo-preview">
              <EmployeeFigure
                key={JSON.stringify(avatar)}
                worker={{ id: 'ceo-preview', ceo: true, avatar, department: null }}
                mode="hover"
              />
            </div>
            <div className="ceo-controls">
              <Field label="Your name">
                <input
                  required
                  maxLength={60}
                  value={form.ceo.name}
                  placeholder="What should your team call you?"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, ceo: { ...f.ceo, name: e.target.value } }))
                  }
                />
              </Field>
              <div className="g-field">
                <span>Skin tone</span>
                <div className="swatches">
                  {SKIN_TONES.map((c, i) => (
                    <button
                      type="button"
                      key={c}
                      aria-label={`Skin tone ${i + 1}`}
                      className={avatar.skin === i ? 'on' : ''}
                      style={{ background: c }}
                      onClick={() => setAvatar('skin', i)}
                    />
                  ))}
                </div>
              </div>
              <div className="g-field">
                <span>Hair</span>
                <Chips
                  options={HAIR_STYLES}
                  labels={HAIR_NAMES}
                  value={avatar.hair}
                  multi={false}
                  onChange={(v) => setAvatar('hair', v)}
                />
                <div className="swatches small">
                  {HAIR_COLORS.map((c, i) => (
                    <button
                      type="button"
                      key={c}
                      aria-label={`Hair colour ${i + 1}`}
                      className={avatar.hairColor === i ? 'on' : ''}
                      style={{ background: c }}
                      onClick={() => setAvatar('hairColor', i)}
                    />
                  ))}
                </div>
              </div>
              <div className="g-row">
                <div className="g-field">
                  <span>Facial hair</span>
                  <Chips
                    options={{
                      none: 'None',
                      stubble: 'Stubble',
                      beard: 'Beard',
                      mustache: 'Mustache',
                    }}
                    value={avatar.facial}
                    multi={false}
                    onChange={(v) => setAvatar('facial', v)}
                  />
                </div>
                <div className="g-field">
                  <span>Glasses</span>
                  <Chips
                    options={{ none: 'None', round: 'Round', square: 'Square' }}
                    value={avatar.glasses}
                    multi={false}
                    onChange={(v) => setAvatar('glasses', v)}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
      {show('company') && (
        <section className="g-form-section">
          <h3>Your company</h3>
          <div className="g-grid">
            <Field label="Company name">
              <input
                required
                maxLength={100}
                value={form.companyName}
                placeholder="e.g. Chai Labs"
                onChange={(e) => set('companyName', e.target.value)}
              />
            </Field>
            <Field label="Website" hint="Public HTTPS address. Employees read it for context.">
              <input
                type="url"
                maxLength={600}
                value={form.website}
                placeholder="https://"
                onChange={(e) => set('website', e.target.value)}
              />
            </Field>
            <Field label="Industry" wide>
              <input
                maxLength={80}
                value={form.industry}
                placeholder="Type or pick below"
                onChange={(e) => set('industry', e.target.value)}
              />
              <div className="g-chips compact">
                {INDUSTRIES.map((i) => (
                  <button
                    type="button"
                    key={i}
                    className={form.industry === i ? 'on' : ''}
                    onClick={() => set('industry', i)}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </Field>
            <div className="g-field wide">
              <span>Stage</span>
              <Chips
                options={options.stages}
                value={form.stage}
                multi={false}
                onChange={(v) => set('stage', v)}
              />
            </div>
            <Field label="One-line tagline" wide>
              <input
                maxLength={200}
                value={form.tagline}
                placeholder="What you do, in one breath"
                onChange={(e) => set('tagline', e.target.value)}
              />
            </Field>
            <Field
              label="What does the company do?"
              hint="The more specific, the better your team's work."
              wide
            >
              <textarea
                required
                minLength={10}
                maxLength={3000}
                rows={4}
                value={form.description}
                placeholder="Who you serve, the problem you solve, how you're different…"
                onChange={(e) => set('description', e.target.value)}
              />
            </Field>
            <Field label="Mission (optional)" wide>
              <input
                maxLength={600}
                value={form.mission}
                onChange={(e) => set('mission', e.target.value)}
              />
            </Field>
          </div>
        </section>
      )}
      {show('products') && (
        <section className="g-form-section">
          <h3>Products & services</h3>
          <div className="product-list">
            {form.products.map((p, i) => (
              <div className="product-card" key={i}>
                <div className="g-grid">
                  <Field label="Name">
                    <input
                      maxLength={100}
                      value={p.name}
                      placeholder="Product or service"
                      onChange={(e) => setProduct(i, 'name', e.target.value)}
                    />
                  </Field>
                  <Field label="Price (optional)">
                    <input
                      maxLength={100}
                      value={p.price}
                      placeholder="e.g. ₹499/month"
                      onChange={(e) => setProduct(i, 'price', e.target.value)}
                    />
                  </Field>
                  <Field label="What it does" wide>
                    <textarea
                      rows={2}
                      maxLength={800}
                      value={p.description}
                      onChange={(e) => setProduct(i, 'description', e.target.value)}
                    />
                  </Field>
                  <Field label="Who it's for">
                    <input
                      maxLength={300}
                      value={p.audience}
                      onChange={(e) => setProduct(i, 'audience', e.target.value)}
                    />
                  </Field>
                  <Field label="Link (optional)">
                    <input
                      maxLength={600}
                      value={p.url}
                      placeholder="https://"
                      onChange={(e) => setProduct(i, 'url', e.target.value)}
                    />
                  </Field>
                </div>
                {form.products.length > 1 && (
                  <button
                    type="button"
                    className="g-icon-button subtle"
                    aria-label="Remove product"
                    onClick={() =>
                      set(
                        'products',
                        form.products.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
            {form.products.length < 12 && (
              <button
                type="button"
                className="g-button ghost"
                onClick={() =>
                  set('products', [
                    ...form.products,
                    { name: '', description: '', audience: '', price: '', url: '' },
                  ])
                }
              >
                <Plus size={15} /> Add another product
              </button>
            )}
          </div>
        </section>
      )}
      {show('market') && (
        <section className="g-form-section">
          <h3>Customers & market</h3>
          <div className="g-grid">
            <Field label="Who are your customers?" wide>
              <textarea
                rows={3}
                maxLength={1500}
                value={form.audience}
                placeholder="Roles, company sizes, needs, where they hang out…"
                onChange={(e) => set('audience', e.target.value)}
              />
            </Field>
            <Field label="Markets & regions">
              <input
                maxLength={300}
                value={form.regions}
                placeholder="e.g. India, UK, remote-first teams"
                onChange={(e) => set('regions', e.target.value)}
              />
            </Field>
            <Field label="Competitors or alternatives">
              <input
                maxLength={800}
                value={form.competitors}
                placeholder="Names or types of alternatives"
                onChange={(e) => set('competitors', e.target.value)}
              />
            </Field>
          </div>
        </section>
      )}
      {show('goals') && (
        <section className="g-form-section">
          <h3>What should Butler do for you?</h3>
          <div className="g-field wide">
            <span>Pick everything that matters now</span>
            <Chips options={options.goals} value={form.goals} onChange={(v) => set('goals', v)} />
          </div>
          <Field
            label="Anything specific?"
            hint="e.g. “Get 20 demo calls a month”, “Launch on Product Hunt in May”, “Weekly investor update”."
            wide
          >
            <textarea
              rows={3}
              maxLength={2000}
              value={form.needs}
              onChange={(e) => set('needs', e.target.value)}
            />
          </Field>
          <div className="g-field wide">
            <span>Channels you use</span>
            <Chips
              options={options.channels}
              value={form.channels}
              onChange={(v) => set('channels', v)}
            />
          </div>
        </section>
      )}
      {show('voice') && (
        <section className="g-form-section">
          <h3>Voice, facts & boundaries</h3>
          <div className="g-field wide">
            <span>Brand voice</span>
            <Chips
              options={VOICE_TAGS}
              value={form.voiceTags}
              onChange={(v) => set('voiceTags', v.slice(0, 8))}
            />
          </div>
          <div className="g-grid">
            <Field label="Voice notes" wide>
              <input
                maxLength={800}
                value={form.voice}
                placeholder="Words you love or avoid, emoji policy, reading level…"
                onChange={(e) => set('voice', e.target.value)}
              />
            </Field>
            <Field
              label="Confirmed facts & proof"
              hint="Only things you're happy to see in public copy. Your team won't invent numbers or testimonials."
              wide
            >
              <textarea
                rows={4}
                maxLength={6000}
                value={form.facts}
                onChange={(e) => set('facts', e.target.value)}
              />
            </Field>
            <Field label="Never say or promise" wide>
              <textarea
                rows={2}
                maxLength={2000}
                value={form.restrictions}
                onChange={(e) => set('restrictions', e.target.value)}
              />
            </Field>
            <Field
              label="Research pages · one HTTPS link per line"
              hint="Up to 8. Employees read your website plus up to 3 of these per task."
              wide
            >
              <textarea
                rows={3}
                value={Array.isArray(form.sources) ? form.sources.join('\n') : form.sources}
                onChange={(e) => set('sources', e.target.value.split('\n'))}
              />
            </Field>
          </div>
        </section>
      )}
      {show('rules') && (
        <section className="g-form-section">
          <h3>House rules</h3>
          <div className="rule-list">
            <div className="rule locked">
              <Lock size={16} />
              <div>
                <strong>Publishing always needs your approval</strong>
                <small>
                  Posts, articles and anything public wait on your desk. This can't be turned off.
                </small>
              </div>
            </div>
            {[
              [
                'verifyFacts',
                'Ask me to verify new claims',
                'Employees flag facts only you can confirm; approved ones join your facts.',
              ],
              [
                'outreach',
                'Approve emails and outreach',
                'Messages to real people wait for you. Butler never sends them itself.',
              ],
              [
                'spending',
                'Approve anything that costs money',
                'Budgets, tools and purchases always come to you first.',
              ],
            ].map(([key, title, text]) => (
              <label className="rule" key={key}>
                <input
                  type="checkbox"
                  checked={form.approvals[key]}
                  onChange={(e) => set('approvals', { ...form.approvals, [key]: e.target.checked })}
                />
                <div>
                  <strong>{title}</strong>
                  <small>{text}</small>
                </div>
              </label>
            ))}
          </div>
          <div className="g-field wide">
            <span>Team size</span>
            <Chips
              options={{
                lean: 'Lean · up to 8',
                balanced: 'Balanced · ~14',
                full: 'Full · ~24',
                all: 'Everyone relevant',
              }}
              value={form.teamSize}
              multi={false}
              onChange={(v) => set('teamSize', v)}
            />
          </div>
        </section>
      )}
    </>
  );
}

export function EngineChooser({ state, value, setValue }) {
  const providers = state.options.cloudProviders;
  const provider = providers[value.cloudProvider] || providers.anthropic;
  const configured = state.connections[value.cloudProvider];
  return (
    <div className="engine-chooser">
      <div className="engine-options">
        <button
          type="button"
          className={value.engine === 'local' ? 'on' : ''}
          onClick={() => setValue({ ...value, engine: 'local' })}
        >
          <Cpu size={22} />
          <strong>Local & private</strong>
          <small>
            Qwen on this computer via Ollama. One employee writes at a time; the rest queue.
          </small>
        </button>
        <button
          type="button"
          className={value.engine === 'cloud' ? 'on' : ''}
          onClick={() => setValue({ ...value, engine: 'cloud' })}
        >
          <Cloud size={22} />
          <strong>Cloud boost</strong>
          <small>
            Your own Anthropic or OpenAI key. Several employees work in parallel with stronger
            writing.
          </small>
        </button>
      </div>
      {value.engine === 'cloud' && (
        <div className="g-grid engine-cloud">
          <Field label="Provider">
            <select
              value={value.cloudProvider}
              onChange={(e) =>
                setValue({ ...value, cloudProvider: e.target.value, cloudModel: '' })
              }
            >
              {Object.entries(providers).map(([id, p]) => (
                <option key={id} value={id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Model">
            <input
              list="cloud-models"
              value={value.cloudModel}
              placeholder={provider.defaultModel}
              onChange={(e) => setValue({ ...value, cloudModel: e.target.value })}
            />
            <datalist id="cloud-models">
              {provider.models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
          <Field
            label={`API key ${configured ? '· saved' : ''}`}
            hint="Stored only in your private .env file. Never shown again or sent anywhere except the provider."
          >
            <input
              type="password"
              autoComplete="new-password"
              value={value.key}
              placeholder={configured ? 'Saved · paste to replace' : 'Paste your API key'}
              onChange={(e) => setValue({ ...value, key: e.target.value.trim() })}
            />
          </Field>
          <Field label={`Employees working at once · ${value.cloudConcurrency}`}>
            <input
              type="range"
              min={1}
              max={8}
              value={value.cloudConcurrency}
              onChange={(e) => setValue({ ...value, cloudConcurrency: Number(e.target.value) })}
            />
          </Field>
          <p className="g-note wide">
            When cloud is on, assignment briefs, your company profile and source excerpts are sent
            to {provider.name} to do the work. Usage is billed to your key.
          </p>
        </div>
      )}
    </div>
  );
}
export async function saveEngine(value, state) {
  const settings = {
    engine: value.engine,
    cloudProvider: value.cloudProvider,
    cloudModel: value.cloudModel.trim(),
    cloudConcurrency: value.cloudConcurrency,
    useModel: true,
  };
  if (value.key)
    await api('/connections', 'PUT', {
      [value.cloudProvider === 'openai' ? 'openaiKey' : 'anthropicKey']: value.key,
    });
  await api('/settings', 'PATCH', settings);
  if (value.engine === 'cloud' && !value.key && !state.connections[value.cloudProvider])
    return 'Cloud engine selected, but no API key is saved yet. Your team will use the local engine until you add one.';
  return '';
}

export function TeamPlan({ state, team, selected, setSelected }) {
  return (
    <div className="team-plan">
      {team.map((m) => {
        const worker = state.workers.find((w) => w.id === m.workerId);
        const dept = deptOf(state, m.department);
        const on = selected.includes(m.workerId);
        return (
          <label
            key={m.workerId}
            className={`plan-member ${on ? 'on' : ''}`}
            style={{ '--dept': dept?.color }}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, m.workerId]
                    : selected.filter((id) => id !== m.workerId),
                )
              }
            />
            <FaceAvatar worker={worker} size={46} />
            <div>
              <strong>
                {m.name} {m.head && <em className="head-badge">Head</em>}
              </strong>
              <small>
                {m.title} · {dept?.short}
              </small>
              <span className="reasons">{m.reasons.slice(0, 2).join(' · ')}</span>
              {m.starter && <span className="starter">First task: {m.starter.title}</span>}
            </div>
            <span className="check">
              <Check size={14} />
            </span>
          </label>
        );
      })}
    </div>
  );
}

const STEPS = [
  {
    id: 'you',
    title: 'Welcome to your office',
    subtitle:
      'First, let’s make your CEO minifig. Your team will walk over to you whenever something needs your OK.',
  },
  {
    id: 'company',
    title: 'Tell us about the company',
    subtitle:
      'Your employees use this in every piece of work. You can change it any time under Company.',
  },
  {
    id: 'products',
    title: 'What do you sell?',
    subtitle:
      'Add each product or service. Only include what you’re happy for the team to talk about.',
  },
  {
    id: 'market',
    title: 'Who are you for?',
    subtitle: 'Customers, markets and the alternatives they compare you with.',
  },
  {
    id: 'goals',
    title: 'What do you want done?',
    subtitle: 'Butler hires and assigns the right specialists based on these goals.',
  },
  {
    id: 'voice',
    title: 'Voice, proof & boundaries',
    subtitle: 'So nothing sounds off-brand and nothing is claimed that you haven’t confirmed.',
  },
  {
    id: 'rules',
    title: 'House rules',
    subtitle: 'Decide what needs your approval and how big a team to start with.',
  },
  { id: 'engine', title: 'Choose the brain', subtitle: 'Where your employees do their thinking.' },
  {
    id: 'team',
    title: 'Meet your team',
    subtitle:
      'Picked for your goals. Untick anyone you don’t need — you can hire more from the Team tab later.',
  },
];

export default function Onboarding({ state, onDone }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(() => fromCompany(null));
  const [engine, setEngine] = useState({
    engine: state.settings.engine || 'local',
    cloudProvider: state.settings.cloudProvider || 'anthropic',
    cloudModel: state.settings.cloudModel || '',
    cloudConcurrency: state.settings.cloudConcurrency || 3,
    key: '',
  });
  const [team, setTeam] = useState([]);
  const [selected, setSelected] = useState([]);
  const [starters, setStarters] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [working, setWorking] = useState(false);
  const current = STEPS[step];
  const valid = useMemo(() => {
    if (current.id === 'you') return form.ceo.name.trim().length > 0;
    if (current.id === 'company')
      return form.companyName.trim() && form.description.trim().length >= 10;
    if (current.id === 'goals') return form.goals.length > 0;
    if (current.id === 'team') return selected.length > 0;
    return true;
  }, [form, step, selected]);
  async function next() {
    setError('');
    setWorking(true);
    try {
      if (current.id === 'engine') {
        setNote(await saveEngine(engine, state));
        const plan = await api('/company/preview', 'POST', cleanCompany(form));
        setTeam(plan.team);
        setSelected(plan.team.map((m) => m.workerId));
      }
      if (current.id === 'team') {
        await api('/company', 'PUT', cleanCompany(form));
        const result = await api('/company/staff', 'POST', {
          workerIds: selected,
          starterTasks: starters,
        });
        onDone(result);
        return;
      }
      setStep(step + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <div className="onboarding" role="dialog" aria-modal="true" aria-label="Set up your office">
      <div className="onboarding-card">
        <div className="onboarding-top">
          <span className="app-glyph">
            <Sparkles size={18} />
          </span>
          <div className="progress-dots" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <i key={s.id} className={i === step ? 'on' : i < step ? 'done' : ''} />
            ))}
          </div>
          <span className="step-count">
            {step + 1} / {STEPS.length}
          </span>
        </div>
        <header>
          <h1>{current.title}</h1>
          <p>{current.subtitle}</p>
        </header>
        <div className="onboarding-body">
          {current.id === 'engine' ? (
            <EngineChooser state={state} value={engine} setValue={setEngine} />
          ) : current.id === 'team' ? (
            <>
              {note && <p className="g-note warn">{note}</p>}
              <div className="team-summary">
                <Users size={18} />
                <span>
                  {selected.length} of {team.length} recommended employees selected
                </span>
                <label className="g-switch-label">
                  <input
                    type="checkbox"
                    checked={starters}
                    onChange={(e) => setStarters(e.target.checked)}
                  />
                  Give everyone a first task right away
                </label>
              </div>
              <TeamPlan state={state} team={team} selected={selected} setSelected={setSelected} />
            </>
          ) : (
            <CompanySections
              form={form}
              setForm={setForm}
              options={state.options}
              only={current.id}
            />
          )}
        </div>
        {error && (
          <p className="g-error" role="alert">
            {error}
          </p>
        )}
        <footer className="onboarding-actions">
          {step > 0 && (
            <button
              type="button"
              className="g-button ghost"
              onClick={() => setStep(step - 1)}
              disabled={working}
            >
              <ChevronLeft size={16} /> Back
            </button>
          )}
          <span className="spacer" />
          <button
            type="button"
            className="g-button primary large"
            disabled={!valid || working}
            onClick={next}
          >
            {working ? (
              'Working…'
            ) : current.id === 'team' ? (
              <>
                <Rocket size={17} /> Open the office
              </>
            ) : current.id === 'engine' ? (
              <>
                Meet my team <ArrowRight size={17} />
              </>
            ) : (
              <>
                Continue <ArrowRight size={17} />
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}

// Company tab: every answer is editable later, and the team can be re-planned.
export function CompanyPage({ state, action, refresh, notify }) {
  const [form, setForm] = useState(() => fromCompany(state.company));
  const [saving, setSaving] = useState(false);
  const [team, setTeam] = useState(null);
  const [selected, setSelected] = useState([]);
  const [starters, setStarters] = useState(false);
  const [engine, setEngine] = useState({
    engine: state.settings.engine || 'local',
    cloudProvider: state.settings.cloudProvider || 'anthropic',
    cloudModel: state.settings.cloudModel || '',
    cloudConcurrency: state.settings.cloudConcurrency || 3,
    key: '',
  });
  useEffect(() => setForm(fromCompany(state.company)), [state.company?.updatedAt]);
  async function save(e) {
    e?.preventDefault();
    setSaving(true);
    await action(
      '/company',
      'PUT',
      cleanCompany(form),
      'Company profile saved. Your team will use it from the next task.',
    );
    setSaving(false);
  }
  async function replan() {
    try {
      const plan = await api('/company/preview', 'POST', cleanCompany(form));
      setTeam(plan.team);
      setSelected(
        plan.team
          .filter((m) => state.workers.find((w) => w.id === m.workerId)?.deployment !== 'deployed')
          .map((m) => m.workerId),
      );
    } catch (e) {
      notify(e.message);
    }
  }
  return (
    <form className="company-page" onSubmit={save}>
      <div className="page-header">
        <div>
          <div className="eyebrow">COMPANY PROFILE</div>
          <h1>{state.company?.companyName}</h1>
          <p>
            Everything your employees know about the business. Update it whenever things change.
          </p>
        </div>
        <div className="header-actions">
          <button className="g-button primary" disabled={saving}>
            <Check size={16} /> Save profile
          </button>
        </div>
      </div>
      <div className="company-layout">
        <div className="g-card">
          <CompanySections form={form} setForm={setForm} options={state.options} />
          <div className="sticky-save">
            <button className="g-button primary" disabled={saving}>
              <Check size={16} /> Save profile
            </button>
          </div>
        </div>
        <aside className="company-aside">
          <div className="g-card">
            <h3>AI engine</h3>
            <EngineChooser state={state} value={engine} setValue={setEngine} />
            <button
              type="button"
              className="g-button"
              onClick={async () => {
                try {
                  const warning = await saveEngine(engine, state);
                  setEngine({ ...engine, key: '' });
                  await refresh();
                  notify(warning || 'AI engine saved.');
                } catch (e) {
                  notify(e.message);
                }
              }}
            >
              Save engine
            </button>
          </div>
          <div className="g-card">
            <h3>Re-plan your team</h3>
            <p className="g-note">
              Changed goals or products? Butler can suggest who else to bring in.
            </p>
            <button type="button" className="g-button" onClick={replan}>
              <Sparkles size={15} /> Suggest a team
            </button>
            {team && (
              <>
                <TeamPlan state={state} team={team} selected={selected} setSelected={setSelected} />
                <label className="g-switch-label">
                  <input
                    type="checkbox"
                    checked={starters}
                    onChange={(e) => setStarters(e.target.checked)}
                  />
                  Give new hires a first task
                </label>
                <button
                  type="button"
                  className="g-button primary"
                  disabled={!selected.length}
                  onClick={async () => {
                    await save();
                    if (
                      await action(
                        '/company/staff',
                        'POST',
                        { workerIds: selected, starterTasks: starters },
                        `${selected.length} employees deployed.`,
                      )
                    )
                      setTeam(null);
                  }}
                >
                  <Users size={15} /> Deploy {selected.length} selected
                </button>
              </>
            )}
          </div>
        </aside>
      </div>
    </form>
  );
}
