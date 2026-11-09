const encoder=new TextEncoder();
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const bytes=(value:string)=>new Uint8Array(value.match(/../g)!.map(n=>parseInt(n,16)));
export function passwordProblem(p:string){return p.length<12?'密码至少 12 位':p.length>128?'密码最多 128 位':/^(.)\1+$/.test(p)||['password123456','123456789012','qwerty123456'].includes(p.toLowerCase())?'请使用更难猜的密码':'';}
export async function hashPassword(password:string){const salt=crypto.getRandomValues(new Uint8Array(16));const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},key,256);return `pbkdf2-sha256$600000$${hex(salt)}$${hex(new Uint8Array(bits))}`;}
export async function verifyPassword(password:string,record:string){const [algorithm,rounds,salt,digest]=record.split('$');if(algorithm!=='pbkdf2-sha256'||!/^\d+$/.test(rounds)||Number(rounds)<600000||Number(rounds)>2000000||!/^([a-f0-9]{32})$/.test(salt)||!/^([a-f0-9]{64})$/.test(digest))return false;const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);const derived=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:bytes(salt),iterations:Number(rounds)},key,256));const expected=bytes(digest);let diff=0;for(let i=0;i<derived.length;i++)diff|=derived[i]^expected[i];return diff===0;}
export async function digestToken(token:string){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(token))));}
export const randomToken=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export const normalizePhone=(s:string)=>s.trim().replace(/[\s()-]/g,'').replace(/^(\+86|0086)/,'');
export const validPhone=(s:string)=>/^1[3-9]\d{9}$/.test(s);
export function normalizeIdentifier(s:string){const v=s.trim();return v.includes('@')?v.toLowerCase():normalizePhone(v);}
export const internalEmail=(id:string)=>id+'@phone.internal.invalid';
