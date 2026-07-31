export type DocCode = {
  label: string;
  value: string;
};

export type DocSection = {
  id: string;
  title: string;
  eyebrow?: string;
  paragraphs: string[];
  bullets?: string[];
  code?: DocCode[];
  callout?: string;
};

export type DocStep = {
  title: string;
  text: string;
  code?: string;
};

export type DocFaq = {
  question: string;
  answer: string;
};

export type DocLink = {
  label: string;
  href: string;
  external?: boolean;
};

export type ComparisonRow = {
  capability: string;
  bore: string;
  alternative: string;
};

export type Comparison = {
  alternativeName: string;
  checkedAt: string;
  rows: ComparisonRow[];
};

export type SeoDoc = {
  slug: "nextjs-localhost" | "webhook-testing" | "vs-ngrok";
  kind: "how-to" | "comparison";
  eyebrow: string;
  title: string;
  description: string;
  intro: string;
  updatedAt: string;
  readTime: string;
  keywords: string[];
  outcomes: string[];
  steps?: DocStep[];
  sections: DocSection[];
  comparison?: Comparison;
  faq: DocFaq[];
  resources: DocLink[];
  related: DocLink[];
  cta: {
    title: string;
    body: string;
    primary: DocLink;
    secondary: DocLink;
  };
};
