# Stealth-X Obfuscator V2 Profiles

The V2 presets are designed around one final VM per output. Expensive compiler-side work is performed before output generation and is not shipped as runtime validators.

## Legacy/internal V2Lite

Goal: lowest runtime overhead.

- VM virtualization with instruction caching
- Lazy/frame constant cache
- One-time prototype integrity verification
- Sparse integrity sampling (`IntegrityStep = 8`)
- No periodic trace guard
- No handler wrapper noise
- No anti-dump background jobs

Recommended default when execution performance matters.

## Standard

Goal: low runtime overhead for Roblox, especially on low-end devices.

- Everything in V2Lite, with the same sparse integrity approach tuned for Standard
- Lightweight anti-dump environment noise
- No periodic runtime trace guard by default
- No per-handler wrapper branches
- Still uses one final VM

Recommended general-purpose profile, especially for low-end Roblox devices.

## Strong

Goal: stronger than Standard without the old nested-VM pipeline.

- One Vmify pass only.
- Light AntiDump.
- EncryptStrings + SplitStrings.
- NumbersToExpressions.
- AntiTamper without debug-dependent checks.
- Moderate integrity sampling and infrequent trace guards.
- No per-handler wrapper branches to keep Roblox runtime cost predictable.
- Intended for users who want more resistance while avoiding the old Strong/Extreme build cost.


## Maximum

Goal: strongest of the three profiles, with intentionally higher runtime cost.

- Anti-dump environment noise without background decoy jobs
- Additional string encryption before the final VM
- String splitting
- Number-expression mutation
- Anti-tamper sanity checks
- Moderate integrity verification
- Infrequent trace guards
- Moderate VM noise
- Larger constant cache
- Polymorphic VM layout and opcode mapping

Use this when stronger protection matters more than the lowest possible runtime overhead.

## Important: session-bound material

The current project does not have a server/session secret contract, so these presets do not pretend to implement cryptographic session binding. The runtime already supports per-build randomized cryptographic material and integrity metadata. A true session-bound layer should be added only when the server can issue and validate the session material.

## Build-time vs runtime

The compiler can perform validation and randomization without adding that work to the emitted client. The runtime cost mainly comes from the VM itself, constant decryption, integrity checks, and any enabled trace/anti-dump work.

## Runtime performance changes

- The VM wire decoder uses allocation-free `string.byte` reads instead of creating temporary one-character strings for every encoded word.
- The interpreter reuses the first decoded ciphertext word for drift bookkeeping instead of decoding it twice.
- Standard, Strong, and Maximum disable per-handler wrapper branches.
- Standard and Strong use sparser executable noise and less frequent integrity/trace work.
- Maximum no longer launches periodic anti-dump background jobs, avoiding scheduled frame-time spikes.
- Frame constant caching remains enabled.
