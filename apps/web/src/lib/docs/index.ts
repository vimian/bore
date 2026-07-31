import { NEXTJS_LOCALHOST_DOC } from "@/lib/docs/nextjs-localhost";
import type { SeoDoc } from "@/lib/docs/types";
import { VS_NGROK_DOC } from "@/lib/docs/vs-ngrok";
import { WEBHOOK_TESTING_DOC } from "@/lib/docs/webhook-testing";

export type {
  Comparison,
  ComparisonRow,
  DocCode,
  DocFaq,
  DocLink,
  DocSection,
  DocStep,
  SeoDoc,
} from "@/lib/docs/types";

export const SEO_DOCS: SeoDoc[] = [
  NEXTJS_LOCALHOST_DOC,
  WEBHOOK_TESTING_DOC,
  VS_NGROK_DOC,
];

export function getSeoDoc(slug: string) {
  return SEO_DOCS.find((doc) => doc.slug === slug);
}
