import React from 'react';
import { Activity, ArrowRight } from 'lucide-react';
interface LandingViewProps { onNavigate: (path: string) => void; }
export const LandingView: React.FC<LandingViewProps> = ({ onNavigate }) => (
  <div className="min-h-screen bg-white text-slate-900">
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
    <main className="relative flex min-h-[68vh] items-center overflow-hidden bg-slate-50"><div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-emerald-50 blur-3xl" /><div className="relative mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 sm:py-28"><div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Clinic management platform</p><h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-slate-950 sm:text-6xl">Clinic management,<span className="block text-teal-700">made simpler.</span></h1><p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">A connected workspace for patient records, appointments and everyday clinic operations.</p><div className="mt-8 flex flex-wrap gap-3"><button type="button" onClick={() => onNavigate('/register')} className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-6 py-3.5 text-sm font-bold text-white hover:bg-teal-800">Get started <ArrowRight className="h-4 w-4" /></button><button type="button" onClick={() => onNavigate('/platform')} className="rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-bold text-slate-700 hover:bg-slate-100">Explore the platform</button></div></div></div></main>
    <footer className="border-t border-slate-200 bg-white px-5 py-7 text-center text-xs text-slate-500">© {new Date().getFullYear()} Clinilync</footer>
  </div>
);