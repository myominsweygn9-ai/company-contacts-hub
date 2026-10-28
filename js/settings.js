/**
 * settings.js
 * ------------------------------------------------------------------
 * The few things you are likely to want to change by hand.
 * Everything else (vendors, news, categories) is edited on the site.
 * ------------------------------------------------------------------
 */
const APP_SETTINGS = {
  appName: "CONTACTS HUB",
  tagline: "Trusted vendors & team news",

  // Posts in this news category appear on the "Work Policy" page instead of
  // "News & Updates". Keep this name in the category list.
  policyCategory: "Work Policy",
  legacyPolicyCategory: "Company Policy", // old name, renamed automatically by the admin's first visit

  // Starting lists. Once the admin opens the site, these are saved to the
  // database and from then on are edited in Admin > Categories.
  defaultVendorCategories: [
    "Electrical",
    "M&E",
    "Aircon / HVAC",
    "Plumbing",
    "Fire Protection",
    "Lifts",
    "Security / CCTV",
    "Pest Control",
    "Cleaning",
    "Landscaping",
    "Civil / Building Works",
    "Other",
  ],
  defaultNewsCategories: [
    "Work Policy",
    "Safety Notice",
    "Announcement",
    "Tips & Know-how",
  ],
};
