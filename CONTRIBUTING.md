# Contributing to Arthimium RNS‑Merkle Airdrop

> **Thank you for helping us keep Solana airdrops fast, cheap, and trust‑minimised.** We welcome issues, pull requests, and constructive discussion that make the project safer, leaner, or easier to use.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Ground Rules](#2-ground-rules)
3. [Development Workflow](#3-development-workflow)
4. [Commit & PR Guidelines](#4-commit--pr-guidelines)
5. [Testing](#5-testing)
6. [Continuous Integration](#6-continuous-integration)
7. [Security Disclosures](#7-security-disclosures)
8. [License & Developer Certificate of Origin](#8-license--developer-certificate-of-origin)

---

## 1. Getting Started

### 1.1 Prerequisites

| Tool              | Version   | Notes                                                                              |
| ----------------- | --------- | ---------------------------------------------------------------------------------- |
| **Rust**          | 1.78.0    | `rustup toolchain install 1.78.0`                                                  |
| **Anchor CLI**    | 0.30.x    | `cargo install --git https://github.com/coral-xyz/anchor anchor-cli --tag v0.30.0` |
| **Solana CLI**    | ≥ 1.18.14 | `solana-install init 1.18.14`                                                      |
| **spl‑token‑cli** | 3.4.1     | `cargo install spl-token-cli`                                                      |
| **Node.js**       | ≥ 18 LTS  | Needed for the Mocha test suite                                                    |
| **Yarn**          | ≥ 1.22    | Package manager for JS tests                                                       |

### 1.2 Clone & Build

```bash
# Fork first, then:
git clone https://github.com/Takashi-Doyle/merkledrop-rns-contract.git
cd merkledrop-rns-contract
yarn install
anchor build
anchor test        # spins up local validator & runs full suite
```

---

## 2. Ground Rules

* Be respectful – follow our [Code of Conduct](CODE_OF_CONDUCT.md).
* Open an **issue** before starting work on large changes.
* Keep the contract **ultra‑light** – new features that increase state size need a clear rationale.
* Prefer **pure‑function** helpers and explicit, typed errors for auditability.

---

## 3. Development Workflow

1. **Create a branch**:

   ```bash
   git checkout -b feat/<short-description>
   ```
2. **Run all tests** (`anchor test`) – they must pass before PR.
3. **Add/Update tests** for new logic or bug fixes.
4. **Lint & format**:

   ```bash
   cargo fmt --all
   cargo clippy -- -D warnings
   yarn format     # if you add JS/TS files
   ```
5. **Push & open PR** to `main`. Fill in the PR template.

---

## 4. Commit & PR Guidelines

* Use **Conventional Commits**: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`.
* Squash commits or mark the PR **“Squash & Merge.”**
* PR description must include:

  * **Problem / motivation**
  * **Proposed solution**
  * **Gas / rent impact** (if state layout changes)
  * **Security considerations**

---

## 5. Testing

* Tests live in `tests/airdrop.ts` (Mocha + Anchor local validator).
* Every new feature **must** have covering tests.
* For claim-tracking logic, include a failing test first (red/green).

---

## 6. Continuous Integration

GitHub Actions will automatically run:

* `cargo fmt -- --check`
* `cargo clippy -- -D warnings`
* `anchor test`
* `yarn lint && yarn test` (if front‑end helpers are modified)

CI **must be green** before a maintainer reviews.

---

## 7. Security Disclosures

If you believe you have found a vulnerability:

1. Email **[info@arthimium.com](mailto:info@arthimium.com)** with subject **SECURITY ISSUE**.
2. Include detailed reproduction steps.
3. *Please do not create a public GitHub issue* until we have coordinated a fix.

We follow a **90‑day responsible‑disclosure window**.

---

## 8. License & Developer Certificate of Origin

By contributing you agree that your work is released under the project’s **MIT License** and that you have the right to license it.

Add a sign‑off line to each commit:

```bash
git commit -s -m "feat: improve residue docs"
```

This adds the required `Signed‑off‑by:` line, affirming the [DCO](https://developercertificate.org/).

---

**Happy hacking & thanks for making Solana a little more efficient! 🚀**
