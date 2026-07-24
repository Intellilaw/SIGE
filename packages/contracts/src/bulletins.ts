export const BULLETIN_STATUSES = ["DRAFT", "APPROVED"] as const;
export type BulletinStatus = (typeof BULLETIN_STATUSES)[number];

export const BULLETIN_ORIGINS = ["GENERATED", "UPLOADED"] as const;
export type BulletinOrigin = (typeof BULLETIN_ORIGINS)[number];

export const BULLETIN_GENERATION_STATUSES = ["PENDING", "PROCESSING", "READY", "FAILED"] as const;
export type BulletinGenerationStatus = (typeof BULLETIN_GENERATION_STATUSES)[number];

export type BulletinPageCount = 1 | 2;

export interface BulletinBlock {
  id: string;
  headingEs: string;
  headingEn: string;
  bodyEs: string;
  bodyEn: string;
}

export interface BulletinAttachment {
  id: string;
  originalFileName: string;
  fileMimeType: string | null;
  fileSizeBytes: number;
  uploadedAt: string;
}

export interface Bulletin {
  id: string;
  organizationId: string;
  origin: BulletinOrigin;
  status: BulletinStatus;
  generationStatus: BulletinGenerationStatus;
  generationError: string | null;
  generationStartedAt: string | null;
  generationCompletedAt: string | null;
  bulletinDate: string;
  titleEs: string;
  titleEn: string;
  pageCount: BulletinPageCount;
  twoPageReason: string | null;
  blocks: BulletinBlock[];
  sourceText: string | null;
  sourceUrls: string[];
  attachments: BulletinAttachment[];
  hasDocx: boolean;
  hasPdf: boolean;
  approvedAt: string | null;
  approvedByUserId: string | null;
  approvedByName: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BulletinDraftInput {
  bulletinDate: string;
  titleEs: string;
  titleEn: string;
  pageCount: BulletinPageCount;
  twoPageReason?: string | null;
  blocks: BulletinBlock[];
}

export interface BulletinGenerationAttachmentInput {
  originalFileName: string;
  fileMimeType?: string | null;
  fileBase64: string;
}

export interface BulletinGenerationInput {
  sourceText?: string;
  sourceUrls?: string[];
  attachments?: BulletinGenerationAttachmentInput[];
}

export interface BulletinUploadInput {
  title: string;
  bulletinDate: string;
  docx?: BulletinGenerationAttachmentInput | null;
  pdf?: BulletinGenerationAttachmentInput | null;
}
