/**
 * Cache keys, and the file names they become.
 *
 * A saved answer is named by a string built from structured parts — the
 * account, the kind of resource, the repository, the ref, the path. Two
 * different tuples must never land on the same key, because the key is also
 * the file name: `${owner}-file-${ref}-${path}` and `${owner}-file-${ref2}-
 * ${path2}` collide the moment one part ends in a dash and the next begins
 * with one, and the escape used to make a name filesystem-safe turned a
 * literal `_47_` into the same file as a `/`. Reading one resource then draws
 * another.
 *
 * So the parts are joined by a separator that no part can contain, and the
 * whole string is escaped injectively: `_` is escaped too, so an escape can
 * never be confused with the text it stands for. Pure, so it is tested beside
 * itself; `store.ts` turns a key into the actual file.
 */

/** Everything a file name may keep without changing meaning. */
const SAFE = /[a-zA-Z0-9.-]/;

/**
 * A part that cannot appear between parts. Any control character would do;
 * this one is nowhere in a repository, a branch, a path or a login.
 */
export const KEY_SEPARATOR = '\u0001';

/**
 * Injective escape for a file name.
 *
 * A safe character is itself. Everything else — including `_`, so an escape
 * can never be read back as the literal it replaced — becomes `_<hex>_` of
 * its code point. The result only ever contains safe characters, but the
 * decoding is unambiguous: `_` always opens an escape and the hex inside
 * never contains one.
 */
export function escapeName(text: string): string {
  let out = '';
  for (const char of text) {
    if (char === '_' || !SAFE.test(char)) {
      out += `_${(char.codePointAt(0) ?? 0).toString(16)}_`;
    } else {
      out += char;
    }
  }
  return out;
}

/**
 * How a caller names a resource. The account always comes first and always
 * lower case, so `accountCachePrefixes` can find everything saved for it; the
 * rest are joined unambiguously, so `('a-b', 'c')` and `('a', 'b-c')` are two
 * keys rather than one.
 *
 * `null` account is a resource that belongs to no one — the demo, a settings
 * value — and gets a marker no GitHub login can produce.
 */
export function composeKey(
  account: string | null,
  ...parts: (string | number | null | undefined)[]
): string {
  const head = account ? account.toLowerCase() : '~';
  return [head, ...parts.map((part) => (part == null ? '' : String(part)))].join(KEY_SEPARATOR);
}

/**
 * The file-name prefixes under which an account's answers live, for
 * `removeSavedPrefixes`. The second is the older `login-` shape: keep it so a
 * phone that updated mid-session can still forget the account it just removed.
 */
export function accountCachePrefixes(login: string): string[] {
  const lower = login.toLowerCase();
  return [escapeName(`${lower}${KEY_SEPARATOR}`), escapeName(`${lower}-`)];
}

/**
 * SHA-256 of UTF-8 text, hex. Inlined because the React Native bundle rejects
 * `node:crypto`, and the app tsconfig has no Node types. Checked against the
 * published empty-string and "abc" digests.
 */
function sha256Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const words = new Uint32Array(64);
  const k = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const bitLength = bytes.length * 8;
  const padded = new Uint8Array(((bytes.length + 9 + 63) & ~63));
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLength >>> 0);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));

  let a = 0x6a09e667;
  let b = 0xbb67ae85;
  let c = 0x3c6ef372;
  let d = 0xa54ff53a;
  let e = 0x510e527f;
  let f = 0x9b05688c;
  let g = 0x1f83d9ab;
  let h = 0x5be0cd19;
  const rotate = (value: number, bits: number) => (value >>> bits) | (value << (32 - bits));

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = words[i - 15]!;
      const y = words[i - 2]!;
      const small = (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) >>> 0;
      const large = (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10)) >>> 0;
      words[i] = (words[i - 16]! + small + words[i - 7]! + large) >>> 0;
    }
    let A = a, B = b, C = c, D = d, E = e, F = f, G = g, H = h;
    for (let i = 0; i < 64; i++) {
      const sum1 = (rotate(E, 6) ^ rotate(E, 11) ^ rotate(E, 25)) >>> 0;
      const choose = ((E & F) ^ (~E & G)) >>> 0;
      const temp1 = (H + sum1 + choose + k[i]! + words[i]!) >>> 0;
      const sum0 = (rotate(A, 2) ^ rotate(A, 13) ^ rotate(A, 22)) >>> 0;
      const majority = ((A & B) ^ (A & C) ^ (B & C)) >>> 0;
      const temp2 = (sum0 + majority) >>> 0;
      H = G; G = F; F = E; E = (D + temp1) >>> 0; D = C; C = B; B = A; A = (temp1 + temp2) >>> 0;
    }
    a = (a + A) >>> 0; b = (b + B) >>> 0; c = (c + C) >>> 0; d = (d + D) >>> 0;
    e = (e + E) >>> 0; f = (f + F) >>> 0; g = (g + G) >>> 0; h = (h + H) >>> 0;
  }
  return [a, b, c, d, e, f, g, h].map((word) => word.toString(16).padStart(8, '0')).join('');
}

/**
 * A stable, opaque name for a credential that must not be written down.
 *
 * The previous name was FNV-1a truncated to 32 bits (`store.keyOf`). Two
 * tokens can share that name, and a cache file named by it then answers for
 * the wrong account. SHA-256 of the credential is the generation instead:
 * replacing or removing the credential changes the name, and nothing derived
 * from the raw credential is stored.
 *
 * Rotation and migration. The digest is a pure function of the credential, so
 * the same token keeps the same files and a different token never opens them.
 * Files written under the 32-bit name are not renamed and are not read: a
 * short name cannot be checked without the credential, and rewriting it would
 * keep serving a value that might belong to someone else. They age out under
 * the cache budget. `model-<generation>` is removed explicitly when an account
 * token is replaced or the account is removed (`accounts.ts`).
 *
 * This names only the credential-derived resources (`model-<generation>` and
 * the host client key). Login-scoped keys — `${login}-pull4-…`, `${login}-file-…`
 * — are the same account whether or not its token was rotated, so they
 * deliberately do not carry a credential generation.
 */
export function credentialGeneration(credential: string): string {
  return sha256Hex(credential);
}
