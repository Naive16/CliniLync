import React from 'react';
import { Activity, ArrowLeft, ArrowRight, CalendarDays, ClipboardList, CreditCard, FileHeart, HeartPulse, LockKeyhole, Pill, ShieldCheck, Stethoscope, Users, UserRound, Building2 } from 'lucide-react';

type PageKey = 'platform' | 'solutions' | 'how-it-works' | 'security';
interface Props { page: PageKey; onNavigate: (path: string) => void; }
const pageContent = {
  platform: { eyebrow: 'The platform', title: 'The tools your clinic needs.', intro: 'Manage essential clinic work in one connected workspace.', items: [
    [UserRound,'Patient records','Keep patient profiles and clinical history organised.'],[CalendarDays,'Appointments','Coordinate visits and daily schedules.'],[Stethoscope,'Clinical workflows','Document encounters, notes and care plans.'],[Pill,'Prescriptions','Manage medication workflows.'],[CreditCard,'Billing','Keep billing close to clinic operations.'],[Users,'Teams and departments','Organise staff, roles and departments.']
  ]},
  solutions: { eyebrow: 'Who it’s for', title: 'One workspace for every role.', intro: 'Clinilync supports the people responsible for care and clinic operations.', items: [
    [Building2,'Clinic owners','Get a clearer view of clinic activity.'],[ClipboardList,'Administrators','Coordinate staff, departments and operations.'],[Stethoscope,'Doctors and nurses','Access the information needed for patient care.'],[HeartPulse,'Patients','Use a dedicated patient portal.']
  ]},
  'how-it-works': { eyebrow: 'Getting started', title: 'A clear path to your workspace.', intro: 'Set up your clinic in a few guided steps.', items: [
    [Building2,'Register your clinic','Create the organisation and first administrator account.'],[ShieldCheck,'Verify and configure','Verify the administrator email and add clinic details.'],[Users,'Set up your team','Create departments and invite staff.'],[Activity,'Activate your workspace','Review setup and open your clinic workspace.']
  ]},
  security: { eyebrow: 'Security', title: 'Patient data, handled responsibly.', intro: 'Access controls and organisation boundaries support responsible clinic operations.', items: [
    [LockKeyhole,'Controlled access','Permissions follow each person’s assigned role.'],[ShieldCheck,'Organisation separation','Each organisation has its own data boundaries.'],[FileHeart,'Accountability','Important activity is recorded.'],[Users,'Team-based workflows','Access is aligned with team responsibilities.']
  ]}
} as const;

export const PublicInfoView: React.FC<Props> = ({ page, onNavigate }) => {
  const content = pageContent[page];
  return <div className="clinilync-public-page min-h-screen bg-white text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-8 sm:py-4">
      <button type="button" onClick={() => onNavigate('/')} className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-700 text-white sm:h-10 sm:w-10"><Activity size={19}/></span><span className="text-lg font-extrabold tracking-tight sm:text-xl">clinilync<span className="text-teal-700">.</span></span></button>
      <nav className="hidden flex-wrap items-center gap-6 md:flex" aria-label="Main navigation">
        <button onClick={() => onNavigate('/platform')} className={page==='platform'?'text-sm font-bold text-teal-700':'text-sm font-medium text-slate-600 hover:text-teal-700'}>Platform</button><button onClick={() => onNavigate('/solutions')} className={page==='solutions'?'text-sm font-bold text-teal-700':'text-sm font-medium text-slate-600 hover:text-teal-700'}>Who it's for</button><button onClick={() => onNavigate('/how-it-works')} className={page==='how-it-works'?'text-sm font-bold text-teal-700':'text-sm font-medium text-slate-600 hover:text-teal-700'}>How it works</button><button onClick={() => onNavigate('/security')} className={page==='security'?'text-sm font-bold text-teal-700':'text-sm font-medium text-slate-600 hover:text-teal-700'}>Security</button>
      </nav>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2"><button onClick={() => onNavigate('/login')} className="rounded-lg px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 sm:px-3 sm:text-sm">Sign in</button><button onClick={() => onNavigate('/register')} className="rounded-lg bg-teal-700 px-3 py-2.5 text-xs font-semibold text-white hover:bg-teal-800 sm:px-4 sm:text-sm">Get started</button></div>
    </div><nav className="grid grid-cols-2 gap-2 border-t border-slate-100 px-4 py-3 md:hidden"><button onClick={() => onNavigate('/platform')} className="min-h-10 rounded-lg bg-slate-50 px-3 text-left text-xs font-semibold text-slate-700">Platform</button><button onClick={() => onNavigate('/solutions')} className="min-h-10 rounded-lg bg-slate-50 px-3 text-left text-xs font-semibold text-slate-700">Who it's for</button><button onClick={() => onNavigate('/how-it-works')} className="min-h-10 rounded-lg bg-slate-50 px-3 text-left text-xs font-semibold text-slate-700">How it works</button><button onClick={() => onNavigate('/security')} className="min-h-10 rounded-lg bg-slate-50 px-3 text-left text-xs font-semibold text-slate-700">Security</button></nav></header>
    <main className="min-h-[75vh] bg-slate-50"><div className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-20">
      <button onClick={() => onNavigate('/')} className="mb-6 inline-flex items-center gap-2 sm:mb-9 text-sm font-semibold text-slate-600 hover:text-teal-700"><ArrowLeft size={16}/> Home</button>
      <div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">{content.eyebrow}</p><h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-slate-950 sm:text-5xl">{content.title}</h1><p className="mt-4 max-w-2xl text-sm leading-6 sm:mt-5 sm:text-base sm:leading-7 text-slate-600 sm:text-lg">{content.intro}</p></div>
      <div className="mt-8 grid gap-3 sm:mt-12 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">{content.items.map(([Icon,title,description])=><article key={title} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Icon size={21}/></span><h2 className="mt-4 text-base font-bold text-slate-900 sm:mt-5">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p></article>)}</div>
      <div className="mt-8 sm:mt-12"><button onClick={() => onNavigate('/register')} className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-6 py-3.5 text-sm font-bold text-white hover:bg-teal-800">Get started <ArrowRight size={16}/></button></div>
    </div></main><footer className="border-t border-slate-200 bg-white px-5 py-7 text-center text-xs text-slate-500">© {new Date().getFullYear()} Clinilync</footer>
  </div>;
};
