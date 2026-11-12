import React from 'react';
import { Activity, ArrowRight, ArrowUpRight, Bell, CalendarDays, CheckCircle2, Clock3, CreditCard, LayoutDashboard, Plus, Search, Users } from 'lucide-react';

interface LandingViewProps { onNavigate: (path: string) => void; }

const DashboardPreview: React.FC = () => (
  <div className="cl-home-dashboard" aria-label="Illustrative Clinilync dashboard interface">
    <aside className="cl-home-dashboard-sidebar">
      <div className="cl-home-dashboard-brand"><span><Activity size={15} /></span><strong>clinilync<span>.</span></strong></div>
      <small className="cl-home-menu-label">WORKSPACE</small>
      <div className="cl-home-side-link is-active"><LayoutDashboard size={14} /> Dashboard</div>
      <div className="cl-home-side-link"><Users size={14} /> Patients</div>
      <div className="cl-home-side-link"><CalendarDays size={14} /> Appointments</div>
      <div className="cl-home-side-link"><CreditCard size={14} /> Billing</div>
      <div className="cl-home-side-link"><ChartIcon /> Reports</div>
      <div className="cl-home-side-bottom">Your clinic, in sync.</div>
    </aside>
    <section className="cl-home-dashboard-main">
      <div className="cl-home-dashboard-topbar"><strong>Dashboard</strong><div className="cl-home-search"><Search size={12} /> Search patients, appointments...</div><button aria-label="Notifications"><Bell size={15} /></button><span className="cl-home-avatar">A</span></div>
      <div className="cl-home-dashboard-content">
        <div className="cl-home-greeting"><div><small>YOUR CLINIC AT A GLANCE</small><h3>Good morning</h3><p>Here’s what’s happening in your workspace.</p></div><button><Plus size={13} /> Add patient</button></div>
        <div className="cl-home-metrics">
          <div><span><Users size={14} /></span><small>Patient records</small><strong>Organised</strong><em>One clear patient view</em></div>
          <div><span><CalendarDays size={14} /></span><small>Appointments</small><strong>In one place</strong><em>Keep the day on track</em></div>
          <div><span><CreditCard size={14} /></span><small>Clinic operations</small><strong>Connected</strong><em>Less switching between tasks</em></div>
        </div>
        <div className="cl-home-lower-grid">
          <div className="cl-home-panel"><div className="cl-home-panel-heading"><strong>Today’s schedule</strong><span>View calendar <ArrowUpRight size={11} /></span></div><div className="cl-home-appointment"><span className="cl-home-time">09:00</span><span className="cl-home-person"><b className="cl-home-person-avatar">JM</b><span><strong>Patient appointment</strong><small>Consultation</small></span></span><em><Clock3 size={10} /> Scheduled</em></div><div className="cl-home-appointment"><span className="cl-home-time">10:30</span><span className="cl-home-person"><b className="cl-home-person-avatar is-alt">TK</b><span><strong>Patient follow-up</strong><small>Review visit</small></span></span><em><CheckCircle2 size={10} /> Confirmed</em></div><div className="cl-home-appointment"><span className="cl-home-time">11:15</span><span className="cl-home-person"><b className="cl-home-person-avatar is-third">AN</b><span><strong>New patient visit</strong><small>Initial consultation</small></span></span><em><Clock3 size={10} /> Scheduled</em></div></div>
          <div className="cl-home-panel cl-home-activity"><div className="cl-home-panel-heading"><strong>Keep things moving</strong><span>Today</span></div><div className="cl-home-activity-item"><CheckCircle2 size={14} /><span><strong>Patient information</strong><small>Keep records up to date</small></span></div><div className="cl-home-activity-item"><CalendarDays size={14} /><span><strong>Appointment planning</strong><small>See what’s coming up</small></span></div><div className="cl-home-activity-item"><Users size={14} /><span><strong>Team coordination</strong><small>Work from one shared space</small></span></div></div>
        </div>
      </div>
    </section>
  </div>
);

const ChartIcon: React.FC = () => <Activity size={14} />;

