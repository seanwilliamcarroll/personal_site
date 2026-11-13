import { isBuilt } from "@/utils/drafts";
import type { CollectionEntry } from "astro:content";
import { SITE } from "@/config";

const postFilter = (post: CollectionEntry<"blog">) => {
  const { data } = post;
  const isPublishTimePassed =
    Date.now() >
    new Date(data.pubDatetime).getTime() - SITE.scheduledPostMargin;
  return isBuilt(post) && (import.meta.env.DEV || isPublishTimePassed);
};

export default postFilter;
