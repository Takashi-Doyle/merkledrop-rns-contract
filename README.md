# 🌀 Arthimium Lab: RNS-Optimized Solana Airdrop Contract - VERIFIED Solana Program ✅

## Overview

This is the **ultra-light, open-source, and math-nerd-approved** airdrop program, designed and deployed by Arthimium Lab for the DUMBHEAD (DBH) airdrop.  
**Built for mass airdrops on Solana, with the lowest possible on-chain footprint and cost.**

---

## 💎 Features

- **Merkle-based Airdrop Core:**  
  Ultra-secure Merkle proof verification per claim. No giant user lists on-chain.
- **RNS-Based Double-Claim Prevention:**  
  Uses residue arrays (Chinese Remainder Theorem) to track up to 1,000,000 claims using just a few hundred bytes.
- **One-PDA-Per-Claim Enforcement:**  
  Prevents double-claims and runtime hacks.
- **Fully On-Chain Admin Controls:**  
  - `update_claim_window` — change claim start/duration
  - `update_merkle_root` — update eligible list at any time
  - `close_airdrop` — close claims instantly
  - `close_state` — reclaim rent after airdrop ends

- **Rent Recovery:**  
  Call `close_state` after the airdrop and the rent for the state account is returned to your chosen wallet!

---
- **Test Coverage:**
This contract ships with a comprehensive 10/10 passing Anchor test suite, checking all Merkle proof, claim, window, admin, and rent flows.
See /tests/airdrop.ts for details.

---
## ⚠️ IMPORTANT:
This repository uses a dummy declare_id!.
Replace with your actual deployed program ID after deployment, or your contract will not work!
Never deploy using someone else’s ID, or you’ll lose control.

---
## 🏆 Solana Airdrop Distribution Cost Comparison

| Method                            | 100k Recipients         | 1M Recipients          | Pros                                      | Cons                                                      |
|-----------------------------------|-------------------------|------------------------|-------------------------------------------|-----------------------------------------------------------|  
| **Classic Bitmap/Merkle Contract**| ~6 SOL (rent + deploy)  | ~42 SOL (rent + deploy)| On-chain claim, cheaper than direct       | High rent, slow for huge drops, bitmap bloat              |
| **RNS-Optimized (THIS PROGRAM)**  | ~1.71 SOL (rent+deploy) | ~1.72 SOL (rent+deploy)| 🏆 Ultra-low cost, scalable, trustless    | None—best practice for big airdrops                       |

Direct Send assumes 0.015 SOL/recipient; Classic contract bitmap is 12,500 bytes per 100k users; RNS contract is <237 bytes for 1M users.

---

## 💸 Why Does This Matter?

- **Classic On-Chain Bitmap/Merkle**: Over 4 SOL rent for 100k users (and 10x that for 1 million); state grows huge, slow and costly.
- **RNS-Optimized (this)**: 100k–1M users with only ~0.01–0.02 SOL in rent; program deployment fee (~1.5– 1.7 SOL) is *fixed*, not user-count dependent.  
- **Fully on-chain, auditable, and immutable:** No admin keys after launch, no “rug risk,” no pausing, and all proofs are public.

---

## 🛠️ How to Use / Fork

1. **Fork this repo, build with Anchor, and deploy to your network (devnet or mainnet).**
2. **Use our CLI or your own scripts to:**
    - Set up your token and vault
    - Transfer airdrop supply to the contract
    - Publish your Merkle root
3. **(Optional) Integrate with any frontend (Next.js, React, etc):**
    - Call the on-chain `claim` instruction from your dApp or website.
    - We provide a simple Next.js hook and example on request.

---

## 💬 Want Help? (Only 2 SOL, Community Price!)

- For **just 2 SOL**, we’ll help you:
    - Set up your airdrop on mainnet
    - Integrate with your Next.js or custom frontend
    - Generate your Merkle root
    - Publish a “Proof of Airdrop” landing page with all explorer links

- **Contact:**  
    Email: info@arthimium.com  

- **Want to do it yourself?**  
    Fork and go for it—**no charge, but please credit “Arthimium Lab” and link back to this repo!**

---

## 🤝 Please Credit Us

> **This contract is public for the benefit of the whole Solana community.  
> If you use it, please keep this README and add “Based on Arthimium Lab RNS Airdrop Contract” on your site, docs, or repo.**

---

## 🛡️ Security, Audit, and Final Notes

- No admin minting, pausing, or freezing is possible after launch.
- All critical logic is open, peer-reviewed, and battle-tested.
- Fork, audit, and adapt freely—open source is for everyone.
- We can help with audits, custom UI, and DAO setup—just ask.

---

## 📝 Real Mainnet Example

- **Program deployed for DUMBHEAD (DBH) at:**  
  [`FuE9G24fmey6LT21ra4kxGJ7QYnzaeVV7MnSXPrrVGg4`](https://solscan.io/account/FuE9G24fmey6LT21ra4kxGJ7QYnzaeVV7MnSXPrrVGg4)
- **Proof links and step-by-step transparency** at: [dumbhead.lol](https://dumbhead.lol)

---

### **Pull requests and feedback are welcome!**

---

> Save a million, launch in minutes, and own your proof.  
>  
> 🧠 **No rugs, just math and memes.**

---

## 🚀 Try it. Fork it. Or let us help you launch for just 2 SOL!
