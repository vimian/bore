import { BASICS_GUIDES } from "@/lib/guides/basics-guides";
import { FEATURE_GUIDES } from "@/lib/guides/feature-guides";
import { FRAMEWORK_GUIDES } from "@/lib/guides/framework-guides";
import type { Guide, GuideCategory } from "@/lib/guides/types";
import { WORKFLOW_GUIDES } from "@/lib/guides/workflow-guides";

export type { Guide, GuideCategory } from "@/lib/guides/types";

export const GUIDE_GROUPS: Array<{
  category: GuideCategory;
  title: string;
  description: string;
}> = [
  {
    category: "basics",
    title: "HTTPS Basics",
    description: "Start with the common local development problems: local websites, local APIs, and cross-device testing.",
  },
  {
    category: "frameworks",
    title: "Framework Guides",
    description: "Practical HTTPS setup for common JavaScript and TypeScript development stacks.",
  },
  {
    category: "workflows",
    title: "Workflow Guides",
    description: "Use-case pages for webhooks, OAuth callbacks, secure cookies, and auth-heavy development flows.",
  },
  {
    category: "features",
    title: "Bore-Specific Features",
    description: "The parts of Bore that matter when one hostname is not enough.",
  },
];

export const GUIDES: Guide[] = [
  ...BASICS_GUIDES,
  ...FRAMEWORK_GUIDES,
  ...WORKFLOW_GUIDES,
  ...FEATURE_GUIDES,
];

export function getGuide(slug: string) {
  return GUIDES.find((guide) => guide.slug === slug);
}

export function getGuidesByCategory(category: GuideCategory) {
  return GUIDES.filter((guide) => guide.category === category);
}

export function getRelatedGuides(guide: Guide, limit = 4) {
  return GUIDES.filter((item) => item.slug !== guide.slug)
    .sort((left, right) => {
      const leftScore = Number(left.category === guide.category);
      const rightScore = Number(right.category === guide.category);
      return rightScore - leftScore || left.title.localeCompare(right.title);
    })
    .slice(0, limit);
}
