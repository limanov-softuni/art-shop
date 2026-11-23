# Agent Instructions

## Project

- Work in this repository on the Art Shop System capstone project.
- Use HTML, CSS, vanilla JavaScript ES modules, Bootstrap, Node.js, npm, Vite, Supabase Database/Auth/Storage, and Render Static Site deployment.
- Do not introduce TypeScript, React, Vue, or another framework.

## Repository Behavior

- Inspect the workspace before changing files and preserve existing working code and unrelated changes.
- Implement only the current milestone.
- Keep the application as a genuine multi-page app with separate HTML entry files.
- Share components, services, and utilities through reusable ES modules.
- Keep SQL migrations committed and synchronized with Supabase migration history.
- Keep the implementation plan in `docs/implementation-plan.md` current as milestones change.

## Security and Data Integrity

- Never commit credentials, Supabase service-role keys, PayPal secrets, or invented deployment URLs.
- Browser configuration may contain only publishable/public values.
- Use Supabase RLS and database constraints to enforce access and order/inventory integrity.
- Never infer administrator or ownership access only on the browser.
- Render database and user content safely; do not insert untrusted HTML.

## UX and Quality

- Use accessible, responsive Bootstrap interfaces.
- Provide useful loading, empty, validation, confirmation, and error states.
- Display monetary values as EUR and use EUR consistently.
- Preserve intended behavior and avoid unrelated fixes.

## Verification and Delivery

- Verify version-specific APIs against official documentation.
- After a successful milestone, run relevant checks and `npm run build` when available.
- Review the git diff before committing.
- Commit only the milestone's changes.
- Include the required Co-authored-by trailer in Git commit messages.
- Push to the configured remote when available.
- Never force-push, backdate commits, or manufacture history.
- Report unavailable checks or unverified integrations honestly.
