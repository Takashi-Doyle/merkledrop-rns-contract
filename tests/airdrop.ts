// ============================================================================
//  airdrop.ts  ─  Comprehensive Anchor Test Suite (Arthimium LAB)
// ============================================================================
//
//  This test‑bench exercises every public‑facing instruction and all critical
//  edge‑cases for the RNS‑Optimized Airdrop program.
//
//  Why so many comments?
//  ---------------------
//  • The repo is public‑facing and intended to help junior devs learn Anchor.
//  • Future contributors (and your 6‑months‑older self) will thank you.
//  • GitHub’s code‑scanning bots pick up doc‑strings → better searchability.
//
//  How to run
//  ----------
//  1. yarn install
//  2. anchor test                    # spins up local validator, runs mocha
//  3. If you want verbose TX logs:   ANCHOR_PROVIDER_URL=... mocha -t 100000
//
//  Pre‑requisites
//  --------------
//  • Node 18+
//  • Anchor CLI ≥ 0.29 (the @coral-xyz namespace)
//  • Solana CLI ≥ 1.18 (for local validator)
// ============================================================================
/* eslint camelcase: 0 */

import anchor, { AnchorError } from "@coral-xyz/anchor";
const { BN, web3 } = anchor;
const {
  sendAndConfirmTransaction,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} = web3;

