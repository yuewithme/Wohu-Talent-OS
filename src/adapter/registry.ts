// Verified against the visible recommendation detail DOM on 2026-09-11.
export const DETAIL_SELECTORS = {
  version: 'boss-dom-summary-2026-09-11.1',
  path: '/web/frame/recommend/',
  root: '.dialog-wrap.active .lib-standard-resume .resume-summary',
  closing: '.v-leave, .v-leave-active, .v-leave-to',
  marker: 'h4',
  work: '.jobs:not(.education) > li',
  education: '.jobs.education > li',
  organization: 'h3 span',
  dates: 'h3 em',
  title: 'p span',
  degree: 'p em',
} as const;
