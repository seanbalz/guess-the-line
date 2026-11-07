import { useLayoutEffect } from 'react';
import { homeThemeColor, themeColor } from '../../../../design/tokens-next.json';
import dark from './assets/lime.svg';
import light from './assets/light-deep-green.svg';

/** Scoped browser chrome follows Home while mounted and restores the existing page theme on exit. */
export function HomeBrand() {
  useLayoutEffect(()=>{
    const apply=colors=>{const theme=document.documentElement.dataset.theme==='light'?'light':'dark';for(const meta of document.querySelectorAll('meta[name="theme-color"]'))meta.setAttribute('content',colors[theme]);};
    apply(homeThemeColor);
    const observer=new MutationObserver(()=>apply(homeThemeColor));
    observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    return ()=>{observer.disconnect();apply(themeColor);};
  },[]);
  return <span className="gx-home-brand" aria-hidden="true"><img className="gx-home-brand-dark" src={dark} alt=""/><img className="gx-home-brand-light" src={light} alt=""/></span>;
}
