/**
 * Conventional Commits are REQUIRED — CI changelogs, the ship report and
 * the Notion "what's new" automation are all generated from them.
 * Format: type(scope): subject
 * See docs/conventions/git-workflow.md
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-empty': [1, 'never'],
    'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
  },
};
