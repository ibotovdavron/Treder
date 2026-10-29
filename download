
const cfg=window.SUPABASE_CONFIG||{};
let supabaseClient=null;
if(cfg.url && cfg.anonKey && window.supabase){supabaseClient=window.supabase.createClient(cfg.url,cfg.anonKey)}

const $=(s,p=document)=>p.querySelector(s);
const $$=(s,p=document)=>[...p.querySelectorAll(s)];
function toast(msg){let t=$('#toast');if(!t){t=document.createElement('div');t.id='toast';t.className='toast';document.body.appendChild(t)}t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
function speak(text){try{if('speechSynthesis'in window){speechSynthesis.cancel();let u=new SpeechSynthesisUtterance(text);u.lang='uz-UZ';u.rate=.95;speechSynthesis.speak(u)}}catch(e){}}
function waterClick(){try{const A=window.AudioContext||window.webkitAudioContext;if(!A)return;let c=new A(),o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.setValueAtTime(420,c.currentTime);o.frequency.exponentialRampToValueAtTime(180,c.currentTime+.16);g.gain.setValueAtTime(.045,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.18);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.19)}catch(e){}}
function pageName(){let p=(location.pathname.split('/').pop()||'index.html').replace('.html','');let map={index:'Bosh menyu',courses:'Kurslar',teachers:'Ustozlar',schedule:'Jadval',ranking:'Reyting',about:'Markaz haqida',apply:'Ariza',online:'Online ta’lim',admin:'Admin panel'};return map[p]||''}
function navInit(){const tog=$('.mobile-toggle');if(tog)tog.onclick=()=>$('.nav-links')?.classList.toggle('open');$$('[data-speak]').forEach(a=>a.addEventListener('click',()=>{waterClick();speak(a.dataset.speak)}));}
async function currentUser(){if(!supabaseClient)return null;let {data}=await supabaseClient.auth.getUser();return data?.user||null}
async function signOut(){if(supabaseClient)await supabaseClient.auth.signOut();localStorage.removeItem('soy_user');location.href='index.html'}
async function db(table,queryFn){if(!supabaseClient)return null;let q=supabaseClient.from(table);return await queryFn(q)}
function demoApplications(){return JSON.parse(localStorage.getItem('soy_applications')||'[]')}
async function submitApplication(data){
 data.application_no='SOY-'+new Date().getFullYear()+'-'+String(Date.now()).slice(-6);
 data.created_at=new Date().toISOString();data.status='new';
 if(supabaseClient){let {error}=await supabaseClient.from('applications').insert(data);if(error)throw error}
 let a=demoApplications();a.unshift(data);localStorage.setItem('soy_applications',JSON.stringify(a));return data
}
async function loadCourses(container){
 let rows=[];
 if(supabaseClient){let {data,error}=await supabaseClient.from('courses').select('*').order('created_at',{ascending:false});if(!error)rows=data||[]}
 if(!rows.length)rows=[
 {title:'Arab tili',slug:'arab-tili',short_description:'Arab tilini bosqichma-bosqich o‘rganish',level:'Boshlang‘ich',duration:'6 oy',price:450000},
 {title:'Ingliz tili',slug:'ingliz-tili',short_description:'Speaking, Grammar va imtihon tayyorgarligi',level:'Boshlang‘ich–Yuqori',duration:'6 oy',price:450000},
 {title:'Matematika',slug:'matematika',short_description:'Maktab va imtihonlarga puxta tayyorgarlik',level:'O‘rta',duration:'8 oy',price:400000},
 {title:'IT va dasturlash',slug:'it-dasturlash',short_description:'Zamonaviy dasturlash asoslari',level:'Boshlang‘ich',duration:'6 oy',price:500000}
 ];
 container.innerHTML=rows.map(c=>`<article class="card"><div class="course-cover">📚</div><span class="tag">${c.level||'Kurs'}</span><h3>${c.title}</h3><p class="muted">${c.short_description||c.description||''}</p><p><b>${c.duration||''}</b> · ${Number(c.price||0).toLocaleString('uz-UZ')} so‘m</p><div class="actions"><a class="btn btn-primary" data-speak="Kurslar" href="course.html?slug=${encodeURIComponent(c.slug||'')}">Batafsil</a><a class="btn" href="apply.html?course=${encodeURIComponent(c.title)}">Yozilish</a></div></article>`).join('');
}
async function init(){
 navInit();
 const c=$('#coursesGrid');if(c)await loadCourses(c);
 const form=$('#applicationForm');if(form)form.addEventListener('submit',async e=>{e.preventDefault();let fd=new FormData(form),data=Object.fromEntries(fd.entries());try{let r=await submitApplication(data);form.reset();$('#applicationSuccess').innerHTML=`<div class="notice">Arizangiz qabul qilindi. Raqam: <b>${r.application_no}</b>. Administrator tez orada bog‘lanadi.</div>`;toast('Ariza yuborildi');}catch(err){toast('Xatolik: '+err.message)}})
 const login=$('#loginForm');if(login)login.addEventListener('submit',async e=>{e.preventDefault();let fd=new FormData(login);let email=fd.get('email'),password=fd.get('password');if(!supabaseClient){toast('Demo: Supabase sozlanmagan');location.href='online.html';return}let {error}=await supabaseClient.auth.signInWithPassword({email,password});if(error){toast(error.message);return}location.href='online.html'});
 const signup=$('#signupForm');if(signup)signup.addEventListener('submit',async e=>{e.preventDefault();let fd=new FormData(signup);if(!supabaseClient){toast('Avval Supabase sozlang');return}let {data,error}=await supabaseClient.auth.signUp({email:fd.get('email'),password:fd.get('password'),options:{data:{full_name:fd.get('full_name')}}});if(error)toast(error.message);else toast('Ro‘yxatdan o‘tish muvaffaqiyatli')});
 const out=$('[data-signout]');if(out)out.onclick=signOut;
}
document.addEventListener('DOMContentLoaded',init);
