import { BellOff, BellRing, LockKeyhole, Monitor } from 'lucide-react';
// Pick reminders (Board i39): Menu › Pick reminders, the device's switch, and the one-time prompt under Play's Points
// card. Both draw the same store (reminders.js), so a tap in either updates the other. Shown only while the server can
// send pushes (`/community/read` pushConfigured, the stage 2 push guard), as the old app did.
import { useId } from 'react';
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { Button, Card, Icon, Switch } from '../ui/index.js';
import './accountPrism.css';
import { REMINDER_COPY, reminderSwitch, showPrompt, useReminders } from './reminders.js';

/** Whether the server holds a valid VAPID key; anything but a true answer hides the reminder controls. */
export const remindersConfigured = app => app?.community?.data?.pushConfigured === true;

/** The words under the switch or the prompt: the answer to the last tap, as a status or an alert. */
function Answer({ state }) {
  return <>
    {state.error ? <p className="gx-t-body gx-c-loss" role="alert">{state.error}</p> : null}
    <p className="gx-t-body" role="status">{state.error ? '' : state.message}</p>
  </>;
}

/** Menu › Pick reminders: one switch for this device (on, off, blocked, unsupported, or add to the Home Screen first). */
export function PickReminderSettings() {
  const app = useAppData();
  const reminders = useReminders(app.accountId);
  const configured = remindersConfigured(app);
  const view = reminderSwitch(reminders);
  const HeroIcon = view.checked ? BellRing : view.status === 'blocked' ? LockKeyhole : view.status === 'unsupported' ? Monitor : BellOff;
  return <div className="gx-reminders-prism">
    <section className="gx-reminder-hero"><span className="gx-account-icon"><Icon icon={HeroIcon} size={32}/></span><div><strong>2h</strong><p>before picks are due</p></div><div className="gx-reminder-modes"><span>Spread</span><span>Total</span><span>Points</span></div></section>
    <Card className="gx-reminder-switch">{configured ? <>
      <Switch label={REMINDER_COPY.title} sub={view.sub} checked={view.checked} disabled={view.disabled} data-reminders={view.status}
        onChange={on => { if (on) reminders.turnOn(); else reminders.turnOff(); }}/>
    </> : <><strong>Reminders unavailable</strong><p>Pick reminders are not available yet.</p></>}</Card>
    <dl className="gx-reminder-facts"><div><dt>Notification permission</dt><dd>{!globalThis.Notification ? 'Unavailable' : globalThis.Notification.permission === 'granted' ? 'Allowed' : globalThis.Notification?.permission === 'denied' ? 'Blocked' : 'Not requested'}</dd></div><div><dt>Reminder delivery</dt><dd>{!configured ? 'Service unavailable' : view.checked ? 'On for this device' : view.status === 'install' ? 'Home Screen app needed' : view.status === 'unsupported' ? 'Unsupported browser' : 'Off'}</dd></div></dl>
    <p className="gx-account-footer">{REMINDER_COPY.device}</p>
    <Answer state={reminders}/>
  </div>;
}

/**
 * The one-time prompt under the Points card: "Turn on reminders" runs the same flow as the switch (the permission question
 * comes from that tap), "Not now" retires it for this account on this device. On iPhone in a Safari tab it says, in one
 * line, to add the app to the Home Screen first. `onGone` moves focus on when the prompt leaves after a tap in it.
 */
export function ReminderPrompt({ onGone }) {
  const app = useAppData(), shell = useShell();
  const reminders = useReminders(app.accountId);
  const titleId = useId();
  if (!showPrompt(reminders, remindersConfigured(app))) return null;
  const install = reminders.status === 'install';
  const busy = reminders.status === 'busy';
  const turnOn = async () => {
    const after = await reminders.turnOn();
    // Switched on: the prompt has done its job and leaves; the answer moves to a toast so it is still read out.
    if (after.dismissed) { shell.toast?.(REMINDER_COPY.doneOn); onGone?.(); }
  };
  const later = () => { reminders.dismiss(); onGone?.(); };
  return <Card as="section" className="gx-vstack gx-gap-12" aria-labelledby={titleId} data-reminder-prompt={reminders.status}>
    <h2 className="gx-t-strong" id={titleId}>{REMINDER_COPY.promptTitle}</h2>
    <p className="gx-t-body gx-c-2">{install ? REMINDER_COPY.install : REMINDER_COPY.promptBody}</p>
    <div className="gx-hstack gx-gap-8 gx-wrap">
      {!install && reminders.status !== 'blocked' && reminders.status !== 'unsupported'
        ? <Button icon="bell" aria-disabled={busy || undefined} onClick={() => { if (!busy) turnOn(); }}>{busy ? REMINDER_COPY.turningOn : REMINDER_COPY.promptOn}</Button> : null}
      <Button variant="ghost" onClick={later}>{REMINDER_COPY.promptLater}</Button>
    </div>
    <Answer state={reminders}/>
  </Card>;
}
