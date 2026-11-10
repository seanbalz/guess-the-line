// Manual entry adjustments only. No quotes, recommended stakes, storage or network.
export function adjustOdds(value,direction,step){
 if(value===''||value==null)return null;
 const n=Number(value);
 if(!Number.isFinite(n)||Math.abs(n)<100||Math.abs(n)>1000000||Math.abs(n*100-Math.round(n*100))>1e-7||![1,-1].includes(direction)||!(step>0))return null;
 // American even money is +100 (equivalent to −100); cross it without invalid −99…+99 prices.
 const index=n<0?n+100:n-100,next=Math.round((index+direction*step)*100)/100;
 const result=next<0?next-100:next+100;
 return Math.abs(result)<=1000000?result:null;
}
export function adjustUnits(value,direction,step){
 if(value===''||value==null)return null;
 const n=Number(value);
 if(!Number.isFinite(n)||n<.01||n>10000||Math.abs(n*10000-Math.round(n*10000))>1e-7||![1,-1].includes(direction)||!(step>0))return null;
 const next=Math.round(n*10000)+direction*Math.round(step*10000);
 const clamped=Math.max(100,next);
 return clamped<=100000000&&clamped!==Math.round(n*10000)?clamped/10000:null;
}
