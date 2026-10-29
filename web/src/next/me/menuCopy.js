export const MENU_COPY = Object.freeze({
  title: 'Menu',
  appearance: 'Appearance',
  profile: 'Profile',
  history: 'History',
  export: 'Export my data',
  signedInAs: email => `Signed in as ${email}`,
  signOut: 'Sign out',
  signingOut: 'Signing out…',
  theme: 'Theme',
  themes: [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }],
  guidance: 'Guidance and sources',
  reduceMotion: 'Reduce motion',
  reduceMotionSub: 'Your device’s own setting also stops motion.',
  saved: 'Saved on this device, not your account. The old app uses the same setting.',
  notSaved: 'This browser isn’t saving settings, so this lasts until you close the page.',
});