export const LandingView: React.FC<LandingViewProps> = ({ onNavigate }) => (
  <div className="clinilync-public-page min-h-screen bg-white text-slate-900">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
        <button type="button" onClick={() => onNavigate('/')} className="flex items-center gap-2.5 text-left" aria-label="Clinilync home"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-white"><Activity className="h-5 w-5" /></span><span className="text-xl font-extrabold tracking-tight text-slate-900">clinilync<span className="text-teal-700">.</span></span></button>
        <nav className="hidden items-center gap-7 md:flex" aria-label="Main navigation">
          <button onClick={() => onNavigate('/platform')} className="text-sm font-medium text-slate-600 hover:text-teal-700">Platform</button>
          <button onClick={() => onNavigate('/solutions')} className="text-sm font-medium text-slate-600 hover:text-teal-700">Who it's for</button>
          <button onClick={() => onNavigate('/how-it-works')} className="text-sm font-medium text-slate-600 hover:text-teal-700">How it works</button>
          <button onClick={() => onNavigate('/security')} className="text-sm font-medium text-slate-600 hover:text-teal-700">Security</button>
        </nav>
        <div className="flex items-center gap-2"><button type="button" onClick={() => onNavigate('/login')} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Sign in</button><button type="button" onClick={() => onNavigate('/register')} className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">Get started</button></div>
      </div>
      <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 border-t border-slate-100 px-4 py-3 md:hidden" aria-label="Mobile navigation">
        <button onClick={() => onNavigate('/platform')} className="text-xs font-medium text-slate-600">Platform</button><button onClick={() => onNavigate('/solutions')} className="text-xs font-medium text-slate-600">Who it's for</button><button onClick={() => onNavigate('/how-it-works')} className="text-xs font-medium text-slate-600">How it works</button><button onClick={() => onNavigate('/security')} className="text-xs font-medium text-slate-600">Security</button>
      </nav>
    </header>
    <main>
      <section className="cl-home-hero">
        <div className="cl-home-hero-copy">
          <span className="cl-home-eyebrow">A clearer way to run your clinic</span>
          <h1>Clinic management, simplified for <span>better connected care.</span></h1>
          <p>Bring patient records, appointments and everyday clinic work together. Give your team a clearer view of the day, and more time to focus on people.</p>
          <div className="cl-home-hero-actions"><button type="button" onClick={() => onNavigate('/register')} className="cl-home-primary">Get started <ArrowRight size={15} /></button><button type="button" onClick={() => onNavigate('/platform')} className="cl-home-secondary">Explore the platform</button></div>
          <div className="cl-home-hero-note"><CheckCircle2 size={14} /> Designed to bring your clinic workflows into one place</div>
        </div>
        <div className="cl-home-preview-wrap"><DashboardPreview /></div>
      </section>
      <section className="cl-home-features">
        <div className="cl-home-section-intro"><span>THE CLINILYNC WORKSPACE</span><h2>Everything your team needs to stay in sync.</h2><p>Simple tools for the work that keeps a clinic moving.</p></div>
        <div className="cl-home-feature-grid">
          <article><span><Users size={19} /></span><h3>Patient records</h3><p>Keep patient information organised and accessible to the right team members.</p></article>
          <article><span><CalendarDays size={19} /></span><h3>Appointments</h3><p>Coordinate schedules and keep upcoming visits clear for your team.</p></article>
          <article><span><Activity size={19} /></span><h3>Clinic operations</h3><p>Bring everyday workflows into one shared workspace.</p></article>
        </div>
        <div className="cl-home-bottom-cta"><div><h2>A more organised clinic starts with one workspace.</h2><p>See how Clinilync can support your team's day-to-day work.</p></div><button type="button" onClick={() => onNavigate('/register')}>Get started <ArrowRight size={15} /></button></div>
      </section>
    </main>
    <footer className="border-t border-slate-200 bg-white px-5 py-7 text-center text-xs text-slate-500">© {new Date().getFullYear()} Clinilync</footer>
  </div>
);
