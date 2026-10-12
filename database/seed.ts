/**
 * CLINILYNC Database Fixture Seeder
 * 
 * Idempotently seeds multi-tenant data, RBAC roles, clinician accounts,
 * patients, clinical records, and billing data for testing and demonstrations.
 */

import { getDatabaseClient } from './db.js';
import { MigrationEngine } from './migrator.js';
import { hashPassword } from '../backend/security/password.js';
import { Permissions, SystemRoles, RolePermissionsMap } from '../backend/security/permissions.js';

export async function seedDatabase(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Refusing to seed demonstration data in production.');
  }
  const db = getDatabaseClient();

  // Run migrations first
  const migrator = new MigrationEngine(db);
  await migrator.runPendingMigrations();

  // Check if already seeded
  const check = await db.query('SELECT id FROM users WHERE id = $1', ['usr_sarah']);
  if (check.rows.length > 0) {
    return;
  }

  console.log('[CLINILYNC Seed] Seeding organizations and foundational entities...');

  // 1. Organizations
  await db.query(
    `INSERT INTO organizations 
      (id, name, legal_name, tax_id, slug, country_code, currency_code, timezone, phone, email, address_line1, city, postal_code, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     ON CONFLICT (id) DO NOTHING`,
    [
      'org_st_jude',
      'St. Jude Global Health Center',
      'St. Jude Healthcare Trust Ltd',
      'GB8829104',
      'st-jude-london',
      'GBR',
      'GBP',
      'Europe/London',
      '+44 20 7946 0912',
      'contact@stjudeglobal.org',
      '45 Harley Street',
      'London',
      'W1G 8QG',
      true,
      new Date().toISOString(),
      new Date().toISOString()
    ]
  );

  await db.query(
    `INSERT INTO organizations 
      (id, name, legal_name, tax_id, slug, country_code, currency_code, timezone, phone, email, address_line1, city, postal_code, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     ON CONFLICT (id) DO NOTHING`,
    [
      'org_metro_health',
      'Metro Health Specialty Institute',
      'Metro Health Medical Group LLC',
      'US1299831',
      'metro-health-ny',
      'USA',
      'USD',
      'America/New_York',
      '+1 212 555 0199',
      'intake@metrohealthnyc.org',
      '742 Park Avenue',
      'New York',
      '10021',
      true,
      new Date().toISOString(),
      new Date().toISOString()
    ]
  );

  // 2. Permissions
  for (const [key, code] of Object.entries(Permissions)) {
    const category = code.split('.')[0];
    await db.query(
      `INSERT INTO permissions (id, code, category, description, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [`perm_${code}`, code, category, `Grants ${code} capability across organization`, new Date().toISOString()]
    );
  }

  // 3. Roles
  for (const roleCode of Object.values(SystemRoles)) {
    const roleId = `role_${roleCode.toLowerCase()}`;
    await db.query(
      `INSERT INTO roles (id, name, code, description, is_system_role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        roleId,
        roleCode.replace(/_/g, ' '),
        roleCode,
        `Built-in system role for ${roleCode}`,
        true,
        new Date().toISOString()
      ]
    );

    // Map permissions
    const grantedPerms = RolePermissionsMap[roleCode as keyof typeof RolePermissionsMap] || [];
    for (const permCode of grantedPerms) {
      await db.query(
        `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)
         ON CONFLICT (role_id, permission_id) DO NOTHING`,
        [roleId, `perm_${permCode}`]
      );
    }
  }

  // Common default password: Password123!
  const pwd = hashPassword('Password123!');

  // 4. Users
  const userSeeds = [
    {
      id: 'usr_sarah',
      email: 'dr.sarah@clinilync.com',
      first_name: 'Dr. Sarah',
      last_name: 'Chen, MD',
      phone: '+44 7700 900123',
      avatar_url: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=150',
      is_super_admin: false,
      role: SystemRoles.DOCTOR,
      org: 'org_st_jude'
    },
    {
      id: 'usr_marcus',
      email: 'nurse.marcus@clinilync.com',
      first_name: 'Marcus',
      last_name: 'Vance, RN',
      phone: '+44 7700 900124',
      avatar_url: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150',
      is_super_admin: false,
      role: SystemRoles.NURSE,
      org: 'org_st_jude'
    },
    {
      id: 'usr_elena',
      email: 'elena.reception@clinilync.com',
      first_name: 'Elena',
      last_name: 'Ramos',
      phone: '+44 7700 900125',
      avatar_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
      is_super_admin: false,
      role: SystemRoles.RECEPTIONIST,
      org: 'org_st_jude'
    },
    {
      id: 'usr_james',
      email: 'billing.james@clinilync.com',
      first_name: 'James',
      last_name: 'Thornton',
      phone: '+44 7700 900126',
      avatar_url: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150',
      is_super_admin: false,
      role: SystemRoles.BILLING_STAFF,
      org: 'org_st_jude'
    },
    {
      id: 'usr_rachel',
      email: 'admin.rachel@clinilync.com',
      first_name: 'Rachel',
      last_name: 'Kim',
      phone: '+44 7700 900127',
      avatar_url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150',
      is_super_admin: false,
      role: SystemRoles.ORG_ADMIN,
      org: 'org_st_jude'
    },
    {
      id: 'usr_david',
      email: 'patient.david@clinilync.com',
      first_name: 'David',
      last_name: 'Miller',
      phone: '+44 7700 900128',
      avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      is_super_admin: false,
      role: SystemRoles.PATIENT,
      org: 'org_st_jude'
    },
    {
      id: 'usr_robert',
      email: 'dr.robert@metrohealth.com',
      first_name: 'Dr. Robert',
      last_name: 'Thorne, FACS',
      phone: '+1 212 555 0144',
      avatar_url: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=150',
      is_super_admin: false,
      role: SystemRoles.DOCTOR,
      org: 'org_metro_health'
    },
    {
      id: 'usr_superadmin',
      email: 'superadmin@clinilync.com',
      first_name: 'Alexander',
      last_name: 'Vance',
      phone: '+44 20 7946 0000',
      avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      is_super_admin: true,
      role: SystemRoles.SUPER_ADMIN,
      org: 'org_st_jude',
      membershipStatus: 'ACTIVE'
    },
    {
      id: 'usr_owner',
      email: 'owner.olivia@clinilync.com',
      first_name: 'Olivia',
      last_name: 'Sterling',
      phone: '+44 20 7946 0999',
      avatar_url: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=150',
      is_super_admin: false,
      role: SystemRoles.ORG_OWNER,
      org: 'org_st_jude',
      membershipStatus: 'ACTIVE'
    },
    {
      id: 'usr_support',
      email: 'support.sam@clinilync.com',
      first_name: 'Sam',
      last_name: 'Taylor',
      phone: '+44 20 7946 0888',
      avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
      is_super_admin: false,
      role: SystemRoles.SUPPORT_STAFF,
      org: 'org_st_jude',
      membershipStatus: 'ACTIVE'
    },
    {
      id: 'usr_director',
      email: 'director.arthur@clinilync.com',
      first_name: 'Arthur',
      last_name: 'Pendleton',
      phone: '+44 20 7946 0777',
      avatar_url: 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=150',
      is_super_admin: false,
      role: SystemRoles.CLINICAL_DIRECTOR,
      org: 'org_st_jude',
      membershipStatus: 'ACTIVE'
    },
    {
      id: 'usr_revoked',
      email: 'revoked.staff@clinilync.com',
      first_name: 'Arthur',
      last_name: 'Pendelton',
      phone: '+44 7700 900999',
      avatar_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
      is_super_admin: false,
      role: SystemRoles.DOCTOR,
      org: 'org_st_jude',
      membershipStatus: 'REVOKED'
    }
  ];

  for (const u of userSeeds) {
    await db.query(
      `INSERT INTO users (id, email, password_hash, salt, first_name, last_name, phone, avatar_url, is_super_admin, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        u.id,
        u.email,
        pwd.hash,
        pwd.salt,
        u.first_name,
        u.last_name,
        u.phone,
        u.avatar_url,
        u.is_super_admin,
        'ACTIVE',
        new Date().toISOString(),
        new Date().toISOString()
      ]
    );

    // Link user to organization and role
    await db.query(
      `INSERT INTO user_organizations (id, user_id, organization_id, role_id, is_primary, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        `uo_${u.id}_${u.org}`,
        u.id,
        u.org,
        `role_${u.role.toLowerCase()}`,
        true,
        u.membershipStatus || 'ACTIVE',
        new Date().toISOString()
      ]
    );
  }

  // Multi-organization assignment for Dr. Sarah Chen (Visiting Specialist at Metro Health)
  await db.query(
    `INSERT INTO user_organizations (id, user_id, organization_id, role_id, is_primary, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      'uo_usr_sarah_org_metro_health',
      'usr_sarah',
      'org_metro_health',
      'role_doctor',
      false,
      'ACTIVE',
      new Date().toISOString()
    ]
  );

  // 4b. Specialties
  const specialtiesSeeds = [
    { id: 'spec_cardio', name: 'Cardiology', code: 'CARD', description: 'Adult & pediatric cardiology and cardiovascular interventions', category: 'CLINICAL' },
    { id: 'spec_genmed', name: 'General Internal Medicine', code: 'GIM', description: 'Primary ambulatory care and chronic disease management', category: 'CLINICAL' },
    { id: 'spec_ortho', name: 'Orthopedic Surgery', code: 'ORTHO', description: 'Musculoskeletal medicine, arthroscopy, and joint reconstruction', category: 'SURGICAL' },
    { id: 'spec_peds', name: 'Pediatrics', code: 'PEDS', description: 'Infant, child, and adolescent healthcare', category: 'CLINICAL' },
    { id: 'spec_derm', name: 'Dermatology', code: 'DERM', description: 'Skin disorders, lesions, and dermatological procedures', category: 'CLINICAL' }
  ];

  for (const s of specialtiesSeeds) {
    await db.query(
      `INSERT INTO specialties (id, name, code, description, category, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [s.id, s.name, s.code, s.description, s.category, true, new Date().toISOString()]
    );
  }

  // 5. Departments
  await db.query(
    `INSERT INTO departments (id, organization_id, name, code, description, email, phone, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      'dept_cardio',
      'org_st_jude',
      'Cardiology & Vascular Medicine',
      'CARD',
      'Comprehensive cardiovascular diagnostic evaluation and disease management center',
      'cardiology@stjude-health.org',
      '+44 20 7946 0101',
      true,
      new Date().toISOString(),
      new Date().toISOString()
    ]
  );
  await db.query(
    `INSERT INTO departments (id, organization_id, name, code, description, email, phone, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      'dept_genmed',
      'org_st_jude',
      'General Internal Medicine',
      'GIM',
      'Outpatient adult medicine and multi-disciplinary primary care suite',
      'internalmed@stjude-health.org',
      '+44 20 7946 0102',
      true,
      new Date().toISOString(),
      new Date().toISOString()
    ]
  );

  // 6. Providers
  await db.query(
    `INSERT INTO providers (id, organization_id, user_id, department_id, title, first_name, last_name, display_name, specialty_id, specialization, license_number, consultation_fee, email, phone, bio, qualifications, is_credential_verified, is_accepting_patients, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
    [
      'prov_sarah',
      'org_st_jude',
      'usr_sarah',
      'dept_cardio',
      'Dr.',
      'Sarah',
      'Chen',
      'Dr. Sarah Chen, MD, FACC',
      'spec_cardio',
      'Cardiology & Preventive Medicine',
      'GMC-7491028',
      180.00,
      'dr.sarah@clinilync.com',
      '+44 7700 900123',
      'Lead Consultant Cardiologist with dual fellowships in Preventive Cardiovascular Health and Non-Invasive Echocardiography.',
      'MBBS, MRCP (UK), FACC, Board Certified Internal Medicine & Cardiology',
      true,
      true,
      'ACTIVE',
      new Date().toISOString(),
      new Date().toISOString()
    ]
  );
  await db.query(
    `INSERT INTO providers (id, organization_id, user_id, department_id, title, first_name, last_name, display_name, specialty_id, specialization, license_number, consultation_fee, email, phone, bio, qualifications, is_credential_verified, is_accepting_patients, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
    [
      'prov_robert',
      'org_metro_health',
      'usr_robert',
      null,
      'Dr.',
      'Robert',
      'Thorne',
      'Dr. Robert Thorne, MD, FACS',
      'spec_ortho',
      'Orthopedic Surgery',
      'NY-MED-99412',
      250.00,
      'dr.robert@metrohealth.com',
      '+1 212 555 0144',
      'Attending Orthopedic Surgeon specializing in minimally invasive sports medicine and joint replacement.',
      'MD, Columbia University Vagelos College of Physicians and Surgeons, FACS',
      true,
      true,
      'ACTIVE',
      new Date().toISOString(),
      new Date().toISOString()
    ]
  );

  // 6b. Provider-to-Department Assignments
  await db.query(
    `INSERT INTO provider_departments (id, provider_id, department_id, is_primary, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    ['pd_sarah_cardio', 'prov_sarah', 'dept_cardio', true, new Date().toISOString()]
  );
  await db.query(
    `INSERT INTO provider_departments (id, provider_id, department_id, is_primary, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    ['pd_sarah_genmed', 'prov_sarah', 'dept_genmed', false, new Date().toISOString()]
  );

  // 6c. Appointment Types
  const aptTypes = [
    { id: 'at_general', org: 'org_st_jude', name: 'General Consultation', code: 'GEN_CONSULT', duration: 30, bufBefore: 5, bufAfter: 5, color: '#0d9488', desc: 'Standard clinical consultation and physical checkup' },
    { id: 'at_specialist', org: 'org_st_jude', name: 'Specialist Evaluation', code: 'SPEC_EVAL', duration: 45, bufBefore: 10, bufAfter: 10, color: '#0284c7', desc: 'Comprehensive secondary care specialist diagnostic review' },
    { id: 'at_followup', org: 'org_st_jude', name: 'Follow-Up Review', code: 'FOLLOW_UP', duration: 20, bufBefore: 5, bufAfter: 0, color: '#16a34a', desc: 'Progress monitoring and prescription adjustment' },
    { id: 'at_telehealth', org: 'org_st_jude', name: 'Telehealth Video Visit', code: 'TELEHEALTH', duration: 30, bufBefore: 0, bufAfter: 0, color: '#8b5cf6', desc: 'Remote encrypted telehealth consultation' },
    { id: 'at_metro_general', org: 'org_metro_health', name: 'Orthopedic Consultation', code: 'ORTHO_CONSULT', duration: 45, bufBefore: 10, bufAfter: 5, color: '#d97706', desc: 'Orthopedic examination and imaging review' }
  ];

  for (const at of aptTypes) {
    await db.query(
      `INSERT INTO appointment_types (id, organization_id, name, code, description, duration_minutes, buffer_before_minutes, buffer_after_minutes, is_active, allow_self_booking, color_code, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [at.id, at.org, at.name, at.code, at.desc, at.duration, at.bufBefore, at.bufAfter, true, true, at.color, new Date().toISOString(), new Date().toISOString()]
    );
  }

  // 6d. Provider Availability (Recurring Monday to Friday)
  // 1=Monday through 5=Friday
  for (let dow = 1; dow <= 5; dow++) {
    await db.query(
      `INSERT INTO provider_availability (id, organization_id, provider_id, day_of_week, start_time, end_time, timezone, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [`avail_sarah_${dow}`, 'org_st_jude', 'prov_sarah', dow, '09:00', '17:00', 'Europe/London', true, new Date().toISOString()]
    );
  }
  for (let dow = 1; dow <= 4; dow++) {
    await db.query(
      `INSERT INTO provider_availability (id, organization_id, provider_id, day_of_week, start_time, end_time, timezone, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [`avail_robert_${dow}`, 'org_metro_health', 'prov_robert', dow, '08:30', '16:30', 'America/New_York', true, new Date().toISOString()]
    );
  }

  // 7. Patients
  await db.query(
    `INSERT INTO patients 
      (id, organization_id, user_id, mrn, first_name, last_name, date_of_birth, gender, blood_group, email, phone, address_line1, city, postal_code, preferred_language, contact_preference, emergency_contact_name, emergency_contact_phone, allergies_summary, primary_provider_id, status, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
    [
      'pat_david',
      'org_st_jude',
      'usr_david',
      'MRN-90421',
      'David',
      'Miller',
      '1984-06-14',
      'MALE',
      'A_POSITIVE',
      'patient.david@clinilync.com',
      '+44 7700 900128',
      '12 Kensington Court',
      'London',
      'W8 5DL',
      'en',
      'EMAIL',
      'Clara Miller (Spouse)',
      '+44 7700 900999',
      'Penicillin (Urticaria), Shellfish (Moderate)',
      'prov_sarah',
      'ACTIVE',
      true,
      new Date().toISOString(),
      new Date().toISOString()
    ]
  );

  await db.query(
    `INSERT INTO patients 
      (id, organization_id, user_id, mrn, first_name, last_name, date_of_birth, gender, blood_group, email, phone, address_line1, city, postal_code, preferred_language, contact_preference, emergency_contact_name, emergency_contact_phone, allergies_summary, primary_provider_id, status, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
    [
      'pat_olivia',
      'org_st_jude',
      null,
      'MRN-90422',
      'Olivia',
      'Taylor',
      '1991-11-23',
      'FEMALE',
      'O_POSITIVE',
      'olivia.taylor@example.com',
      '+44 7700 900331',
      '88 Richmond Hill',
      'London',
      'TW10 6RP',
      'en',
      'PHONE',
      'Thomas Taylor (Father)',
      '+44 7700 900332',
      'No Known Drug Allergies (NKDA)',
      'prov_sarah',
      'ACTIVE',
      true,
      new Date().toISOString(),
      new Date().toISOString()
    ]
  );

  // Isolated Patient in Metro Health Organization
  await db.query(
    `INSERT INTO patients 
      (id, organization_id, user_id, mrn, first_name, last_name, date_of_birth, gender, blood_group, email, phone, address_line1, city, postal_code, preferred_language, contact_preference, emergency_contact_name, emergency_contact_phone, allergies_summary, primary_provider_id, status, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
    [
      'pat_jonathan',
      'org_metro_health',
      null,
      'MRN-20101',
      'Jonathan',
      'Cruz',
      '1978-03-09',
      'MALE',
      'B_POSITIVE',
      'jonathan.cruz@example.com',
      '+1 212 555 0188',
      '350 Madison Ave',
      'New York',
      '10017',
      'es',
      'SMS',
      'Maria Cruz',
      '+1 212 555 0189',
      'Sulfa Antibiotics',
      'prov_robert',
      'ACTIVE',
      true,
      new Date().toISOString(),
      new Date().toISOString()
    ]
  );

  // 7b. Patient Contacts
  await db.query(
    `INSERT INTO patient_contacts (id, organization_id, patient_id, name, relationship, phone, email, is_emergency_contact, has_legal_authority, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    ['cnt_david_1', 'org_st_jude', 'pat_david', 'Clara Miller', 'Spouse', '+44 7700 900999', 'clara.miller@example.com', true, true, new Date().toISOString(), new Date().toISOString()]
  );
  await db.query(
    `INSERT INTO patient_contacts (id, organization_id, patient_id, name, relationship, phone, email, is_emergency_contact, has_legal_authority, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    ['cnt_olivia_1', 'org_st_jude', 'pat_olivia', 'Thomas Taylor', 'Father', '+44 7700 900332', 'thomas.taylor@example.com', true, false, new Date().toISOString(), new Date().toISOString()]
  );
  await db.query(
    `INSERT INTO patient_contacts (id, organization_id, patient_id, name, relationship, phone, email, is_emergency_contact, has_legal_authority, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    ['cnt_jonathan_1', 'org_metro_health', 'pat_jonathan', 'Maria Cruz', 'Sister', '+1 212 555 0189', 'maria.cruz@example.com', true, false, new Date().toISOString(), new Date().toISOString()]
  );

  // 7c. Patient Consents
  await db.query(
    `INSERT INTO patient_consents (id, organization_id, patient_id, consent_type, purpose, status, granted_at, recorded_by_user_id, notes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    ['cns_david_1', 'org_st_jude', 'pat_david', 'GENERAL_TREATMENT', 'Standard clinical diagnosis, examination, and treatment authorization', 'GRANTED', new Date().toISOString(), 'usr_sarah', 'Signed during ambulatory intake', new Date().toISOString()]
  );
  await db.query(
    `INSERT INTO patient_consents (id, organization_id, patient_id, consent_type, purpose, status, granted_at, recorded_by_user_id, notes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    ['cns_david_2', 'org_st_jude', 'pat_david', 'TELEHEALTH', 'Authorization for remote encrypted video consultations and vitals telemetry', 'GRANTED', new Date().toISOString(), 'usr_sarah', 'Valid for 12 months', new Date().toISOString()]
  );
  await db.query(
    `INSERT INTO patient_consents (id, organization_id, patient_id, consent_type, purpose, status, granted_at, recorded_by_user_id, notes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    ['cns_olivia_1', 'org_st_jude', 'pat_olivia', 'GENERAL_TREATMENT', 'Outpatient primary care and diagnostic testing', 'GRANTED', new Date().toISOString(), 'usr_sarah', 'Electronic consent verified', new Date().toISOString()]
  );

  // 8. Appointments
  const today = new Date();
  const slot1 = new Date(today.getTime() + 2 * 60 * 60 * 1000).toISOString();
  const slot2 = new Date(today.getTime() + 4 * 60 * 60 * 1000).toISOString();

  await db.query(
    `INSERT INTO appointments 
      (id, organization_id, patient_id, provider_id, department_id, scheduled_time, duration_minutes, appointment_type, status, reason_for_visit, checked_in_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      'apt_101',
      'org_st_jude',
      'pat_david',
      'prov_sarah',
      'dept_cardio',
      slot1,
      45,
      'CONSULTATION',
      'CHECKED_IN',
      'Routine cardiovascular evaluation and BP monitoring review',
      new Date().toISOString(),
      new Date().toISOString(),
      new Date().toISOString()
    ]
  );

  await db.query(
    `INSERT INTO appointments 
      (id, organization_id, patient_id, provider_id, department_id, scheduled_time, duration_minutes, appointment_type, status, reason_for_visit, checked_in_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      'apt_102',
      'org_st_jude',
      'pat_olivia',
      'prov_sarah',
      'dept_cardio',
      slot2,
      30,
      'FOLLOW_UP',
      'SCHEDULED',
      'Palpitations during exercise follow-up',
      null,
      new Date().toISOString(),
      new Date().toISOString()
    ]
  );

  // 9. Clinical Encounters (SOAP Notes)
  await db.query(
    `INSERT INTO clinical_records 
      (id, organization_id, patient_id, provider_id, appointment_id, encounter_date, encounter_type, chief_complaint, subjective, objective, assessment, plan, is_finalized, finalized_at, finalized_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      'rec_501',
      'org_st_jude',
      'pat_david',
      'prov_sarah',
      'apt_101',
      new Date().toISOString(),
      'OUTPATIENT_CONSULTATION',
      'Follow-up for borderline systolic hypertension and routine lipid profile review',
      'Patient reports good tolerance of Amlodipine 5mg. Denies chest pain, orthopnea, or dyspnea on moderate exertion. Has maintained low-sodium Mediterranean diet.',
      'Well-appearing male in no distress. Heart regular rate and rhythm without murmurs, rubs, or gallops. Lungs clear to auscultation bilaterally. No peripheral pedal edema.',
      'Primary essential hypertension (I10) - well controlled on current monotherapy. Mild mixed hyperlipidemia (E78.5).',
      '1. Continue Amlodipine 5mg once daily in morning. 2. Repeat lipid panel and comprehensive metabolic panel in 6 months. 3. Continue aerobic activity 150 min/week.',
      true,
      new Date().toISOString(),
      'usr_sarah',
      new Date().toISOString(),
      new Date().toISOString()
    ]
  );

  // 10. Diagnoses
  await db.query(
    `INSERT INTO diagnoses (id, organization_id, patient_id, clinical_record_id, code, description, severity, status, diagnosed_date, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    ['diag_1', 'org_st_jude', 'pat_david', 'rec_501', 'I10', 'Essential (Primary) Hypertension', 'MODERATE', 'ACTIVE', '2025-04-12', new Date().toISOString()]
  );
  await db.query(
    `INSERT INTO diagnoses (id, organization_id, patient_id, clinical_record_id, code, description, severity, status, diagnosed_date, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    ['diag_2', 'org_st_jude', 'pat_david', 'rec_501', 'E78.5', 'Hyperlipidemia, Unspecified', 'MILD', 'ACTIVE', '2025-08-20', new Date().toISOString()]
  );

  // 11. Allergies
  await db.query(
    `INSERT INTO allergies (id, organization_id, patient_id, allergen, reaction, severity, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    ['alg_1', 'org_st_jude', 'pat_david', 'Penicillin G & V', 'Generalized urticaria and pruritus', 'MODERATE', 'ACTIVE', new Date().toISOString()]
  );

  // 12. Vitals
  await db.query(
    `INSERT INTO vitals (id, organization_id, patient_id, clinical_record_id, recorded_by, systolic_bp, diastolic_bp, heart_rate, respiratory_rate, temperature_celsius, oxygen_saturation, weight_kg, height_cm, bmi, recorded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    ['vit_1', 'org_st_jude', 'pat_david', 'rec_501', 'usr_marcus', 126, 80, 68, 15, 36.6, 99, 78.5, 178.0, 24.8, new Date().toISOString()]
  );

  // 13. Prescriptions
  await db.query(
    `INSERT INTO prescriptions 
      (id, organization_id, patient_id, provider_id, clinical_record_id, medication_name, dosage, frequency, duration, quantity, refills_remaining, instructions, status, start_date, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      'rx_1',
      'org_st_jude',
      'pat_david',
      'prov_sarah',
      'rec_501',
      'Amlodipine Besylate',
      '5 mg Oral Tablet',
      'Once Daily in the Morning',
      '90 Days',
      90,
      3,
      'Take 1 tablet every morning with water. Monitor blood pressure periodically.',
      'ACTIVE',
      '2026-01-15',
      new Date().toISOString()
    ]
  );

  // 14. Lab Orders
  await db.query(
    `INSERT INTO lab_orders (id, organization_id, patient_id, provider_id, test_code, test_name, priority, status, clinical_indication, ordered_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    ['lab_1', 'org_st_jude', 'pat_david', 'prov_sarah', 'LAB-LIPID', 'Comprehensive Lipid Panel (HDL/LDL/Triglycerides)', 'ROUTINE', 'COMPLETED', 'Hyperlipidemia surveillance', new Date().toISOString()]
  );

  // 15. Services (Catalog)
  await db.query(
    `INSERT INTO services (id, organization_id, code, name, description, unit_price, currency, is_active, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    ['svc_cons', 'org_st_jude', 'CPT-99214', 'Specialist Outpatient Consultation (Level 4)', 'Comprehensive 45-minute clinical evaluation', 180.00, 'GBP', true, new Date().toISOString()]
  );
  await db.query(
    `INSERT INTO services (id, organization_id, code, name, description, unit_price, currency, is_active, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    ['svc_ecg', 'org_st_jude', 'CPT-93000', '12-Lead Diagnostic Electrocardiogram (ECG)', 'Tracing and physician interpretation', 70.00, 'GBP', true, new Date().toISOString()]
  );

  // 16. Invoices & Items
  await db.query(
    `INSERT INTO invoices 
      (id, organization_id, patient_id, invoice_number, issue_date, due_date, subtotal, tax, discount, total_amount, paid_amount, balance_due, currency, status, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      'inv_1001',
      'org_st_jude',
      'pat_david',
      'INV-2026-0089',
      '2026-03-01',
      '2026-03-31',
      250.00,
      0.00,
      0.00,
      250.00,
      250.00,
      0.00,
      'GBP',
      'PAID',
      'Settled in full via contactless debit payment.',
      new Date().toISOString(),
      new Date().toISOString()
    ]
  );

  await db.query(
    `INSERT INTO invoice_items (id, invoice_id, service_id, description, quantity, unit_price, total_price)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    ['item_1', 'inv_1001', 'svc_cons', 'Specialist Outpatient Consultation (Level 4)', 1, 180.00, 180.00]
  );
  await db.query(
    `INSERT INTO invoice_items (id, invoice_id, service_id, description, quantity, unit_price, total_price)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    ['item_2', 'inv_1001', 'svc_ecg', '12-Lead Diagnostic Electrocardiogram (ECG)', 1, 70.00, 70.00]
  );

  await db.query(
    `INSERT INTO payments (id, organization_id, invoice_id, patient_id, payment_number, payment_date, amount, currency, payment_method, reference_number, notes, recorded_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      'pay_1',
      'org_st_jude',
      'inv_1001',
      'pat_david',
      'REC-2026-0044',
      new Date().toISOString(),
      250.00,
      'GBP',
      'CARD',
      'AUTH-CHIP-98214',
      'Paid at clinic POS terminal',
      'usr_james',
      new Date().toISOString()
    ]
  );

  // 17. Audit Logs (Initial records)
  await db.query(
    `INSERT INTO audit_logs 
      (id, organization_id, actor_id, actor_role, action, resource_type, resource_id, ip_address, user_agent, metadata, severity, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      'audit_init_1',
      'org_st_jude',
      'usr_superadmin',
      'SUPER_ADMIN',
      'system.bootstrap',
      'Organization',
      'org_st_jude',
      '127.0.0.1',
      'CLINILYNC-Bootstrapper/1.0',
      JSON.stringify({ migration: 'completed', version: '1.0.0' }),
      'INFO',
      new Date().toISOString()
    ]
  );

  // 18. Phase 8 Clinical Encounters
  const nowIso = new Date().toISOString();
  await db.query(
    `INSERT INTO encounters (
      id, organization_id, patient_id, provider_id, appointment_id,
      encounter_type, status, reason_for_visit, started_at, ended_at,
      timezone, completed_at, completed_by_user_id, created_by_user_id, updated_by_user_id,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      'enc_david_1',
      'org_st_jude',
      'pat_david',
      'prov_sarah',
      'apt_101',
      'IN_PERSON',
      'COMPLETED',
      'Cardiology evaluation for post-exertional chest tightness',
      '2026-10-01T09:00:00Z',
      '2026-10-01T09:45:00Z',
      'Europe/London',
      '2026-10-01T09:45:00Z',
      'usr_sarah',
      'usr_sarah',
      'usr_sarah',
      '2026-10-01T09:00:00Z',
      '2026-10-01T09:45:00Z'
    ]
  );

  await db.query(
    `INSERT INTO encounters (
      id, organization_id, patient_id, provider_id, appointment_id,
      encounter_type, status, reason_for_visit, started_at,
      timezone, created_by_user_id, updated_by_user_id,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      'enc_david_2',
      'org_st_jude',
      'pat_david',
      'prov_sarah',
      null,
      'FOLLOW_UP',
      'IN_PROGRESS',
      'Review of Holter monitor telemetry and medication titration',
      nowIso,
      'Europe/London',
      'usr_sarah',
      'usr_sarah',
      nowIso,
      nowIso
    ]
  );

  await db.query(
    `INSERT INTO encounters (
      id, organization_id, patient_id, provider_id, appointment_id,
      encounter_type, status, reason_for_visit,
      timezone, created_by_user_id, updated_by_user_id,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      'enc_olivia_1',
      'org_st_jude',
      'pat_olivia',
      'prov_sarah',
      null,
      'IN_PERSON',
      'PLANNED',
      'Annual cardiovascular routine checkup and blood pressure monitoring',
      'Europe/London',
      'usr_elena',
      'usr_elena',
      nowIso,
      nowIso
    ]
  );

  // 19. Phase 8 Clinical Notes
  await db.query(
    `INSERT INTO clinical_notes (
      id, organization_id, encounter_id, patient_id, author_id, author_provider_id,
      note_type, status, version, chief_complaint, history_of_present_illness,
      past_medical_history, surgical_history, family_social_history,
      review_of_systems, physical_examination, assessment, plan, follow_up_instructions,
      signed_at, signed_by_user_id, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
    [
      'note_david_1',
      'org_st_jude',
      'enc_david_1',
      'pat_david',
      'usr_sarah',
      'prov_sarah',
      'PROGRESS_NOTE',
      'SIGNED',
      1,
      'Palpitations and mild exertional fatigue for 3 weeks',
      'Patient reports episodic tachycardia lasting 5-10 minutes, exacerbated by caffeinated beverages and high work-related stress. No syncope, diaphoresis, or radiating substernal pain.',
      'Mild essential hypertension diagnosed 2021.',
      'Appendectomy 2012 (uncomplicated).',
      'Father had CAD at age 62. Non-smoker, occasional alcohol.',
      'Cardiovascular: positive for palpitations. Negative for dyspnea on exertion, orthopnea, or lower extremity edema.',
      'BP 122/78 mmHg, HR 72 bpm regular. S1/S2 distinct with no murmurs, rubs, or gallops. Lungs clear to auscultation bilaterally. No peripheral edema.',
      'Intermittent sinus tachycardia, likely stress and caffeine mediated. Essential hypertension well controlled.',
      '1. Advised elimination of afternoon caffeinated drinks.\n2. Prescribed 14-day ambulatory cardiac patch monitoring.\n3. Continue lifestyle dietary sodium reduction.',
      'Follow-up in clinic in 3 weeks to review patch monitor analytics or sooner if symptoms worsen.',
      '2026-10-01T09:45:00Z',
      'usr_sarah',
      '2026-10-01T09:20:00Z',
      '2026-10-01T09:45:00Z'
    ]
  );

  // Snapshot version 1 of signed note
  await db.query(
    `INSERT INTO clinical_note_versions (
      id, note_id, organization_id, version_number, status, snapshot_data,
      author_id, signed_by_user_id, signed_at, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      'cnv_david_1_v1',
      'note_david_1',
      'org_st_jude',
      1,
      'SIGNED',
      JSON.stringify({
        id: 'note_david_1',
        chief_complaint: 'Palpitations and mild exertional fatigue for 3 weeks',
        assessment: 'Intermittent sinus tachycardia, likely stress and caffeine mediated.'
      }),
      'usr_sarah',
      'usr_sarah',
      '2026-10-01T09:45:00Z',
      '2026-10-01T09:45:00Z'
    ]
  );

  // Draft note for in-progress encounter
  await db.query(
    `INSERT INTO clinical_notes (
      id, organization_id, encounter_id, patient_id, author_id, author_provider_id,
      note_type, status, version, chief_complaint, history_of_present_illness,
      assessment, plan, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      'note_david_2',
      'org_st_jude',
      'enc_david_2',
      'pat_david',
      'usr_sarah',
      'prov_sarah',
      'PROGRESS_NOTE',
      'DRAFT',
      1,
      'Review of ambulatory cardiac patch results',
      'Patient reports significant improvement after reducing caffeine. Zero syncopal episodes recorded.',
      'Patch monitor demonstrates predominantly normal sinus rhythm with occasional benign PACs.',
      'Continue current conservative management. Routine follow-up in 6 months.',
      nowIso,
      nowIso
    ]
  );

  // 20. Phase 8 Clinical Observations & Vital Signs
  const initialVitals = [
    { type: 'BLOOD_PRESSURE_SYSTOLIC', val: 122, unit: 'mmHg' },
    { type: 'BLOOD_PRESSURE_DIASTOLIC', val: 78, unit: 'mmHg' },
    { type: 'HEART_RATE', val: 72, unit: 'bpm' },
    { type: 'RESPIRATORY_RATE', val: 16, unit: 'breaths/min' },
    { type: 'BODY_TEMPERATURE', val: 36.8, unit: 'celsius' },
    { type: 'OXYGEN_SATURATION', val: 99, unit: '%' },
    { type: 'HEIGHT', val: 178, unit: 'cm' },
    { type: 'WEIGHT', val: 75, unit: 'kg' },
    { type: 'BMI', val: 23.7, unit: 'kg/m2' }
  ];

  for (const v of initialVitals) {
    await db.query(
      `INSERT INTO clinical_observations (
        id, organization_id, encounter_id, patient_id, recorded_by_user_id,
        observation_type, numeric_value, unit, status, measured_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        `obs_david_${v.type.toLowerCase()}`,
        'org_st_jude',
        'enc_david_1',
        'pat_david',
        'usr_marcus',
        v.type,
        v.val,
        v.unit,
        'FINAL',
        '2026-10-01T09:05:00Z',
        '2026-10-01T09:05:00Z'
      ]
    );
  }

  // 21. Phase 9 Curated Terminology Concepts (Open WHO ICD-10 starter catalogue)
  const terminologyConcepts = [
    { code: 'I10', display: 'Essential (primary) hypertension', cat: 'CARDIOVASCULAR' },
    { code: 'R00.0', display: 'Tachycardia, unspecified', cat: 'CARDIOVASCULAR' },
    { code: 'R00.2', display: 'Palpitations', cat: 'CARDIOVASCULAR' },
    { code: 'E11.9', display: 'Type 2 diabetes mellitus without complications', cat: 'ENDOCRINE' },
    { code: 'J45.909', display: 'Unspecified asthma, uncomplicated', cat: 'RESPIRATORY' },
    { code: 'J06.9', display: 'Acute upper respiratory infection, unspecified', cat: 'RESPIRATORY' },
    { code: 'M54.5', display: 'Low back pain', cat: 'MUSCULOSKELETAL' },
    { code: 'K21.9', display: 'Gastro-esophageal reflux disease without esophagitis', cat: 'GASTROINTESTINAL' },
    { code: 'F41.1', display: 'Generalized anxiety disorder', cat: 'BEHAVIORAL' },
    { code: 'G43.909', display: 'Migraine, unspecified, not intractable', cat: 'NEUROLOGY' }
  ];

  for (const c of terminologyConcepts) {
    await db.query(
      `INSERT INTO terminology_concepts (
        id, system, version, code, display_name, category, is_active, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        `term_${c.code.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        'ICD-10',
        '2026',
        c.code,
        c.display,
        c.cat,
        true,
        nowIso
      ]
    );
  }

  // 22. Phase 9 Encounter Diagnoses for enc_david_1
  await db.query(
    `INSERT INTO encounter_diagnoses (
      id, organization_id, patient_id, encounter_id, diagnosis_code,
      terminology_system, terminology_version, display_name, description,
      diagnosis_type, is_primary, clinical_status, onset_date, diagnosed_date,
      recorded_by_user_id, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      'diag_david_1',
      'org_st_jude',
      'pat_david',
      'enc_david_1',
      'R00.0',
      'ICD-10',
      '2026',
      'Tachycardia, unspecified',
      'Episodic sinus tachycardia correlated with high caffeine intake and work fatigue.',
      'PRIMARY',
      true,
      'ACTIVE',
      '2026-09-10',
      '2026-10-01',
      'usr_sarah',
      '2026-10-01T09:40:00Z',
      '2026-10-01T09:40:00Z'
    ]
  );

  await db.query(
    `INSERT INTO encounter_diagnoses (
      id, organization_id, patient_id, encounter_id, diagnosis_code,
      terminology_system, terminology_version, display_name, description,
      diagnosis_type, is_primary, clinical_status, onset_date, diagnosed_date,
      recorded_by_user_id, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      'diag_david_2',
      'org_st_jude',
      'pat_david',
      'enc_david_1',
      'I10',
      'ICD-10',
      '2026',
      'Essential (primary) hypertension',
      'Under stable lifestyle and dietary control. Monitored concurrently.',
      'SECONDARY',
      false,
      'ACTIVE',
      '2021-04-15',
      '2026-10-01',
      'usr_sarah',
      '2026-10-01T09:41:00Z',
      '2026-10-01T09:41:00Z'
    ]
  );

  // 23. Phase 9 Longitudinal Patient Problems (Separate from single encounters!)
  await db.query(
    `INSERT INTO patient_problems (
      id, organization_id, patient_id, problem_name, code, terminology_system,
      status, onset_date, encounter_id, recorded_by_user_id, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      'prob_david_1',
      'org_st_jude',
      'pat_david',
      'Essential (primary) hypertension',
      'I10',
      'ICD-10',
      'ACTIVE',
      '2021-04-15',
      'enc_david_1',
      'usr_sarah',
      '2026-10-01T09:42:00Z',
      '2026-10-01T09:42:00Z'
    ]
  );

  // 24. Phase 9 Care Plans & Items
  await db.query(
    `INSERT INTO care_plans (
      id, organization_id, patient_id, encounter_id, responsible_provider_id,
      title, clinical_rationale, description, start_date, review_date,
      status, created_by_user_id, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      'cp_david_1',
      'org_st_jude',
      'pat_david',
      'enc_david_1',
      'prov_sarah',
      'Cardiac Rhythm Assessment & Palpitations Care Plan',
      'Evaluate episodic tachycardia and confirm benign rhythm pattern.',
      'Comprehensive 3-week diagnostic protocol combining ambulatory monitoring, caffeine cessation, and follow-up consultation.',
      '2026-10-01',
      '2026-10-22',
      'ACTIVE',
      'usr_sarah',
      '2026-10-01T09:43:00Z',
      '2026-10-01T09:43:00Z'
    ]
  );

  await db.query(
    `INSERT INTO care_plan_items (
      id, organization_id, care_plan_id, patient_id, category,
      description, responsible_role, due_date, status, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      'cpi_david_1',
      'org_st_jude',
      'cp_david_1',
      'pat_david',
      'SELF_CARE',
      'Eliminate afternoon and evening caffeinated beverages; limit morning coffee to 1 cup.',
      'PATIENT',
      '2026-10-15',
      'IN_PROGRESS',
      '2026-10-01T09:43:00Z',
      '2026-10-01T09:43:00Z'
    ]
  );

  await db.query(
    `INSERT INTO care_plan_items (
      id, organization_id, care_plan_id, patient_id, category,
      description, responsible_role, due_date, status, completion_notes, completed_at, completed_by_user_id, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      'cpi_david_2',
      'org_st_jude',
      'cp_david_1',
      'pat_david',
      'MONITORING',
      'Wear continuous ambulatory cardiac telemetry patch for 14 days and record symptom diary.',
      'CLINICIAN',
      '2026-10-15',
      'COMPLETED',
      'Telemetry patch completed and retrieved. Analysis demonstrates benign premature atrial complexes.',
      '2026-10-08T16:00:00Z',
      'usr_sarah',
      '2026-10-01T09:43:00Z',
      '2026-10-08T16:00:00Z'
    ]
  );

  await db.query(
    `INSERT INTO care_plan_items (
      id, organization_id, care_plan_id, patient_id, category,
      description, responsible_role, due_date, status, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      'cpi_david_3',
      'org_st_jude',
      'cp_david_1',
      'pat_david',
      'CONSULTATION',
      'Attend cardiology follow-up consultation to review monitor analytics.',
      'PROVIDER',
      '2026-10-22',
      'PLANNED',
      '2026-10-01T09:43:00Z',
      '2026-10-01T09:43:00Z'
    ]
  );

  // 25. Phase 9 Follow-Up Instructions
  await db.query(
    `INSERT INTO follow_up_instructions (
      id, organization_id, patient_id, encounter_id, care_plan_id,
      timeframe, reassessment_date, instructions, warning_signs,
      is_patient_facing, author_id, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      'fup_david_1',
      'org_st_jude',
      'pat_david',
      'enc_david_1',
      'cp_david_1',
      '3 weeks',
      '2026-10-22',
      'Return to St. Jude Cardiology Clinic in 3 weeks for telemetry readout. Maintain daily pulse logging if symptoms occur.',
      'Seek emergency medical care immediately if you experience chest tightness, pain radiating to left arm or jaw, shortness of breath, or feeling faint.',
      true,
      'usr_sarah',
      '2026-10-01T09:44:00Z',
      '2026-10-01T09:44:00Z'
    ]
  );

  // 26. Phase 9 Clinical Decision Support Foundations (Safety-Gated Rules & Evaluated Alerts)
  await db.query(
    `INSERT INTO clinical_rules (
      id, organization_id, title, description, clinical_context,
      rule_status, severity, evidence_reference, human_explanation,
      created_by_user_id, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      'rule_hypertension_bp',
      'org_st_jude',
      'Elevated Blood Pressure Protocol Assessment Alert',
      'Flags resting systolic BP >= 140 mmHg or diastolic >= 90 mmHg for clinician review.',
      'VITALS_ASSESSMENT',
      'DISABLED', // Safety requirement: non-production / disabled by default
      'INFO',
      '2017 ACC/AHA Guideline for the Prevention, Detection, Evaluation, and Management of High Blood Pressure in Adults',
      'Resting blood pressure above Stage 2 hypertension thresholds warrants clinical confirmation and non-pharmacologic or pharmacologic review by an attending physician.',
      'usr_sarah',
      nowIso,
      nowIso
    ]
  );

  await db.query(
    `INSERT INTO clinical_alerts (
      id, organization_id, patient_id, encounter_id, rule_id,
      rule_version, severity, explanation, trigger_context,
      review_status, reviewed_by_user_id, reviewed_at, review_notes, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      'alert_david_1',
      'org_st_jude',
      'pat_david',
      'enc_david_1',
      'rule_hypertension_bp',
      '1.0',
      'INFO',
      'Patient has documented history of essential hypertension with controlled vitals.',
      'Intake BP recorded at 122/78 mmHg. Normal sinus rate.',
      'ACKNOWLEDGED',
      'usr_sarah',
      '2026-10-01T09:44:30Z',
      'Current blood pressure is within normal parameters. Ongoing conservative management reaffirmed.',
      '2026-10-01T09:44:30Z'
    ]
  );

  console.log('[CLINILYNC Seed] Database initialized and seeded successfully.');
}
