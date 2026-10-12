/** Durable, revocable session management. HTTP paths use PostgreSQL-backed methods. */
import crypto from 'node:crypto';
import { getDatabaseClient } from '../../database/db.js';
import { SecurityContext } from '../types/domain.js';
export interface ActiveSession { token: string; userId: string; activeOrganizationId: string; createdAt: number; expiresAt: number; lastActiveAt: number; contextCache?: SecurityContext; }
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
class SessionStore {
 private sessions = new Map<string, ActiveSession>();
 private make(userId:string, organizationId:string){const token='clync_sess_'+crypto.randomBytes(32).toString('hex');const now=Date.now();return {token,tokenHash:hashToken(token),now,session:{token,userId,activeOrganizationId:organizationId,createdAt:now,expiresAt:now+SESSION_TTL_MS,lastActiveAt:now} as ActiveSession};}
 createSession(userId:string,organizationId:string){const m=this.make(userId,organizationId);this.sessions.set(m.token,m.session);return m.token;}
 async createSessionAsync(userId:string,organizationId:string){const m=this.make(userId,organizationId);await getDatabaseClient().query('INSERT INTO sessions (token_hash,user_id,active_organization_id,created_at,expires_at,last_active_at) VALUES ($1,$2,$3,$4,$5,$6)',[m.tokenHash,userId,organizationId,new Date(m.now).toISOString(),new Date(m.session.expiresAt).toISOString(),new Date(m.now).toISOString()]);return m.token;}
 getSession(token:string){const s=this.sessions.get(token);if(!s)return null;if(Date.now()>s.expiresAt||Date.now()-s.lastActiveAt>IDLE_TIMEOUT_MS){this.sessions.delete(token);return null;}s.lastActiveAt=Date.now();return s;}
 async getSessionAsync(token:string){const now=new Date();const r=await getDatabaseClient().query<{user_id:string;active_organization_id:string;created_at:string;expires_at:string}>('SELECT user_id,active_organization_id,created_at,expires_at FROM sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>$2 AND last_active_at>$3',[hashToken(token),now.toISOString(),new Date(Date.now()-IDLE_TIMEOUT_MS).toISOString()]);const row=r.rows[0];if(!row)return null;await getDatabaseClient().query('UPDATE sessions SET last_active_at=$1 WHERE token_hash=$2',[now.toISOString(),hashToken(token)]);return {token,userId:row.user_id,activeOrganizationId:row.active_organization_id,createdAt:Date.parse(row.created_at),expiresAt:Date.parse(row.expires_at),lastActiveAt:now.getTime()};}
 updateSessionOrganization(token:string,newOrgId:string){const s=this.sessions.get(token);if(!s)return false;s.activeOrganizationId=newOrgId;delete s.contextCache;return true;}
 async updateSessionOrganizationAsync(token:string,newOrgId:string){const r=await getDatabaseClient().query('UPDATE sessions SET active_organization_id=$1 WHERE token_hash=$2 AND revoked_at IS NULL',[newOrgId,hashToken(token)]);return r.rowCount>0;}
 invalidateSession(token:string){this.sessions.delete(token);}
 async invalidateSessionAsync(token:string){await getDatabaseClient().query('UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE token_hash=$1 AND revoked_at IS NULL',[hashToken(token)]);}
 cacheContext(token:string,context:SecurityContext){const s=this.sessions.get(token);if(s)s.contextCache=context;}
 getCachedContext(token:string){return this.sessions.get(token)?.contextCache||null;}
}
export const sessionManager=new SessionStore();
