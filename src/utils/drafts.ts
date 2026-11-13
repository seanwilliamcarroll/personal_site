/** Whether drafts are built: only when `PUBLIC_SHOW_DRAFTS=true` is set
 *  in the environment (local preview and the demo tests). Never on
 *  Amplify, which sets nothing. */
export const SHOW_DRAFTS = import.meta.env.PUBLIC_SHOW_DRAFTS === "true";

/** A post that gets a page: not a draft, unless drafts are shown. */
export const isBuilt = ({ data }: { data: { draft?: boolean } }): boolean =>
  !data.draft || SHOW_DRAFTS;
