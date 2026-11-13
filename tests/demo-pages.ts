// Every page that embeds demos, and the demos on it (by the name each
// registers under). A new post with a demo is added here, and
// tests/demos.spec.ts then checks it like the rest.
export interface DemoPage {
  path: string;
  demos: string[];
}

export const DEMO_PAGES: DemoPage[] = [
  { path: "/posts/demo-wrapper-check/", demos: ["bounce"] },
  { path: "/posts/hello-particles/", demos: ["hello-particles"] },
];
