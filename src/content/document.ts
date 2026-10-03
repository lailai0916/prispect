export type BilingualText = readonly [zh: string, en: string];

export interface DocumentSection {
  id: string;
  title: BilingualText;
  paragraphs?: BilingualText[];
  bullets?: BilingualText[];
  table?: { columns: BilingualText[]; rows: BilingualText[][] };
  links?: { label: BilingualText; href: string }[];
  emphasis?: boolean;
}

export interface ProductDocument {
  title: BilingualText;
  description: BilingualText;
  version: string;
  updatedAt: string;
  sections: DocumentSection[];
}

export const DOCUMENT_DATE = '2026-10-02';
export const DOCUMENT_VERSION = '1.0';
