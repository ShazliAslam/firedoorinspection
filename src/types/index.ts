export type Role = 'owner' | 'admin' | 'inspector' | 'technician' | 'client';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  phone?: string;
  email?: string;
  address?: string;
  website?: string;
  logo_url?: string;
  primary_color?: string;
  license_number?: string;
  created_at?: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  job_title?: string;
  active_organization_id?: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id?: string;
  email: string;
  full_name?: string;
  role: Role;
  client_id?: string | null;
  status: 'active' | 'invited' | 'inactive';
  notification_preferences?: Record<string, boolean>;
  created_at?: string;
}

export interface SubscriptionInfo {
  id?: string;
  plan_tier: 'Starter' | 'Professional' | 'Business';
  status: string;
  max_doors: number;
  max_users: number;
  max_storage_mb: number;
  current_period_end?: string;
}

export interface InspectionTemplateItem {
  id?: string;
  template_id?: string;
  category: string;
  label: string;
  guidance_note?: string;
  sort_order?: number;
  required?: boolean;
}

export interface InspectionTemplate {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  is_default: boolean;
  active: boolean;
  items: InspectionTemplateItem[];
}

export interface WorkspaceBootstrap {
  needsOnboarding: boolean;
  profile: Profile;
  member?: OrganizationMember;
  assignedClient?: Client | null;
  organization?: Organization;
  organizations?: Array<{ id: string; name: string; slug: string }>;
  subscription?: SubscriptionInfo;
  usage?: { doors: number; users: number; storage_mb: number };
  members?: OrganizationMember[];
  templates?: InspectionTemplate[];
  capabilities: {
    aiConfigured: boolean;
    resendConfigured: boolean;
    stripeConfigured: boolean;
  };
}

export interface Client {
  id: string;
  organization_id: string;
  name: string;
  company_code?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  billing_address?: string;
  service_tier?: string;
  notes?: string;
  archived: boolean;
  building_count?: number;
  door_count?: number;
  open_deficiency_count?: number;
  created_at?: string;
}

export interface FloorOrArea {
  id: string;
  building_id: string;
  name: string;
  floor_number?: string;
  area_type?: string;
  notes?: string;
}

export interface Building {
  id: string;
  organization_id: string;
  client_id: string;
  client_name?: string;
  name: string;
  building_code?: string;
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  building_type?: string;
  total_floors?: number;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  notes?: string;
  archived: boolean;
  floors?: FloorOrArea[];
  door_count?: number;
  failed_door_count?: number;
  open_deficiency_count?: number;
  inspection_count?: number;
  created_at?: string;
}

export interface FireDoor {
  id: string;
  organization_id: string;
  client_id: string;
  client_name?: string;
  building_id: string;
  building_name?: string;
  building_address?: string;
  floor_area_id?: string | null;
  door_code: string;
  floor?: string;
  room_location: string;
  door_reference?: string;
  manufacturer?: string;
  door_type?: string;
  fire_rating?: string;
  frame_material?: string;
  installation_date?: string;
  last_inspection_date?: string;
  next_inspection_due?: string;
  status: 'Pass' | 'Deficient' | 'In Remediation' | 'Needs Inspection';
  qr_token: string;
  notes?: string;
  archived: boolean;
  open_deficiencies?: number;
}

export interface InspectionItem {
  id: string;
  inspection_id: string;
  fire_door_id: string;
  category: string;
  item_label: string;
  result: 'Pending' | 'Pass' | 'Fail' | 'N/A';
  observation?: string;
  severity_suggested?: 'Critical' | 'High' | 'Medium' | 'Low';
  deficiency_created: boolean;
}

export interface EvidenceFile {
  id: string;
  evidence_type: 'inspection_original' | 'before_repair' | 'after_repair' | 'document';
  immutable: boolean;
  file_name: string;
  storage_path: string;
  mime_type?: string;
  file_size?: number;
  caption?: string;
  tags?: string[];
  uploaded_by_name?: string;
  approved_for_client: boolean;
  signed_url?: string | null;
  fire_door_id?: string | null;
  inspection_id?: string | null;
  deficiency_id?: string | null;
  remediation_task_id?: string | null;
  created_at: string;
}

export interface Inspection {
  id: string;
  organization_id: string;
  client_id: string;
  client_name?: string;
  building_id: string;
  building_name?: string;
  building_address?: string;
  template_id?: string;
  inspection_code: string;
  title: string;
  inspector_id?: string;
  inspector_name?: string;
  scheduled_date?: string;
  completed_at?: string;
  status: 'Draft' | 'In Progress' | 'Submitted' | 'Completed';
  door_ids: string[];
  summary_notes?: string;
  reviewer_disclaimer_accepted?: boolean;
  door_count?: number;
  total_checks?: number;
  pass_count?: number;
  fail_count?: number;
  na_count?: number;
  doors?: FireDoor[];
  items?: InspectionItem[];
  evidence?: EvidenceFile[];
  deficiencies?: Deficiency[];
  created_at?: string;
}

export interface StatusHistoryEntry {
  status: string;
  changed_by: string;
  note: string;
  at: string;
}

export interface RemediationTask {
  id: string;
  deficiency_id: string;
  fire_door_id: string;
  building_id: string;
  client_id: string;
  client_name?: string;
  building_name?: string;
  door_code?: string;
  door_location?: string;
  assigned_technician_id?: string;
  assigned_technician_name?: string;
  due_date?: string;
  status: 'Assigned' | 'In Progress' | 'Awaiting Parts' | 'Submitted for Verification' | 'Rejected' | 'Verified';
  parts_needed?: string;
  repair_notes?: string;
  submitted_at?: string;
  verified_by_name?: string;
  verified_at?: string;
  rejection_reason?: string;
  deficiency?: Deficiency | null;
  evidence?: EvidenceFile[];
  created_at?: string;
}

export interface Deficiency {
  id: string;
  deficiency_code: string;
  client_id: string;
  client_name?: string;
  building_id: string;
  building_name?: string;
  fire_door_id: string;
  door_code?: string;
  door_location?: string;
  inspection_id?: string;
  category: string;
  title: string;
  description: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  status: 'Open' | 'Assigned' | 'In Progress' | 'Awaiting Parts' | 'Ready for Verification' | 'Verified' | 'Closed';
  assigned_technician_id?: string;
  assigned_technician_name?: string;
  due_date?: string;
  resolution_notes?: string;
  status_history?: StatusHistoryEntry[];
  verified_by?: string;
  verified_at?: string;
  remediation_task?: RemediationTask | null;
  evidence?: EvidenceFile[];
  created_at: string;
}

export interface ReportRecord {
  id: string;
  report_code: string;
  report_type: string;
  title: string;
  client_id: string;
  client_name?: string;
  building_id?: string;
  building_name?: string;
  shared_with_client: boolean;
  generated_by_name?: string;
  download_url?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface AppNotification {
  id: string;
  event_type: string;
  title: string;
  message: string;
  link_path?: string;
  read: boolean;
  email_status: string;
  recipient_email?: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_name: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  details?: Record<string, unknown>;
  created_at: string;
}
