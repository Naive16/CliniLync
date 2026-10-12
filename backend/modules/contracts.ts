/**
 * CLINILYNC Modular Monolith Architecture Contracts
 * 
 * Defines the standard lifecycle pattern for all domain modules:
 * Routes / Handlers -> Validation -> Authorization -> Domain Service -> Repository -> Database
 */

import { SecurityContext } from '../types/domain.js';

export interface BaseRepository<T, CreateDto, UpdateDto> {
  findById(id: string, organizationId: string): Promise<T | null>;
  findMany(organizationId: string, filter?: Record<string, unknown>): Promise<T[]>;
  create(data: CreateDto, organizationId: string): Promise<T>;
  update(id: string, data: UpdateDto, organizationId: string): Promise<T | null>;
  archive?(id: string, organizationId: string): Promise<boolean>;
}

export interface BaseDomainService<T, CreateDto, UpdateDto> {
  getById(ctx: SecurityContext, id: string): Promise<T>;
  list(ctx: SecurityContext, filter?: Record<string, unknown>): Promise<T[]>;
  create(ctx: SecurityContext, data: CreateDto): Promise<T>;
  update(ctx: SecurityContext, id: string, data: UpdateDto): Promise<T>;
}
