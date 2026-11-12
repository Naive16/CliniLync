/**
 * Public Clinilync product landing page.
 * Explains the platform in customer language while keeping the authenticated
 * staff workspace and patient portal on their existing routes.
 */
import React from 'react';
import {
  Activity, ArrowRight, ArrowUpRight, CalendarDays, CheckCircle2,
  ClipboardList, CreditCard, FileHeart, HeartPulse, LockKeyhole,
  Menu, Pill, ShieldCheck, Stethoscope, Users, X, Building2, UserRound
} from 'lucide-react';

interface LandingViewProps {
  onNavigate: (path: string) => void;
}

const modules = [
  {
    icon: UserRound,
    title: 'Patient management',
    description: 'Patient profiles and records in one place.',
    label: 'Patient records',
  },
  {
    icon: Stethoscope,
    title: 'Clinical workflows',
    description: 'Notes, encounters and care plans.',
    label: 'Clinical care',
  },
  {
    icon: CalendarDays,
    title: 'Appointments',
    description: 'A clear view of the clinic schedule.',
    label: 'Scheduling',
  },
  {
    icon: Pill,
    title: 'Prescriptions',
    description: 'Connected medication workflows.',
    label: 'Medication',
  },
  {
    icon: CreditCard,
    title: 'Billing',
    description: 'Billing alongside daily clinic operations.',
    label: 'Administration',
  },
  {
    icon: Users,
    title: 'Teams and departments',
    description: 'Staff, roles and departments.',
    label: 'People & teams',
  },
];

const audiences = [
  { icon: Building2, title: 'Clinic owners', description: 'See your clinic at a glance.' },
  { icon: ClipboardList, title: 'Administrators', description: 'Manage staff and daily operations.' },
  { icon: Stethoscope, title: 'Doctors and nurses', description: 'The right patient information, when needed.' },
  { icon: HeartPulse, title: 'Patients', description: 'A dedicated patient portal.' },
];