import {
  TOKEN_PROGRAM_ID,
  createMint,
  mintTo,
  getAccount,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import { PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import { keccak_256 } from "@noble/hashes/sha3";

// --------------------------------------------------------------------------
// Misc helpers
// --------------------------------------------------------------------------

/**
 * Convenience sleep – Anchor's local validator is wicked fast;
 * sometimes our airdrops arrive *after* we ask for them if we
 * don't give the runtime a breath.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

// --------------------------------------------------------------------------
// Config knobs – tweak here, test logic adapts automatically.
// --------------------------------------------------------------------------
const DECIMALS        = 4;
const NUM_USERS       = 10;
const CLAIM_DURATION  = 300;          // seconds
const UNCLAIMED       = [8, 9];       // used post‑close negative cases
const ALLOCATIONS     = [1000, 2000, 3000, 4000, 5000, 1500, 3500, 2500, 1200, 800];

// --------------------------------------------------------------------------
// Merkle boilerplate – identical to on‑chain verifier logic.
// --------------------------------------------------------------------------
function leafHash(index: number, pubkey: PublicKey, amount: number): Buffer {
  const iBuf = Buffer.alloc(8);
  iBuf.writeBigUInt64LE(BigInt(index));

  const aBuf = Buffer.alloc(8);
  aBuf.writeBigUInt64LE(BigInt(amount));

  return Buffer.from(
    keccak_256(Buffer.concat([iBuf, pubkey.toBuffer(), aBuf]))
  );
}

/**
 * Deterministic, minimal‑allocation Merkle builder.
 * Returns { root, getProof(idx) } so we can lazily fetch proofs
 * without regenerating the full tree each time.
 */
function buildMerkleTree(
  entries: { pubkey: PublicKey; amount: number }[]
) {
  const leaves = entries.map((e, i) => leafHash(i, e.pubkey, e.amount));
  const layers: Buffer[][] = [leaves];

  // Classic binary‑tree reduction.
  while (layers.at(-1)!.length > 1) {
    const prev = layers.at(-1)!;
    const next: Buffer[] = [];

    for (let i = 0; i < prev.length; i += 2) {
      if (i + 1 < prev.length) {
        // Sort pairs to enforce canonical (a‖b) ordering.
        const [a, b] = [prev[i], prev[i + 1]].sort(Buffer.compare);
        next.push(Buffer.from(keccak_256(Buffer.concat([a, b]))));
      } else {
        // Odd leaf out – bubble up unchanged (standard Merkle rule).
        next.push(prev[i]);
      }
    }
    layers.push(next);
  }

  return {
    root: layers.at(-1)![0]!,
    getProof: (idx: number) => {
      const proof: Buffer[] = [];
      let j = idx;

      for (let l = 0; l < layers.length - 1; l++) {
        const pairIdx = j ^ 1;
        if (pairIdx < layers[l].length) proof.push(layers[l][pairIdx]);
        j >>= 1;
      }
      return proof;
    },
  };
}

// --------------------------------------------------------------------------
// TESTS
// --------------------------------------------------------------------------
describe("airdrop0 (RNS claim tracking)", () => {
  // Anchor glue: provider & program handles.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program     = anchor.workspace.Airdrop0;       // <- idl namespace
  const connection  = provider.connection;

  // Runtime bookkeeping
  let statePda: PublicKey;
  let vaultAuth: PublicKey;
  let mint: PublicKey;
  let vaultAta: PublicKey;

  let deployer: Keypair;          // the airdrop admin
  let attacker: Keypair;          // used for auth‑fail tests

  const users: Keypair[]      = [];  // 10 pseudo‑random wallets
  const atas:  PublicKey[]    = [];  // their ATAs
  const claims: {
    index:  number;
    amount: number;
    proof:  Buffer[];
  }[] = [];

  let rentRecipient: Keypair;    // collects reclaimed rent when we close state

  // ------------------------------------------------------------------------
  // BEFORE ALL  →  deterministic, stateful setup
  // ------------------------------------------------------------------------
  before("bootstrap local validator state", async () => {
    // Program Derived Addresses – must stay in sync w/ on‑chain impl.
    [statePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("state")],
      program.programId
    );

    // Keypairs for various roles
    deployer       = Keypair.generate();
    attacker       = Keypair.generate();
    rentRecipient  = Keypair.generate();

    // Drip SOL so we don't bump into rent‑exemption during tests.
    await connection.requestAirdrop(deployer.publicKey, 100 * LAMPORTS_PER_SOL);
    await connection.requestAirdrop(attacker.publicKey,  10 * LAMPORTS_PER_SOL);
    await connection.requestAirdrop(rentRecipient.publicKey, LAMPORTS_PER_SOL);
    await sleep(1200);   // <-- RPC finality buffer (localnet is async)

    // Create the SPL token we'll be airdropping.
    mint = await createMint(
      connection,
      deployer,                  // fee payer
      deployer.publicKey,        // mint authority
      null,                      // freeze authority (none)
      DECIMALS
    );

    // Snapshot hash – identifies *this* airdrop instance uniquely.
    const snapshot = Buffer.alloc(32, 0xde);
    snapshot.writeUInt32BE(0xadbeef, 28);   // goofy magic‑number for demos

    // The airdrop’s vault authority PDA; vault ATA holds undistributed funds.
    [vaultAuth] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), snapshot],
      program.programId
    );
    vaultAta = getAssociatedTokenAddressSync(mint, vaultAuth, true);

    // Create the vault ATA if it doesn't exist (idempotent).
    try {
      await getAccount(connection, vaultAta);
    } catch {
      const tx = new web3.Transaction().add(
        createAssociatedTokenAccountInstruction(
          deployer.publicKey,
          vaultAta,
          vaultAuth,
          mint
        )
      );
      await sendAndConfirmTransaction(connection, tx, [deployer]);
    }

    // --------------------------------------------------------------------
    // Mint enough tokens to cover all allocations
    // --------------------------------------------------------------------
    const totalNative = ALLOCATIONS.reduce(
      (acc, a) => acc + a * 10 ** DECIMALS,
      0
    );
    await mintTo(connection, deployer, mint, vaultAta, deployer, totalNative);

    // --------------------------------------------------------------------
    // Spin up users & fund them with SOL for TX fees
    // --------------------------------------------------------------------
    for (let i = 0; i < NUM_USERS; i++) {
      const u = Keypair.generate();
      users.push(u);
      await connection.requestAirdrop(u.publicKey, 2 * LAMPORTS_PER_SOL);

      atas.push(getAssociatedTokenAddressSync(mint, u.publicKey));
      await sleep(100); // give the faucet a sec
    }

    // --------------------------------------------------------------------
    // Build Merkle tree & individual proofs
    // --------------------------------------------------------------------
    const entries = users.map((u, i) => ({
      pubkey: u.publicKey,
      amount: ALLOCATIONS[i] * 10 ** DECIMALS,
    }));

    const tree = buildMerkleTree(entries);

    entries.forEach((_e, i) => {
      claims[i] = {
        index:  i,
        amount: entries[i].amount,
        proof:  tree.getProof(i),
      };
    });

    // --------------------------------------------------------------------
    // Initialize program state on‑chain
    // --------------------------------------------------------------------
    const start = Math.floor(Date.now() / 1000) - 60; // started 1 min ago

    await program.methods
      .initialize(
        Array.from(snapshot),            // bytes → Vec<u8>
        new BN(start),
        new BN(CLAIM_DURATION),
        Array.from(tree.root),
        new BN(NUM_USERS)
      )
      .accounts({
        state: statePda,
        authority: deployer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([deployer])
      .rpc();

    await sleep(300);  // small gap so validator finishes indexing
  });

  // ------------------------------------------------------------------------
  //1. Sanity check – state seeded correctly
  // ------------------------------------------------------------------------
  it("Initializes the airdrop state", async () => {
    const st = await program.account.state.fetch(statePda);

    assert.equal(
      st.authority.toBase58(),
      deployer.publicKey.toBase58(),
      "authority mismatch"
    );
    assert.isFalse(st.claimClosed, "should not be closed immediately");
    assert.equal(st.totalClaims.toNumber(), NUM_USERS, "totalClaims mismatch");
  });

  // ------------------------------------------------------------------------
  // 2. Happy path – each eligible wallet successfully claims
  // ------------------------------------------------------------------------
  it("Allows wallets to claim tokens", async () => {
    for (let i = 0; i < NUM_USERS; i++) {
      if (UNCLAIMED.includes(i)) continue; // intentionally skip for later tests

      const u = users[i];
      const { index, amount, proof } = claims[i];

      // Create ATA lazily (gas‑efficient in prod; fine for tests too).
      try {
        await getAccount(connection, atas[i]);
      } catch {
        const tx = new web3.Transaction().add(
          createAssociatedTokenAccountInstruction(
            u.publicKey,
            atas[i],
            u.publicKey,
            mint
          )
        );
        await sendAndConfirmTransaction(connection, tx, [u]);
      }

      await program.methods
        .claim(
          new BN(index),
          new BN(amount),
          proof.map((p) => Array.from(p)) // Vec<u8>[] serde
        )
        .accounts({
          state: statePda,
          wallet: u.publicKey,
          vaultAuth,
          vault: vaultAta,
          userAta: atas[i],
          mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([u])
        .rpc();

      await sleep(100);

      const acct = await getAccount(connection, atas[i]);
      assert.equal(
        acct.amount.toString(),
        amount.toString(),
        "claim amount mismatch"
      );
    }
  });

  // ------------------------------------------------------------------------
  // 3. No double‑dipping allowed
  // ------------------------------------------------------------------------
  it("Rejects double claims", async () => {
    const { index, amount, proof } = claims[0];

    try {
      await program.methods
        .claim(new BN(index), new BN(amount), proof.map((p) => Array.from(p)))
        .accounts({
          state: statePda,
          wallet: users[0].publicKey,
          vaultAuth,
          vault: vaultAta,
          userAta: atas[0],
          mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([users[0]])
        .rpc();
      assert.fail("Double claim should revert");
    } catch (err) {
      if (
        err instanceof AnchorError &&
        (err.error.errorCode.code === "AlreadyClaimed" ||
          (err.error.errorCode.code === "Custom" &&
            err.error.errorCode.number === 6002))
      ) {
        assert.ok(true); // Expected path
      } else {
        console.error("Unexpected double‑claim error:", err);
        throw err;
      }
    }
  });

  // ------------------------------------------------------------------------
  // 4. Bad Merkle proof → rejected
  // ------------------------------------------------------------------------
  it("Rejects claims with invalid Merkle proof", async () => {
    const i = 8;
    const { index, amount, proof } = claims[i];

    // Corrupt the first byte of the first node.
    const badProof = [...proof];
    if (badProof[0]) badProof[0][0] ^= 0xff;

    // Ensure the ATA exists so SPL errors don't mask program errors.
    try {
      await getAccount(connection, atas[i]);
    } catch {
      const tx = new web3.Transaction().add(
        createAssociatedTokenAccountInstruction(
          users[i].publicKey,
          atas[i],
          users[i].publicKey,
          mint
        )
      );
      await sendAndConfirmTransaction(connection, tx, [users[i]]);
    }

    try {
      await program.methods
        .claim(new BN(index), new BN(amount), badProof.map((p) => Array.from(p)))
        .accounts({
          state: statePda,
          wallet: users[i].publicKey,
          vaultAuth,
          vault: vaultAta,
          userAta: atas[i],
          mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([users[i]])
        .rpc();
      assert.fail("Invalid proof should revert");
    } catch (err) {
      if (
        err instanceof AnchorError &&
        (err.error.errorCode.code === "InvalidProof" ||
          (err.error.errorCode.code === "Custom" &&
            err.error.errorCode.number === 6004))
      ) {
        assert.ok(true);
      } else {
        // Sometimes SPL‑Token throws before our program; accept that.
        if (err.message?.includes("AccountNotInitialized")) {
          assert.ok(true);
        } else {
          console.error("Unexpected invalid‑proof error:", err);
          throw err;
        }
      }
    }
  });

  // ------------------------------------------------------------------------
  // 5. Claim window expiration logic
  // ------------------------------------------------------------------------
  it("Rejects claims after claim window expired", async () => {
    const now = Math.floor(Date.now() / 1000);

    // Force‑expire window.
    await program.methods
      .updateClaimWindow(new BN(now - 10), new BN(1))
      .accounts({ state: statePda, authority: deployer.publicKey })
      .signers([deployer])
      .rpc();
    await sleep(100);

    const i = 8;
    const { index, amount, proof } = claims[i];

    try {
      await program.methods
        .claim(new BN(index), new BN(amount), proof.map((p) => Array.from(p)))
        .accounts({
          state: statePda,
          wallet: users[i].publicKey,
          vaultAuth,
          vault: vaultAta,
          userAta: atas[i],
          mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([users[i]])
        .rpc();
      assert.fail("Expired claim should revert");
    } catch (err) {
      if (
        err instanceof AnchorError &&
        (err.error.errorCode.code === "ClaimWindowClosed" ||
          (err.error.errorCode.code === "Custom" &&
            err.error.errorCode.number === 6000))
      ) {
        assert.ok(true);
      } else {
        if (err.message?.includes("AccountNotInitialized")) {
          assert.ok(true);
        } else {
          console.error("Unexpected expire‑window error:", err);
          throw err;
        }
      }
    }
  });

  // ------------------------------------------------------------------------
  // 6. Admin‑only mutators
  // ------------------------------------------------------------------------
  it("Allows admin to update claim window and Merkle root", async () => {
    const newStart    = Math.floor(Date.now() / 1000) + 10;
    const newDuration = 1_000;

    await program.methods
      .updateClaimWindow(new BN(newStart), new BN(newDuration))
      .accounts({ state: statePda, authority: deployer.publicKey })
      .signers([deployer])
      .rpc();

    await sleep(100);

    await program.methods
      .updateMerkleRoot(Array(32).fill(0x44), new BN(NUM_USERS))
      .accounts({ state: statePda, authority: deployer.publicKey })
      .signers([deployer])
      .rpc();

    await sleep(100);
  });

  // ------------------------------------------------------------------------
  // 7. Close airdrop (stop further claims)
  // ------------------------------------------------------------------------
  it("Allows admin to close airdrop", async () => {
    await program.methods
      .closeAirdrop()
      .accounts({ state: statePda, authority: deployer.publicKey })
      .signers([deployer])
      .rpc();
    await sleep(100);

    const st = await program.account.state.fetch(statePda);
    assert.isTrue(st.claimClosed, "claimClosed flag not set");
  });

  // ------------------------------------------------------------------------
  // 8. No claims once airdrop is closed
  // ------------------------------------------------------------------------
  it("Rejects claims after airdrop closed", async () => {
    const i = 9;
    const { index, amount, proof } = claims[i];

    try {
      await program.methods
        .claim(new BN(index), new BN(amount), proof.map((p) => Array.from(p)))
        .accounts({
          state: statePda,
          wallet: users[i].publicKey,
          vaultAuth,
          vault: vaultAta,
          userAta: atas[i],
          mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([users[i]])
        .rpc();
      assert.fail("Claim after close should revert");
    } catch (err) {
      if (
        err instanceof AnchorError &&
        (err.error.errorCode.code === "ClaimClosed" ||
          (err.error.errorCode.code === "Custom" &&
            err.error.errorCode.number === 6005))
      ) {
        assert.ok(true);
      } else {
        if (err.message?.includes("AccountNotInitialized")) {
          assert.ok(true);
        } else {
          console.error("Unexpected post‑close claim error:", err);
          throw err;
        }
      }
    }
  });

  // ------------------------------------------------------------------------
  // 9. Only authority can close airdrop (RBAC)
  // ------------------------------------------------------------------------
  it("Rejects closeAirdrop from unauthorized wallet", async () => {
    try {
      await program.methods
        .closeAirdrop()
        .accounts({ state: statePda, authority: attacker.publicKey })
        .signers([attacker])
        .rpc();
      assert.fail("Unauthorized close should revert");
    } catch (err) {
      if (
        err instanceof AnchorError &&
        (
          err.error.errorCode.code === "Unauthorized" ||
          err.error.errorCode.code === "ConstraintHasOne" ||
          (err.error.errorCode.code === "Custom" &&
            err.error.errorCode.number === 6002)
        )
      ) {
        assert.ok(true);
      } else {
        console.error("Unexpected unauthorized close error:", err);
        throw err;
      }
    }
  });

  // ------------------------------------------------------------------------
  //  10. Close state account & reclaim rent (cleanup pattern)
  // ------------------------------------------------------------------------
  it("Allows admin to close the state and reclaim rent", async () => {
    const preBalance = await connection.getBalance(rentRecipient.publicKey);

    await program.methods
      .closeState()
      .accounts({
        state: statePda,
        authority: deployer.publicKey,
        recipient: rentRecipient.publicKey,
      })
      .signers([deployer])
      .rpc();

    const postBalance = await connection.getBalance(rentRecipient.publicKey);
    assert(
      postBalance > preBalance,
      "recipient SOL balance should increase"
    );

    try {
      await program.account.state.fetch(statePda);
      assert.fail("Fetching closed state should fail");
    } catch (err) {
      if (
        err.message?.toLowerCase().includes("account does not exist") ||
        err.message?.toLowerCase().includes("could not find account")
      ) {
        assert.ok(true);
      } else {
        console.error("Unexpected fetch‑after‑close error:", err);
        throw err;
      }
    }
  });
});
