# CB Nest automated maintenance and security checks

## Scheduled automation

- Dependabot checks npm dependencies for the mobile app, API, and web app every Monday.
- Dependabot also checks GitHub Actions versions every Monday.
- GitHub Actions runs dependency vulnerability audits daily at 05:00 West Africa Time.
- The daily workflow checks Expo SDK package compatibility and reports outdated npm packages.
- The workflow can also be started manually from GitHub Actions.

## How to respond to findings

1. Review Dependabot pull requests; do not enable automatic merging.
2. Prioritise critical and high-severity security advisories.
3. Run the full CI suite and review Expo compatibility before merging dependency changes.
4. If an Expo SDK or native dependency changes, create and test a new native build before release.
5. Publish production changes only after review and successful validation.

## Repository settings still required

In GitHub repository Settings → Security → Code security and analysis, enable:

- Dependabot alerts
- Dependabot security updates
- Secret scanning and push protection, if available for this repository plan

The workflow and Dependabot configuration do not themselves change these repository-level security settings.

## Scope and limitations

These checks detect dependency vulnerabilities and available updates. They do not replace application penetration testing, runtime monitoring, RLS/security-policy reviews, or human review of dependency changes. The scheduled workflow does not deploy updates or automatically merge dependency PRs.
