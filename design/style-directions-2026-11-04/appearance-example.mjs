// Static native Appearance words; no MenuSheet, theme provider or preference store.
export const APPEARANCE_COPY=Object.freeze({
 appearance:'Appearance',theme:'Theme',
 themes:[{value:'dark',label:'Dark'},{value:'light',label:'Light'},{value:'system',label:'System'}],
 reduceMotion:'Reduce motion',reduceMotionSub:'Your device’s own setting also stops motion.',
 saved:'Saved on this device, not your account.',
 notSaved:'This browser isn’t saving settings, so this lasts until you close the page.',
});
// Exact native resolveDashboardMotion body, isolated without its preference store.
export function resolveDashboardMotion(preference, systemReduced) {
  return preference === 'reduced' || systemReduced ? 'reduced' : 'subtle';
}
export function appearanceExample(preference,systemTheme,motion,systemReduced){
 const selected=['dark','light','system'].includes(preference)?preference:'dark';
 return{preference:selected,theme:selected==='system'?(systemTheme==='light'?'light':'dark'):selected,motion:resolveDashboardMotion(motion,systemReduced)};
}
