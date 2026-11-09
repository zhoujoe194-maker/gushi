import type { Commercial } from '../business-model';
import { HttpError } from './auth';
export function mergeSalesCommercial(input: Commercial, old?: Commercial): Commercial {
  if(input.costUnitPrice!==null || input.profitNotes || [...input.quotes,...input.competitors].some(q=>q.costUnitPrice!==null)) throw new HttpError(403,'成本与利润仅由管理维护');
  for(const key of ['quotes','competitors'] as const) if(old?.[key].some(q=>!input[key].some(n=>n.id===q.id))) throw new HttpError(403,'历史报价需保留，可新增报价或更新报价状态');
  return {...input,costUnitPrice:old?.costUnitPrice??null,profitNotes:old?.profitNotes||'',quotes:input.quotes.map(q=>({...q,costUnitPrice:old?.quotes.find(x=>x.id===q.id)?.costUnitPrice??null})),competitors:input.competitors.map(q=>({...q,costUnitPrice:old?.competitors.find(x=>x.id===q.id)?.costUnitPrice??null}))};
}
