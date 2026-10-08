# Stealth-X Obfuscator V2 Profiles

The V2 presets are designed around one final VM per output. Expensive compiler-side work is performed before output generation and is not shipped as runtime validators.

## V2Lite

Goal: lowest runtime overhead.

- VM virtualization with instruction caching
- Lazy/frame constant cache
- One-time prototype integrity verification
- Sparse integrity sampling (`IntegrityStep = 8`)
- No periodic trace guard
- No handler wrapper noise
- No anti-dump background jobs

Recommended default when execution performance matters.

## V2Standard

Goal: balanced protection and runtime cost.

- Everything in V2Lite, with denser integrity sampling
- Lightweight anti-dump environment noise
- Periodic executor-safe trace sanity checks
- Polymorphic handler wrapper noise
- Still uses one final VM

Recommended general-purpose profile.

## V2Maximum

Goal: strongest of the three profiles, with intentionally higher runtime cost.

- Anti-dump trace poison with background decoy jobs
- Additional string encryption before the final VM
- String splitting
- Number-expression mutation
- Anti-tamper sanity checks
- Full integrity verification
- More frequent trace guards
- Higher VM noise
- Larger constant cache
- Polymorphic handler wrappers

Use this only when protection matters more than execution overhead.

## Important: session-bound material

The current project does not have a server/session secret contract, so these presets do not pretend to implement cryptographic session binding. The runtime already supports per-build randomized cryptographic material and integrity metadata. A true session-bound layer should be added only when the server can issue and validate the session material.

## Build-time vs runtime

The compiler can perform validation and randomization without adding that work to the emitted client. The runtime cost mainly comes from the VM itself, constant decryption, integrity checks, anti-dump jobs, and trace guards.
