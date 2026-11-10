import {headers} from 'next/headers';
import {getContext,HttpError} from './auth';
// D1: pages resolve a workbench (portal) and, when explicitly chosen, a
// granular scope inside it. Legacy desk callers keep working through getContext.
export async function pageContext(allowPasswordChange=false,portal?:string,scope?:string){const h=await headers();return getContext(new Request('https://workspace.local/',{headers:new Headers(h)}),{allowPasswordChange,portal,scope});}
