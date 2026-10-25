# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately, not in public issues:

- Use GitHub's **[private vulnerability reporting](https://github.com/gigsnano/gigsnano/security/advisories/new)**.

Include the affected version or commit, steps to reproduce, and the impact you expect. We aim to acknowledge reports within 3 business days and to agree a disclosure date with you once a fix is ready.

## Supported versions

Security fixes land on `main` and in the next release. The hosted service at app.gigsnano.com is patched directly.

## Scope

In scope: code in this repository. Out of scope: findings that need a compromised host or a malicious administrator, missing hardening on a self-hosted instance that the README tells you to configure (`JWT_SECRET`, HTTPS, `COOKIE_SECURE`), and denial of service by volume.
