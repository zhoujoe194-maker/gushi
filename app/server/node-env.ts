import {getDatabase} from '../../runtime/sqlite.mjs';
export const env={get DB(){return getDatabase()},get APP_ORIGIN(){return process.env.APP_ORIGIN||''},get TRUST_PROXY(){return process.env.TRUST_PROXY==='1'}};
