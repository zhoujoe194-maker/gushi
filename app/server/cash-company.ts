import {HttpError} from './auth';
import type {CashStore} from './cash-store';
export async function companyMutation(_s:CashStore,_raw:Record<string,unknown>){throw new HttpError(400,'公司费用将在 C2 批次开放');}
