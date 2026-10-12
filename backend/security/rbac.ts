/**
 * CLINILYNC Centralized Role-Based Access Control (RBAC) Engine
 * 
 * Enforces permission checks server-side without relying on frontend logic.
 */

import { SecurityContext } from '../types/domain.js';
import { PermissionCode } from './permissions.js';

export class RBACService {
  /**
   * Evaluates if a given security context holds the required permission.
   * Super Admins automatically bypass standard organizational permission boundaries.
   */
  static hasPermission(context: SecurityContext, permission: PermissionCode | string): boolean {
    if (!context || !context.user) {
      return false;
    }

    if (!Array.isArray(context.permissions)) {
      return false;
    }

    return context.permissions.includes(permission);
  }

  /**
   * Asserts permission, throwing an AuthorizationError if not satisfied.
   */
  static assertPermission(context: SecurityContext, permission: PermissionCode | string): void {
    if (!this.hasPermission(context, permission)) {
      const err = new Error(`Authorization failure: Missing permission '${permission}'`);
      (err as unknown as { status: number; code: string }).status = 403;
      (err as unknown as { status: number; code: string }).code = 'FORBIDDEN_PERMISSION_DENIED';
      throw err;
    }
  }

  /**
   * Evaluates if context holds AT LEAST ONE of the specified permissions.
   */
  static hasAnyPermission(context: SecurityContext, permissions: (PermissionCode | string)[]): boolean {
    return permissions.some(perm => this.hasPermission(context, perm));
  }
}
