import {getContext,handleError,response,checkOrigin,HttpError} from '../../server/auth';
import {outcomeData,mutateOutcome} from '../../server/outcomes';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{return response(await outcomeData(await getContext(req),new URL(req.url)));}catch(e){return handleError(e);}}
export async function POST(req:Request){try{checkOrigin(req);const ctx=await getContext(req);const raw=await req.text();if(raw.length>24000)throw new HttpError(413,'内容过长');return response(await mutateOutcome(ctx,JSON.parse(raw)));}catch(e){return handleError(e);}}
