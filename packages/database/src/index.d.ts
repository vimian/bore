export interface UserRecord { id:string;email:string;name:string;reservationLimit:number;accessHostLimit:number;createdAt:string;updatedAt:string }
export interface UserInput { id?:string;email:string;name?:string;reservationLimit?:number;accessHostLimit?:number }
export interface QueryResult<Row> { rows:Row[];rowCount:number|null }
export interface QueryClient { query<Row = Record<string, any>>(sql:string,values?:unknown[]):Promise<QueryResult<Row>> }
export function query<Row = Record<string, any>>(sql:string,values?:unknown[]):Promise<QueryResult<Row>>;
export function transaction<T>(operation:(client:QueryClient)=>Promise<T>):Promise<T>;
export function getPool():QueryClient & {connect():Promise<QueryClient & {release():void}>;end():Promise<void>};
export function ensureSchema():Promise<void>;
export function closeDatabase():Promise<void>;
export function readState<T>():Promise<{value:T;revision:string}>;
export function readTraffic(ids:string[]):Promise<Array<{kind:string;id:string;value:unknown}>>;
export function listUsers():Promise<UserRecord[]>;
export function getUserById(id:string):Promise<UserRecord|null>;
export function getUserByEmail(email:string):Promise<UserRecord|null>;
export function upsertUser(input:UserInput):Promise<UserRecord>;
export function setUserLimit(email:string,field:string,limit:number):Promise<UserRecord|null>;
export const SESSION_COOKIE_NAME:string;
export function createUserAccount(input:{email:string;password:string;name?:string}):Promise<UserRecord>;
export function authenticateUser(email:string,password:string):Promise<UserRecord|null>;
export function createSession(userId:string):Promise<string>;
export function deleteSession(token:string):Promise<void>;
export function getUserBySessionToken(token:string):Promise<UserRecord|null>;
export interface UsageCounts { httpRequests:number;websocketConnections:number;tcpTlsConnections:null;syntheticRequests:number }
export interface UsageHost { accessHostId:string|null;host:string;month:UsageCounts;lifetime:UsageCounts }
export interface UsageNamespace { reservationId:string;namespace:string;month:UsageCounts;lifetime:UsageCounts;hosts:UsageHost[] }
export interface UserUsage {
  trackingSince:string|null;timeZone:string;month:string;limitsEnforced:false;
  protocolSupport:{http:true;websocket:true;tcpTls:false};totals:{month:UsageCounts;lifetime:UsageCounts};
  namespaces:UsageNamespace[];daily:Array<UsageCounts & {day:string}>;
}
export function usageMonth(month?:string):string;
export function getUserUsage(userId:string,month?:string):Promise<UserUsage>;