export const LandingView: React.FC<LandingViewProps> = ({ onNavigate }) => {
  const [menuOpen, setMenuOpen] = React.useState(false);

  const go = (path: string) => {
    setMenuOpen(false);
    onNavigate(path);
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-2.5 text-left" aria-label="Clinilync home">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-white shadow-sm"><Activity className="h-5 w-5" /></span>
            <span className="text-xl font-extrabold tracking-tight text-slate-900">clinilync<span className="text-teal-700">.</span></span>
          </button>

          <nav className="hidden items-center gap-8 md:flex" aria-label="Main navigation">
            <a href="#platform" className="text-sm font-medium text-slate-600 transition hover:text-teal-700">Platform</a>
            <a href="#solutions" className="text-sm font-medium text-slate-600 transition hover:text-teal-700">Who it's for</a>
            <a href="#how-it-works" className="text-sm font-medium text-slate-600 transition hover:text-teal-700">How it works</a>
            <a href="#security" className="text-sm font-medium text-slate-600 transition hover:text-teal-700">Security</a>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <button type="button" onClick={() => go('/login')} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">Sign in</button>
            <button type="button" onClick={() => go('/register')} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800">
              Get started <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>

          <button type="button" className="rounded-lg border border-slate-200 p-2 text-slate-700 md:hidden" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {menuOpen && (
          <div className="border-t border-slate-200 bg-white px-5 py-4 md:hidden">
            <nav className="flex flex-col gap-1" aria-label="Mobile navigation">
              <a onClick={() => setMenuOpen(false)} href="#platform" className="rounded-lg px-3 py-3 text-sm font-medium text-slate-700">Platform</a>
              <a onClick={() => setMenuOpen(false)} href="#solutions" className="rounded-lg px-3 py-3 text-sm font-medium text-slate-700">Who it's for</a>
              <a onClick={() => setMenuOpen(false)} href="#how-it-works" className="rounded-lg px-3 py-3 text-sm font-medium text-slate-700">How it works</a>
              <a onClick={() => setMenuOpen(false)} href="#security" className="rounded-lg px-3 py-3 text-sm font-medium text-slate-700">Security</a>
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                <button type="button" onClick={() => go('/login')} className="rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">Sign in</button>
                <button type="button" onClick={() => go('/register')} className="rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white">Get started</button>
              </div>
            </nav>
          </div>
        )}
      </header>

      <main>
        <section className="relative overflow-hidden bg-slate-50">
          <div className="pointer-events-none absolute -right-28 -top-32 h-96 w-96 rounded-full bg-emerald-50/70 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-slate-100/70 blur-3xl" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.02fr_0.98fr] lg:gap-12 lg:py-28">
            <div className="max-w-2xl">
              <h1 className="text-4xl font-extrabold leading-[1.12] tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                Clinic management,
                <span className="mt-2 block text-teal-700">made simpler.</span>
              </h1>
              <p className="mt-7 max-w-xl text-base leading-8 text-slate-600 sm:text-lg">
                Patients, appointments and clinical work in one place.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={() => go('/register')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-teal-900/10 transition hover:-translate-y-0.5 hover:bg-teal-800">
                  Get started <ArrowRight className="h-4 w-4" />
                </button>
                <a href="#platform" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-bold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50">
                  Explore features
                </a>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-xl">
              <div className="absolute -inset-5 rounded-[2rem] bg-slate-100 blur-xl" />
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-white"><Activity className="h-4 w-4" /></span>
                    <div><div className="text-xs font-bold text-slate-900">Clinilync workspace</div><div className="text-[10px] text-slate-500">Clinic overview</div></div>
                  </div>
                  
                </div>
                <div className="grid grid-cols-[108px_1fr] sm:grid-cols-[132px_1fr]">
                  <aside className="min-h-[300px] border-r border-slate-100 bg-slate-50 p-3">
                    <div className="mb-5 h-2 w-16 rounded bg-slate-200" />
                    {['Overview', 'Patients', 'Appointments', 'Clinical', 'Billing'].map((item, index) => (
                      <div key={item} className={`mb-2 flex items-center gap-2 rounded-lg px-2 py-2 text-[9px] font-semibold ${index === 0 ? 'bg-teal-100 text-teal-800' : 'text-slate-500'}`}>
                        <span className={`h-2 w-2 rounded-sm ${index === 0 ? 'bg-teal-700' : 'bg-slate-300'}`} />{item}
                      </div>
                    ))}
                  </aside>
                  <div className="p-4 sm:p-5">
                    <div className="mb-1 text-[10px] font-medium text-slate-500">Facility overview</div>
                    <div className="mb-4 text-base font-bold text-slate-900 sm:text-lg">Your clinic at a glance</div>
                    <div className="grid grid-cols-2 gap-2">
                      {[{label:'Patient records',value:'Organised',icon:Users},{label:'Appointments',value:'Coordinated',icon:CalendarDays},{label:'Clinical care',value:'Connected',icon:FileHeart},{label:'Administration',value:'Centralised',icon:ClipboardList}].map((item) => (
                        <div key={item.label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <item.icon className="mb-3 h-4 w-4 text-teal-700" />
                          <div className="text-[9px] text-slate-500">{item.label}</div>
                          <div className="mt-1 text-[11px] font-bold text-slate-800">{item.value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 rounded-xl border border-slate-100 p-3">
                      <div className="mb-3 flex items-center justify-between"><span className="text-[10px] font-bold text-slate-800">Connected workflows</span><Activity className="h-3.5 w-3.5 text-teal-700" /></div>
                      <div className="space-y-2.5">
                        {['Patient information','Care team coordination','Clinic administration'].map((item, index) => (
                          <div key={item} className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-50 text-[9px] font-bold text-teal-700">{index + 1}</span><span className="text-[9px] font-medium text-slate-600">{item}</span><span className="ml-auto h-1.5 w-12 rounded-full bg-teal-100"><span className="block h-1.5 w-2/3 rounded-full bg-teal-600" /></span></div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-t border-slate-100 bg-white px-5 py-3 text-[9px] text-slate-400">Illustrative product preview · Not live patient data</div>
              </div>
            </div>
          </div>
        </section>

        <section id="platform" className="scroll-mt-24 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">The Clinilync platform</div>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">Everything your clinic needs.</h2>
              <p className="mt-5 text-base leading-7 text-slate-600">One workspace for your daily operations.</p>
            </div>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {modules.map((module, index) => (
                <article key={module.title} className="group rounded-2xl border border-slate-200 bg-white p-6 transition duration-200 hover:-translate-y-1 hover:border-teal-200 hover:shadow-xl hover:shadow-slate-900/5">
                  <div className="flex items-center justify-between">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-700 transition group-hover:bg-teal-700 group-hover:text-white"><module.icon className="h-5 w-5" /></span>
                    <span className="text-xs font-semibold text-slate-600">0{index + 1}</span>
                  </div>
                  <div className="mt-6 text-[10px] font-bold uppercase tracking-wider text-teal-700">{module.label}</div>
                  <h3 className="mt-2 text-lg font-bold text-slate-900">{module.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{module.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-slate-100 bg-slate-50 py-20 sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">A connected patient journey</div>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">One connected patient journey.</h2>
              <p className="mt-5 text-base leading-7 text-slate-600">Keep patient care and clinic operations connected.</p>
              <button type="button" onClick={() => go('/register')} className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-teal-800 hover:text-teal-900">Explore Clinilync <ArrowRight className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {icon:UserRound,title:'Patient intake',copy:'Create and maintain organised patient records.'},
                {icon:CalendarDays,title:'Appointments',copy:'Coordinate visits and clinic schedules.'},
                {icon:Stethoscope,title:'Clinical workflows',copy:'Support encounters and patient-care documentation.'},
                {icon:ClipboardList,title:'Ongoing administration',copy:'Keep teams and essential clinic tasks connected.'},
              ].map((step,index)=>(
                <div key={step.title} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><step.icon className="h-5 w-5" /></span>
                  <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Step 0{index+1}</div><h3 className="mt-1 text-sm font-bold text-slate-900">{step.title}</h3><p className="mt-1.5 text-xs leading-5 text-slate-600">{step.copy}</p></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="solutions" className="scroll-mt-24 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="max-w-2xl">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Designed around your team</div>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">One platform for your whole team.</h2>
              <p className="mt-5 text-base leading-7 text-slate-600">Useful tools for every role.</p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {audiences.map((person)=>(
                <article key={person.title} className="rounded-2xl border border-slate-200 p-6">
                  <person.icon className="h-6 w-6 text-teal-700" />
                  <h3 className="mt-5 text-base font-bold text-slate-900">{person.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{person.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-24 bg-slate-50 py-20 text-slate-900 sm:py-24">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Getting started</div>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Set up in three steps.</h2>
              <p className="mt-5 text-base leading-7 text-slate-300">Create your clinic. Invite your team. Get started.</p>
            </div>
            <div className="mt-12 grid gap-8 md:grid-cols-3">
              {[
                {number:'01',title:'Create your organisation',copy:'Register your clinic.'},
                {number:'02',title:'Set up your clinic',copy:'Add your departments.'},
                {number:'03',title:'Bring in your team',copy:'Invite your team.'},
              ].map((step)=>(
                <div key={step.number} className="border-t border-slate-700 pt-6">
                  <div className="text-sm font-bold tracking-widest text-teal-300">{step.number}</div>
                  <h3 className="mt-4 text-lg font-bold">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-300">{step.copy}</p>
                </div>
              ))}
            </div>

          </div>
        </section>

        <section id="security" className="scroll-mt-24 py-20 sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-800"><ShieldCheck className="h-7 w-7" /></div>
              
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">Patient data, handled responsibly.</h2>
              <p className="mt-5 text-base leading-7 text-slate-600">Role-based access, organisation separation and activity records.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-6"><LockKeyhole className="h-5 w-5 text-teal-700" /><h3 className="mt-4 text-sm font-bold text-slate-900">Controlled access</h3><p className="mt-2 text-sm leading-6 text-slate-600">Access follows each person's role.</p></div>
              <div className="rounded-2xl border border-slate-200 p-6"><ShieldCheck className="h-5 w-5 text-teal-700" /><h3 className="mt-4 text-sm font-bold text-slate-900">Organisation separation</h3><p className="mt-2 text-sm leading-6 text-slate-600">Each organisation has its own data boundaries.</p></div>
              <div className="rounded-2xl border border-slate-200 p-6"><FileHeart className="h-5 w-5 text-teal-700" /><h3 className="mt-4 text-sm font-bold text-slate-900">Accountability</h3><p className="mt-2 text-sm leading-6 text-slate-600">Important activity is recorded.</p></div>
              <div className="rounded-2xl border border-slate-200 p-6"><Users className="h-5 w-5 text-teal-700" /><h3 className="mt-4 text-sm font-bold text-slate-900">Team-based workflows</h3><p className="mt-2 text-sm leading-6 text-slate-600">Permissions match team responsibilities.</p></div>
            </div>
          </div>
        </section>

        <section className="px-5 pb-20 sm:px-8 sm:pb-24">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-3xl bg-slate-900 px-6 py-12 text-center text-white sm:px-12 sm:py-16">
            <div className="mx-auto max-w-2xl">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Get started</div>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Your clinic, in sync.</h2>
              <p className="mt-5 text-base leading-7 text-teal-50">Bring your team onto Clinilync.</p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <button type="button" onClick={() => go('/register')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-teal-900 transition hover:bg-teal-50">Get started <ArrowRight className="h-4 w-4" /></button>
                <button type="button" onClick={() => go('/login')} className="rounded-xl border border-teal-300 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-teal-700">Sign in</button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-8 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div><div className="text-lg font-extrabold tracking-tight text-slate-900">clinilync<span className="text-teal-700">.</span></div><p className="mt-1 text-xs text-slate-500">Healthcare operations, connected.</p></div>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-xs font-medium text-slate-500"><a href="#platform" className="hover:text-teal-700">Platform</a><a href="#solutions" className="hover:text-teal-700">Who it's for</a><a href="#security" className="hover:text-teal-700">Security</a><button type="button" onClick={() => go('/patient/login')} className="hover:text-teal-700">Patient portal</button><button type="button" onClick={() => go('/login')} className="hover:text-teal-700">Sign in</button></div>
          <div className="text-xs text-slate-400">© {new Date().getFullYear()} Clinilync. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
};
