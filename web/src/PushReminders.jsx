import React, { useCallback, useEffect, useState } from 'react';
import { BellOff, BellRing, LoaderCircle } from 'lucide-react';
import { currentSubscription, disablePush, enablePush, pushEnvironment, pushStatus } from './webPush';
import { communityApi } from './api';
import './pushReminders.css';

// D-28: one opt-in reminder, two hours before picks lock, by web push only.
export const REMIND_LABEL = 'Remind me 2 hours before picks lock';
export const IPHONE_HELP = 'On iPhone or iPad, reminders need iOS 16.4 or later and the Home Screen app: in Safari, open the Share menu, choose Add to Home Screen, open Guess The Line from your Home Screen, then turn reminders on there.';
const CHANGE = 'gtl-push-change';

/** This device's reminder state. Reads nothing from the network unless a subscription already exists. */
export function usePushReminders() {
  const [env, setEnv] = useState(() => pushEnvironment());
  const [phase, setPhase] = useState(env === 'supported' ? 'checking' : 'off');
  const [message, setMessage] = useState(''), [error, setError] = useState('');
  const refresh = useCallback(async () => {
    const next = pushEnvironment(); setEnv(next);
    if (next !== 'supported') { setPhase('off'); return; }
    try {
      const subscription = await currentSubscription();
      if (!subscription) { setPhase('off'); return; }
      try { setPhase((await pushStatus(subscription.endpoint)).subscribed ? 'on' : 'off'); }
      catch { setPhase('on'); /* The device is subscribed; the server check can wait. */ }
    } catch { setPhase('off'); }
  }, []);
  useEffect(() => {
    refresh();
    const sync = () => { refresh(); };
    window.addEventListener(CHANGE, sync);
    return () => window.removeEventListener(CHANGE, sync);
  }, [refresh]);
  const run = async (action, done) => {
    setPhase('busy'); setMessage(''); setError('');
    try { await action(); setMessage(done); }
    catch (failure) { setError(failure?.message || 'Reminders could not be changed. Try again.'); }
    // Every mounted reminder control (this one included) re-reads this device's state once.
    window.dispatchEvent(new Event(CHANGE));
  };
  return {
    env, phase, message, error,
    enable: () => run(enablePush, 'Reminder on. If a ballot is still open, this device gets one push 2 hours before picks lock.'),
    disable: () => run(disablePush, 'Reminders are off on this device.'),
  };
}

/**
 * Redesign stage 2 (push guard): whether gtl-api holds a valid VAPID key, from /community/read's `pushConfigured`
 * (the key itself is never in that reply). `known` is the value a caller already read; without one, one small
 * community read (limit 1) answers it. Anything but a true answer, including a failed read, hides the reminders.
 */
function usePushConfigured(known) {
  const [read, setRead] = useState(false);
  const asked = typeof known !== 'boolean';
  useEffect(() => {
    if (!asked) return undefined;
    const controller = new AbortController();
    communityApi('read', { limit: 1 }, controller.signal).then(feed => setRead(feed?.pushConfigured === true), () => setRead(false));
    return () => controller.abort();
  }, [asked]);
  return asked ? read : known;
}

/** Settings & setup, next to Install app. Hidden until push really works (stage 2 push guard). */
export default function PushReminders({ configured }) {
  return usePushConfigured(configured) ? <PushReminderSettings/> : null;
}

function PushReminderSettings() {
  const { env, phase, message, error, enable, disable } = usePushReminders();
  const on = phase === 'on', busy = phase === 'busy' || phase === 'checking';
  return <section className="panel push-reminders" aria-labelledby="push-reminders-title">
    <h2 id="push-reminders-title"><BellRing size={20} aria-hidden="true"/>Pick reminders</h2>
    <p>Get one notification 2 hours before picks lock when your Spread or Total ballot is still open. It never shows picks or lines. Email and text messages are not used.</p>
    {env === 'supported' && <>
      <p className="push-state">This device: <strong>{phase === 'checking' ? 'checking…' : on ? 'On' : 'Off'}</strong></p>
      <button className={on ? 'secondary' : 'primary'} disabled={busy} onClick={on ? disable : enable}>
        {busy ? <LoaderCircle size={18} className="spin" aria-hidden="true"/> : on ? <BellOff size={18} aria-hidden="true"/> : <BellRing size={18} aria-hidden="true"/>}
        {on ? 'Turn off reminders' : REMIND_LABEL}
      </button>
    </>}
    {env === 'denied' && <p>Notifications are blocked for this site. Allow them in your browser’s site settings (on iPhone: Settings, Notifications, Guess The Line), then reload this page.</p>}
    {(env === 'needs-install' || env === 'unsupported') && <p>{env === 'unsupported' ? 'This browser cannot show reminders. ' : ''}{IPHONE_HELP}</p>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert" className="push-error">{error}</p>}
  </section>;
}

/**
 * The one-line prompt on the Community picks-due card. Silent until /community/read says push is configured
 * (stage 2 push guard), and when reminders are on, blocked or impossible here.
 */
export function PushReminderPrompt({ configured = false }) {
  return configured === true ? <ReminderPrompt/> : null;
}

function ReminderPrompt() {
  const { env, phase, message, error, enable } = usePushReminders();
  if (env === 'needs-install') return <p className="push-prompt muted">Reminders on iPhone: add Guess The Line to your Home Screen first (iOS 16.4 or later).</p>;
  if (env !== 'supported') return null;
  if (message || error) return <p className={`push-prompt${error ? ' push-error' : ''}`} role={error ? 'alert' : 'status'}>{error || message}</p>;
  if (phase !== 'off' && phase !== 'busy') return null;
  return <p className="push-prompt"><button className="text-button" disabled={phase === 'busy'} onClick={enable}>
    {phase === 'busy' ? <LoaderCircle size={18} className="spin" aria-hidden="true"/> : <BellRing size={18} aria-hidden="true"/>}{REMIND_LABEL}</button></p>;
}
