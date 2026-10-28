import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation as useRoute } from 'react-router';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useAuth } from '../auth';
import { errorMessage } from '../api';
import { Avatar, Button, ErrorNote, Field, Input } from '../components/ui';
import { Plate } from '../components/Layout';
import { STAGE_BG } from '../components/space3d/Labels';
import { Showcase, TOUR } from '../components/space3d/Showcase';
import { reducedMotion } from '../components/space3d/three-kit';

const DEMO = [
  ['Platform admin', 'admin@coplaces.test'],
  ['Owner (Pro)', 'owner@nest.test'],
  ['Manager', 'manager@nest.test'],
  ['Front desk', 'frontdesk@nest.test'],
  ['Member', 'hamza.sheikh@example.pk'],
  ['Owner (Growth)', 'owner@hive.test'],
  ['Owner (Starter, trial)', 'owner@workbay.test'],
] as const;
const DEMO_PASSWORD = 'coplaces123';

/** Faint floor-plan grid behind the model, fading out towards the edges. */
const GRID: React.CSSProperties = {
  backgroundImage: 'linear-gradient(rgb(255 255 255 / 0.045) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.045) 1px, transparent 1px)',
  backgroundSize: '44px 44px',
  maskImage: 'radial-gradient(ellipse 70% 60% at 35% 50%, black 30%, transparent 85%)',
  WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 35% 50%, black 30%, transparent 85%)',
};

export default function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const tour = TOUR[step]!;

  // The tour walks through the sample building; it stays on the first stop for anyone who prefers no motion.
  useEffect(() => {
    if (reducedMotion()) return;
    const id = window.setInterval(() => setStep((n) => (n + 1) % TOUR.length), 4200);
    return () => window.clearInterval(id);
  }, []);

  // Someone who scanned a space's QR code and had to sign in first lands where they were going, not on the home page.
  const wanted = (useRoute().state as { from?: string } | null)?.from;
  if (user) return <Navigate to={wanted && wanted.startsWith('/') && !wanted.startsWith('//') && wanted !== '/login' ? wanted : '/'} replace />;

  async function signIn(mail: string, pass: string) {
    setBusy(true);
    setError(null);
    try {
      await login(mail, pass);
    } catch (err) {
      setError(new Error(errorMessage(err)));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void signIn(email, password);
  }

  return (
    <div className="on-ink relative isolate min-h-dvh overflow-hidden text-white" style={{ background: STAGE_BG }}>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={GRID} />
      {/* The model sits in the space left of the sign-in card. */}
      <Showcase bare className="absolute inset-0 hidden lg:block" canvasClass="top-64 bottom-32 left-0 right-[30rem] xl:right-[34rem]" step={step} />

      <div className="relative mx-auto flex min-h-dvh max-w-[92rem] flex-col lg:flex-row">
        <section className="pointer-events-none flex flex-col px-5 pt-6 sm:px-10 sm:pt-10 lg:flex-1 lg:p-12">
          <div className="flex items-center gap-3">
            <Plate code="CP" />
            <span className="display text-2xl">Coplaces</span>
          </div>
          <p className="display mt-8 max-w-xl text-[2rem] sm:text-[2.6rem] lg:mt-10">Your whole coworking space, in one view.</p>
          <p className="mt-3 max-w-md text-[15px] text-white/70">Rooms, desks, members, visitors and invoices, live on every floor you run.</p>

          <Showcase quiet className="pointer-events-auto relative mt-6 h-56 overflow-hidden rounded-2xl ring-1 ring-white/10 sm:h-72 lg:hidden" />

          <div className="mt-auto hidden pt-10 lg:block" aria-hidden>
            <div className="mb-4 flex gap-1.5">
              {TOUR.map((t, i) => (
                <span key={t.name} className={`h-1 rounded-full transition-all duration-500 ${i === step ? 'w-10 bg-signal' : 'w-5 bg-white/25'}`} />
              ))}
            </div>
            <div key={step} className="flip max-w-sm">
              <p className="display text-[1.5rem] leading-tight">{tour.title}</p>
              <p className="mt-1.5 text-[15px] leading-snug text-white/70">{tour.text}</p>
            </div>
          </div>
        </section>

        <section className="flex flex-1 items-start justify-center px-4 pt-6 pb-10 sm:px-10 lg:w-[30rem] lg:flex-none lg:items-center lg:py-10 xl:w-[34rem]">
          <div className="w-full max-w-[26rem] rounded-3xl bg-paper p-7 text-ink shadow-[0_30px_80px_-20px_rgb(0_0_0/0.55)] ring-1 ring-white/10 sm:p-9">
            <h1 className="display text-[1.9rem]">Welcome back</h1>
            <p className="mt-1.5 mb-7 text-sm text-slate">Sign in with the email and password your coworking space gave you.</p>

            <form onSubmit={submit} className="space-y-4">
              <Field label="Email">
                <div className="relative">
                  <Mail size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate" />
                  <Input
                    type="email"
                    autoComplete="username"
                    placeholder="you@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="!py-2.5 !pl-10"
                  />
                </div>
              </Field>
              <Field label="Password">
                <div className="relative">
                  <Lock size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="!py-2.5 !pr-11 !pl-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-md text-slate transition-colors hover:bg-plaster hover:text-ink"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>
              {error != null && <ErrorNote error={error} />}
              <Button type="submit" variant="primary" disabled={busy} className="w-full !py-2.5 text-[15px]">
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
              <p className="text-center text-[13px] text-slate">Forgotten your password? Ask your space manager to reset it.</p>
            </form>

            {import.meta.env.DEV && (
              <div className="mt-7 border-t border-line pt-5">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold">Try a demo account</p>
                  <p className="text-xs text-slate">Development only</p>
                </div>
                <ul className="grid grid-cols-2 gap-2">
                  {DEMO.map(([role, mail]) => (
                    <li key={mail} className={mail === DEMO[0][1] ? 'col-span-2' : ''}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setEmail(mail);
                          setPassword(DEMO_PASSWORD);
                          void signIn(mail, DEMO_PASSWORD);
                        }}
                        title={`Sign in as ${mail}`}
                        className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-mist px-2.5 py-2 text-left transition-[border-color,background-color,box-shadow] hover:border-ink/30 hover:bg-paper hover:shadow-[var(--shadow-card)] disabled:opacity-50"
                      >
                        <Avatar name={role} size={28} />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold">{role}</span>
                          <span className="block truncate text-[11px] text-slate">{mail}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
