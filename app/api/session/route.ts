import {getContext,handleError,response} from '../../server/auth';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{const ctx=await getContext(req,{allowPasswordChange:true});return response({member:ctx.member,isOwner:ctx.member.role==='owner'});}catch(e){return handleError(e)}}
