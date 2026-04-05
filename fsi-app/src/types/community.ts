// ══════════════════════════════════════════════════════════════
// Community Layer Types
// ══════════════════════════════════════════════════════════════

// ── Verification & Membership ──

export type VerificationTier = "unverified" | "email_verified" | "linkedin_verified" | "staff_verified";
export type MembershipTier = "free" | "member" | "contributor" | "verified" | "premium";
export type AffiliationType = "independent" | "vendor" | "academic" | "ngo" | "government";

// ── Profile ──

export interface CommunityProfile {
  id: string;
  full_name: string | null;
  display_name: string | null;
  headline: string | null;
  bio: string | null;
  avatar_url: string | null;
  organization: string | null;
  job_title: string | null;
  linkedin_url: string | null;
  linkedin_verified: boolean;
  verification_tier: VerificationTier;
  affiliation_type: AffiliationType | null;
  region: string | null;
  topic_interests: string[];
  membership_tier: MembershipTier;
  contribution_score: number;
  last_active_at: string | null;
}

// ── Forum ──

export type ThreadType = "discussion" | "question" | "case_study_link" | "intelligence_alert" | "announcement";

export interface ForumSection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  section_type: "regional" | "topical" | "global" | "special";
  primary_region_tag: string | null;
  primary_topic_tag: string | null;
  features_enabled: string[];
  is_public: boolean;
  minimum_membership_tier: string;
  sort_order: number;
  thread_count: number;
}

export interface ForumThread {
  id: string;
  section_id: string | null;
  title: string;
  body: string | null;
  author_id: string;
  thread_type: ThreadType;
  topic_tags: string[];
  region_tags: string[];
  transport_mode_tags: string[];
  vertical_tags: string[];
  linked_intelligence_item_ids: string[];
  linked_vendor_ids: string[];
  linked_case_study_ids: string[];
  linked_regulation_ids: string[];
  is_pinned: boolean;
  is_locked: boolean;
  reply_count: number;
  view_count: number;
  upvote_count: number;
  created_at: string;
  updated_at: string;
  // Joined
  author?: CommunityProfile;
  section?: ForumSection;
}

export interface ForumReply {
  id: string;
  thread_id: string;
  parent_reply_id: string | null;
  author_id: string;
  body: string;
  upvote_count: number;
  is_accepted_answer: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  author?: CommunityProfile;
}

// ── Vendors ──

export type VendorVerificationStatus = "unverified" | "peer_validated" | "staff_reviewed";
export type VendorListingTier = "basic" | "featured" | "premium";

export interface Vendor {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  company_website: string | null;
  company_size: string | null;
  hq_region: string | null;
  service_regions: string[];
  founded_year: number | null;
  logo_url: string | null;
  contact_name: string | null;
  contact_email: string | null; // Gated by membership tier
  contact_phone: string | null; // Gated by membership tier
  verification_status: VendorVerificationStatus;
  peer_endorsement_count: number;
  listing_tier: VendorListingTier;
  topic_tags: string[];
  region_tags: string[];
  transport_mode_tags: string[];
  vertical_tags: string[];
  created_at: string;
  updated_at: string;
}

export interface VendorEndorsement {
  id: string;
  vendor_id: string;
  endorser_id: string;
  endorsement_text: string | null;
  experience_context: string | null;
  created_at: string;
  endorser?: CommunityProfile;
}

// ── Case Studies ──

export type CaseStudyValidationStatus = "submitted" | "under_review" | "peer_validated" | "featured";

export interface CaseStudy {
  id: string;
  title: string;
  submitter_id: string;
  organization: string | null;
  industry_segment: string | null;
  challenge: string;
  solution: string;
  measurable_outcome: string | null;
  timeline: string | null;
  cost_reference: string | null;
  source_attribution: string | null;
  source_tier: number | null;
  region_tags: string[];
  topic_tags: string[];
  transport_mode_tags: string[];
  vertical_tags: string[];
  linked_regulation_ids: string[];
  linked_vendor_ids: string[];
  linked_technology_tags: string[];
  linked_thread_id: string | null;
  peer_validation_count: number;
  validation_status: CaseStudyValidationStatus;
  created_at: string;
  updated_at: string;
  submitter?: CommunityProfile;
}

// ── Notifications ──

export type NotificationEventType =
  | "regulation_updated"
  | "new_thread"
  | "thread_reply"
  | "vendor_endorsed"
  | "case_study_validated"
  | "source_discovered"
  | "intelligence_alert";

export interface NotificationSubscription {
  id: string;
  user_id: string;
  subscription_type: "regulation" | "vendor" | "topic" | "region" | "thread" | "source";
  target_id: string | null;
  target_tag: string | null;
  channels: string[];
}

export interface NotificationDelivery {
  id: string;
  event_id: string;
  user_id: string;
  channel: string;
  status: "pending" | "sent" | "failed" | "read";
  sent_at: string | null;
  read_at: string | null;
}

// ── Taxonomy ──

export type TaxonomyNodeType = "regulation" | "technology" | "region" | "topic" | "industry" | "transport_mode";

export interface TaxonomyNode {
  id: string;
  label: string;
  slug: string;
  node_type: TaxonomyNodeType;
  path: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
}
