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

Goal: balanced protection and runtime cost.

- One encrypted VM with randomized opcodes and one-time prototype integrity checks
- Lightweight anti-dump environment noise
- Dense transient VM stack and direct execution index for cheaper hot callbacks
- Static property reads/writes use a combined instruction; property names remain in the encrypted constant pool
- No periodic trace checks or handler wrapper noise in this preset

Recommended general-purpose profile.

## Strong

Goal: stronger than Standard without the old nested-VM pipeline.

- One Vmify pass only.
- Light AntiDump.
- EncryptStrings + SplitStrings.
- NumbersToExpressions.
- AntiTamper without debug-dependent checks.
- Dense integrity sampling, trace guards, and handler wrapper noise.
- Intended for users who want more resistance while avoiding the old Strong/Extreme build cost.


## Maximum

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

## VM runtime hot-path optimization

The VM runtime reader is optimized while keeping virtualization:

- Wire characters are indexed by byte code and read with `string.byte`, avoiding temporary one-character substring allocations while decoding words and constant bytes.
- Each instruction's first encrypted word is reused for program-counter drift instead of being decoded a second time. When the instruction cache is enabled, this encrypted word is stored in a separately masked cache slot so cache hits do not reread it from the serialized stream.
- Standard and Performance use dense stack slots and a direct frame execution index; encoded branch targets, encrypted instruction/constant streams, randomized opcodes, and integrity checks remain.
- Static index operations combine a constant lookup and table access into one VM instruction.

This reduces redundant work inside the interpreter; it does not remove the fundamental cost of virtualizing hot callbacks. Constants are cached in plaintext after first use during execution, so client-side obfuscation cannot guarantee secrecy against a live runtime inspector. Validate frame time in Roblox, because desktop Lua microbenchmarks are not a substitute for a Luau client benchmark.
