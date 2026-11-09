import {headers} from 'next/headers';
import {getContext,HttpError} from './auth';
export async function pageContext(allowPasswordChange=false,desk?:string){const h=await headers();return getContext(new Request('https://workspace.local/',{headers:new Headers(h)}),{allowPasswordChange,desk});}
