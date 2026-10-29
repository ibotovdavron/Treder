(()=>{"use strict";
const rm=matchMedia("(prefers-reduced-motion:reduce)").matches,$=(s,r=document)=>[...r.querySelectorAll(s)];
// progress bar + header
const bar=document.createElement("div");bar.id="bar";document.body.append(bar);
const tb=document.querySelector(".topbar");
addEventListener("scroll",()=>{const h=document.documentElement,p=h.scrollTop/(h.scrollHeight-h.clientHeight||1);bar.style.width=p*100+"%";tb&&tb.classList.toggle("sc",h.scrollTop>10)},{passive:true});
// reveal
const sel=".hero,.stat,.subject,.card,.panel,.section-head,.teacher-card,.shop-card,.competition-card,.contact-item,.result-row,.daily-question,.pagehead,.table-wrap,.notice";
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target)}}),{threshold:.12});
const reveal=()=>$(sel).forEach((el,i)=>{if(el.dataset.rv)return;el.dataset.rv=1;el.classList.add("rv");el.style.setProperty("--d",(i%6)*.07+"s");io.observe(el)});
reveal();new MutationObserver(reveal).observe(document.body,{childList:true,subtree:true});
// counters
const cnt=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;cnt.unobserve(e.target);const el=e.target,n=+el.textContent;if(!n)return;const t0=performance.now();(function f(t){const k=Math.min(1,(t-t0)/1400);el.textContent=Math.round(n*(1-Math.pow(1-k,3)));k<1&&requestAnimationFrame(f)})(t0)}),{threshold:.6});
$(".stat strong").forEach(el=>/^\d+$/.test(el.textContent.trim())&&cnt.observe(el));
// ripple + stars burst on buttons
document.addEventListener("pointerdown",e=>{const b=e.target.closest(".btn,button");if(!b)return;const r=b.getBoundingClientRect(),s=Math.max(r.width,r.height);
 if(getComputedStyle(b).position==="static")b.style.position="relative";b.style.overflow="hidden";
 const d=document.createElement("span");d.className="rp";d.style.cssText=`width:${s}px;height:${s}px;left:${e.clientX-r.left-s/2}px;top:${e.clientY-r.top-s/2}px`;b.append(d);setTimeout(()=>d.remove(),600)});
// 3D tilt
if(!rm&&matchMedia("(hover:hover)").matches)$(".card,.teacher-card,.shop-card,.competition-card,.hero-logo").forEach(c=>{
 c.addEventListener("mousemove",e=>{const r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;c.style.transform=`perspective(700px) rotateX(${-y*9}deg) rotateY(${x*9}deg) translateY(-6px)`});
 c.addEventListener("mouseleave",()=>c.style.transform="")});
if(rm)return;
// cursor glow
if(matchMedia("(hover:hover)").matches){const g=document.createElement("div");g.id="glow";document.body.append(g);addEventListener("pointermove",e=>g.style.transform=`translate(${e.clientX}px,${e.clientY}px)`)}
// particles
const cv=document.createElement("canvas");cv.id="fx";document.body.prepend(cv);const x=cv.getContext("2d");let W,H,P=[];
const rs=()=>{W=cv.width=innerWidth;H=cv.height=innerHeight;P=Array.from({length:Math.min(55,W/22|0)},()=>({x:Math.random()*W,y:Math.random()*H,r:Math.random()*2+.6,v:Math.random()*.4+.1,a:Math.random()*6}))};rs();addEventListener("resize",rs);
(function f(){x.clearRect(0,0,W,H);P.forEach(p=>{p.y-=p.v;p.a+=.02;p.x+=Math.sin(p.a)*.3;if(p.y<-5){p.y=H+5;p.x=Math.random()*W}
 x.fillStyle=`rgba(0,255,150,${.35+Math.sin(p.a)*.25})`;x.shadowColor="#00ff96";x.shadowBlur=10;x.beginPath();x.arc(p.x,p.y,p.r,0,7);x.fill()});requestAnimationFrame(f)})();
// page transition
document.addEventListener("click",e=>{const a=e.target.closest("a[href]");if(!a||a.target||e.metaKey||e.ctrlKey)return;const u=new URL(a.href,location);if(u.origin!==location.origin||u.pathname===location.pathname||!/\.html$|\/$/.test(u.pathname))return;e.preventDefault();document.body.classList.add("out");setTimeout(()=>location.href=a.href,230)});
addEventListener("pageshow",e=>e.persisted&&document.body.classList.remove("out"));
// star burst on correct answers / winners
new MutationObserver(m=>m.forEach(r=>r.addedNodes.forEach(n=>{if(n.nodeType===1&&/to‘g‘ri|g‘olib|✅|🎉/i.test(n.textContent||"")&&n.textContent.length<90){const R=n.getBoundingClientRect();for(let i=0;i<14;i++){const s=document.createElement("span");s.className="star-b";s.textContent=["⭐","✨","🎉"][i%3];s.style.cssText=`left:${R.left+R.width/2}px;top:${R.top}px;--x:${Math.random()*260-130}px;--y:${-Math.random()*190-20}px`;document.body.append(s);setTimeout(()=>s.remove(),1000)}}}))).observe(document.body,{childList:true,subtree:true,characterData:true});
})();
