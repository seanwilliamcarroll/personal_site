export const SITE = {
  website: "https://www.seanwilliamcarroll.com/",
  author: "Sean Carroll",
  profile: "https://www.seanwilliamcarroll.com/about",
  desc: "Sean Carroll's personal website.",
  title: "Sean William Carroll",

  lightAndDarkMode: true,
  postPerIndex: 4,
  postPerPage: 10,
  scheduledPostMargin: 15 * 60 * 1000, // 15 minutes
  showArchives: true,
  showBackButton: true,
  editPost: {
    enabled: false,
    text: "Edit page",
    url: "https://github.com/seanwilliamcarroll/personal_site/edit/main/astro-site/src/",
  },
  dynamicOgImage: true,
  dir: "ltr",
  lang: "en",
  timezone: "America/New_York",
} as const;
