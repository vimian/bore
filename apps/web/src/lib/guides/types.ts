export type GuideCategory = "basics" | "frameworks" | "workflows" | "features";

export type GuideStep = {
  title: string;
  body: string;
  code?: string;
};

export type GuideFaq = {
  question: string;
  answer: string;
};

export type Guide = {
  slug: string;
  category: GuideCategory;
  title: string;
  description: string;
  intro: string;
  updatedAt: string;
  queries: string[];
  highlights: string[];
  steps: GuideStep[];
  faq: GuideFaq[];
};
