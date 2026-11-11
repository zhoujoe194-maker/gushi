import {headers} from 'next/headers';
import {getContext,HttpError} from './auth';
// D1-RECTIFY: pages resolve exactly one of the three workbenches. There is no
// internal scope parameter any more; retired ?scope= links are redirected by
// the page before reaching this helper.
export async function pageContext(allowPasswordChange=false,portal?:string){const h=await headers();return getContext(new Request('https://workspace.local/',{headers:new Headers(h)}),{allowPasswordChange,portal});}
