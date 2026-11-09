export function databasePath():string;
export function openSqlite(path?:string,create?:boolean):import('node:sqlite').DatabaseSync;
export function d1Adapter(db:import('node:sqlite').DatabaseSync):D1Database;
export function getDatabase():D1Database;
