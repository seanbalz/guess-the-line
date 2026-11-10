// Exact native reminder copy/status/switch helpers only. No push store, permissions, network or storage.
export const REMINDER_COPY = Object.freeze({
  title: 'Pick reminders',
  // The switch's meta line, one per state. "Due", not "lock" (D-39); the push never names a pick, a line or a score.
  off: 'One push 2 hours before picks are due: Spread, Total and Points. It never shows a pick or a line.',
  on: 'On for this device. One push 2 hours before picks are due.',
  checking: 'Checking this device…',
  turningOn: 'Turning on…',
  turningOff: 'Turning off…',
  blocked: 'Blocked for this site. Allow notifications in your browser or phone settings, then reload.',
  unsupported: 'This browser can’t show reminders.',
  install: 'On iPhone, add the app to your Home Screen first: Share › Add to Home Screen, then open it there.',
  device: 'This device only. Turn it on on each phone or browser you use.',
  doneOn: 'Reminders are on for this device.',
  doneOff: 'Reminders are off for this device.',
  failed: 'Reminders could not be changed. Try again.',
  promptTitle: 'Get a nudge before picks are due',
  promptBody: 'One push 2 hours before your Points players and Spread and Total picks are due. It never shows a pick or a line.',
  promptOn: 'Turn on reminders',
  promptLater: 'Not now',
});


export function reminderStatus(state) {
  if (state.env === 'needs-install') return 'install';
  if (state.env === 'unsupported') return 'unsupported';
  if (state.env === 'denied') return 'blocked';
  return state.phase;
}

/**
 * The switch's props for a state: `{ checked, disabled, sub }`. Only 'on' and 'off' can be switched; while a tap is being
 * answered the switch stays enabled, so keyboard focus is not dropped, and the store ignores another tap.
 */
export function reminderSwitch(state) {
  const status = reminderStatus(state);
  const busy = status === 'busy';
  const sub = busy ? (state.action === 'off' ? REMINDER_COPY.turningOff : REMINDER_COPY.turningOn) : REMINDER_COPY[status] ?? REMINDER_COPY.off;
  return { status, checked: status === 'on' || busy && state.action === 'on', disabled: !['on', 'off', 'busy'].includes(status), sub };
}
