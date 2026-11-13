import { SHOW_DRAFTS } from "@/utils/drafts";

/** Whether pages carry the Google Analytics tag: only in the build that
 *  is published (a production build, without drafts). `npm run dev` and
 *  the demo tests' build (`npm run build:demos`) have no tag, so neither
 *  counts as a visit. CI checks that the published build still has it
 *  (`.github/workflows/ci.yml`). */
export const ANALYTICS = import.meta.env.PROD && !SHOW_DRAFTS;
