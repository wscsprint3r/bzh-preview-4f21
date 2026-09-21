import { existsSync, realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import sharp from 'sharp';

/**
 * The uploads tree, by absolute path, OUTSIDE this repository.
 *
 * Same reasoning as `db.mjs`'s `DUMP_PATH`, and the same directory: the parent
 * holds several GB of forensic backups of the compromised server plus a file of
 * database credentials, and nothing in this tree is ever the source of a
 * migration. The file tree lives in the 08-22 backup and the database in the
 * 08-27 one - they are two different captures, and this is not a typo for the
 * date in `db.mjs`. Measured 2026-09-17: 7,421 files, 997 MB, of which 24 are
 * SVG.
 */
export const UPLOADS_ROOT =
  '/Users/stefan/Work/stuff/site-bzh/backup-2026-08-22/web01/htdocs/wp-content/uploads';

/** The one place a migrated image may land, relative to the repository root. */
const CONTENT_SUBDIR = 'src/assets/content';

/**
 * Where the legacy album's images land, relative to the repository root.
 *
 * FLATTENED TO THE BASENAME, unlike the WordPress tree, because the legacy page
 * names its files `galerie/8.jpg` with no year or month folder to keep. That
 * flattening is a new collision surface the uploads tree does not have - two
 * legacy paths under different directories would become one destination - so
 * `migrateLegacyImages` keeps the same lower-cased claims guard `migrateImages`
 * has, rather than inheriting uniqueness from the source paths.
 */
const LEGACY_GALLERY_SUBDIR = 'src/assets/content/galleries/legacy';

/**
 * What `sharp` can decode AND re-encode, which is the same thing as what can
 * be sanitised. Derived from the capability, not from a list of file types
 * somebody remembered to worry about.
 *
 * SVG is absent deliberately: sharp can rasterise it, but an SVG that stays an
 * SVG carries script, and this media comes off a server that was compromised
 * twice. The 24 SVGs on disk are logos and icons; if one is ever wanted, it
 * gets looked at by a person and added by hand.
 */
export const ALLOWED_EXTENSIONS = ['jpeg', 'jpg', 'png', 'webp'];

/** The long edge everything is downscaled to. Spec 11. */
const MAX_EDGE = 2400;

/**
 * WordPress writes `name-WIDTHxHEIGHT.ext` for every generated thumbnail.
 *
 * ANCHORED TO THE END and requiring digits on BOTH sides of the `x`, because a
 * looser pattern silently eats originals: `matrix-2.jpg` and `pers-3x.jpg` are
 * real files somebody uploaded. An over-eager filter here does not fail - the
 * page just loses a picture, on a green build. The real corpus has a live
 * example that only the END anchor saves: the featured image
 * `PIXNIO-2027801-4896x3672-1.jpeg` carries a full resolution INSIDE its name.
 */
const THUMBNAIL = /-\d+x\d+\.[A-Za-z0-9]+$/;

/** Just the extension question, asked without the thumbnail question. */
function allowedExtension(path) {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return ALLOWED_EXTENSIONS.includes(ext);
}

export function isOriginal(path) {
  if (THUMBNAIL.test(path)) return false;
  return allowedExtension(path);
}

/*
 * FILES REFUSED BY DECISION, NOT BY SHAPE. Backlog B5: two stock photographs
 * whose licence the parish could not confirm were deleted from
 * `src/assets/content/` before cutover. This set exists because a migration
 * re-run would copy them straight back — the dump still references them, and
 * the hand edits that stopped referencing them revert with every run — and
 * `src/lib/images.ts` publishes every file under `src/assets/` whether a page
 * links it or not. The destination paths are full and exact, so a rename at
 * the source cannot quietly dodge the refusal, and the skip reason says
 * "licence" rather than a decode failure so the report is honest about why.
 */
export const REFUSED_UPLOADS = new Set([
  'src/assets/content/2024/05/AdobeStock_298003333.jpeg',
  'src/assets/content/2024/05/istockphoto-1338836802-2048x2048-prelucrata-1.jpg',
]);

/**
 * The original a WordPress thumbnail was cut from: `photo-300x200.jpg` ->
 * `photo.jpg`. Anything that is not a thumbnail comes back unchanged.
 *
 * WHY A REFERENCED THUMBNAIL IS NOT SIMPLY DROPPED. "Only referenced images" is
 * about the referenced PICTURE, not the referenced byte-file. Measured over the
 * real corpus: 33 of the 100 references are thumbnails, and for every one of
 * them the thumbnail is the ONLY reference to that picture - so dropping them
 * loses the icon of Saint Nicholas from `istoric`, a council member's
 * photograph, five Doxologia cover scans and the liturgical programme, on a
 * green build. All 33 originals are on disk and none of them is referenced
 * directly by any `<img>`.
 *
 * Same regex as `THUMBNAIL`, with the extension captured so it survives. The
 * two must keep matching the same shape, which is why the pattern is written
 * once here and `THUMBNAIL` is the same expression anchored the same way.
 */
export function originalName(path) {
  return path.replace(/-\d+x\d+(\.[A-Za-z0-9]+)$/, '$1');
}

/** The size a thumbnail's own name claims it is, or `null`. */
function sizeFromName(path) {
  const m = path.match(/-(\d+)x(\d+)\.[A-Za-z0-9]+$/);
  return m === null ? null : { width: Number(m[1]), height: Number(m[2]) };
}

/**
 * What one segment of an upload path may contain. AN ALLOWLIST, not a denylist
 * of the traversal tricks somebody thought of.
 *
 * Every `src` this pipeline sees comes out of `post_content` on a server that
 * attackers held twice, so it is attacker-controllable text that becomes both a
 * path READ from the backups and a path WRITTEN into this repository. The
 * denylist version of this check is the one that gets bypassed by the encoding
 * nobody enumerated; this one can only be bypassed by a character that is
 * genuinely in the set.
 *
 * Measured against all 100 real referenced srcs (97 in `post_content` plus the
 * 3 featured images, 2026-09-17): 0 rejected, path depth never more than 3, and
 * the only characters that occur at all are ASCII letters, digits, `.`, `-` and
 * `_`. So this costs the real corpus nothing.
 *
 * LOAD-BEARING BEYOND ITS OWN PURPOSE, and this is the paragraph to read before
 * widening it. The destination-collision guard keys on `toLowerCase()`, which
 * matches what APFS and HFS+ actually do ONLY because this rule restricts paths
 * to ASCII. HFS+ also normalises to NFD and APFS case-folds the whole of
 * Unicode, so admitting one non-ASCII character here would silently decouple
 * that key from the filesystem's own collation and two names the filesystem
 * considers equal would sail past the guard. Widen this and you must revisit
 * the key.
 *
 * Refusing rather than decoding is deliberate for percent-encoding in
 * particular - 0 srcs contain a `%` - because `%2e%2e%2f` decodes to a
 * traversal, and a reference nobody can read is worth naming rather than
 * guessing at. Non-ASCII is refused for a second reason: a filename carrying a
 * Turkish cedilla would land in a tracked path and fail the repository-wide
 * sweep in `src/lib/diacritics-sources.test.ts`. Measured: 0 non-ASCII characters
 * in the real set, so the rule is free here too.
 */
const ALLOWED_SEGMENT = /^[A-Za-z0-9._-]+$/;

/**
 * The hosts a `src` may name and still be ours.
 *
 * Anchoring the path to `wp-content/uploads/` closed `myuploads` and left the
 * bigger half open: `https://evil.example/wp-content/uploads/2024/05/photo.jpg`
 * is the COMMON shape, because every WordPress in the world serves that path,
 * and it resolved to the parish's own `2024/05/photo.jpg` - a foreign page
 * choosing which of our files lands under which name.
 *
 * Measured over the 100 real srcs: 95 `https://www.bor-zh.ch`, 2
 * protocol-relative `//www.bor-zh.ch`, 3 featured images on the same host, and
 * 0 with no host at all. The apex without `www` does not occur; it is listed
 * because it is the same parish's own domain rather than a different party, and
 * a `src` naming any other host is reported as foreign rather than migrated.
 */
const OUR_HOSTS = ['www.bor-zh.ch', 'bor-zh.ch'];

/**
 * The host a `src` names, lower-cased, or `null` when it names none.
 *
 * Takes the text after the LAST `@`, because that is what a browser does:
 * `https://www.bor-zh.ch@evil.example/...` has the host `evil.example`, and
 * reading the first label instead is the classic way to be fooled by one.
 */
function hostOf(srcWp) {
  const m = srcWp.match(/^(?:[a-z][a-z0-9+.-]*:)?\/\/([^/]*)/i);
  if (m === null) return null;
  let host = m[1].toLowerCase();
  const at = host.lastIndexOf('@');
  if (at >= 0) host = host.slice(at + 1);
  return host.replace(/:\d+$/, '');
}

/**
 * Whether `path` resolves inside `root`. The SECOND lock.
 *
 * `ALLOWED_SEGMENT` is the first and is meant to be sufficient; this one asks
 * the question of the resolved path itself, so it cannot be fooled by anything
 * about the spelling that was not anticipated. Two locks on one door is
 * deliberate here: this is the boundary the whole task exists to be.
 *
 * `root + sep` rather than a bare `startsWith`, or `/a/bc` counts as inside
 * `/a/b`.
 */
export function isInside(root, path) {
  const r = partialRealpath(root);
  const c = partialRealpath(path);
  return c === r || c.startsWith(r + sep);
}

/**
 * `realpath` of the deepest part of `path` that exists, with the rest appended.
 *
 * `resolve` alone collapses `..` textually and does NOT follow symlinks, so a
 * link inside the uploads tree defeated both locks: the charset rule sees an
 * ordinary name and `resolve` sees an ordinary path. The tree is
 * attacker-derived and was unpacked from a tar, where symlinks survive.
 * Measured: 0 symlinks in the 7,421 files today, so this is latent rather than
 * live - which is exactly when it is cheap to close.
 *
 * The walk exists because a destination does not exist yet, so `realpath` on it
 * throws; what must be followed is the part that IS there.
 */
function partialRealpath(path) {
  let p = resolve(path);
  const remaining = [];
  for (;;) {
    try {
      return remaining.length === 0 ? realpathSync(p) : join(realpathSync(p), ...remaining);
    } catch {
      const parent = dirname(p);
      if (parent === p) return resolve(path);
      remaining.unshift(basename(p));
      p = parent;
    }
  }
}

/**
 * The part of a WordPress `src` below `uploads/`, or `null` when it is not an
 * upload path at all.
 *
 * THE TWO OUTCOMES ARE NOT THE SAME KIND OF EVENT, which is why one is a
 * return value and the other is an exception. A `src` with no `uploads/` in it
 * is an ordinary foreign reference - an external image, a `date:` URL - and the
 * caller skips it and says so. A `src` that IS an upload path but whose shape
 * could escape is an attack in the content, and a pipeline that prints it and
 * exits 0 has shipped it. So that one throws and stops the migration: somebody
 * has to read the document it came from before anything else from that server
 * is trusted. Measured: 0 of the 100 real srcs throw.
 */
function relativeUploadPath(srcWp) {
  // ANCHORED. Unanchored, `https://evil.example/myuploads/2024/05/photo.jpg`
  // matched, and the pipeline would then have migrated the parish's OWN
  // `2024/05/photo.jpg` in its place - not an escape, but a foreign page
  // choosing which of our files lands under which name. Measured: all 100 real
  // srcs carry `/wp-content/uploads/`, including the two protocol-relative ones.
  const m = srcWp.match(/(?:^|\/)wp-content\/uploads\/(.+)$/);
  if (m === null) return null;
  const relative = m[1];
  const segments = relative.split('/');
  const badSegments = segments.filter(
    (s) => !ALLOWED_SEGMENT.test(s) || s === '.' || s === '..',
  );
  if (badSegments.length > 0) {
    throw new Error(
      `Unsafe upload path: ${srcWp}\n` +
        `  rejected segments: ${JSON.stringify(badSegments)}\n` +
        '  A `src` from the content of a compromised server never becomes a path on ' +
        'disk without passing the allowed-character list. Read the document it comes ' +
        'from before resuming the migration.',
    );
  }
  // THE HOST IS CHECKED LAST, AFTER THE SEGMENTS, and the order is the whole
  // point. Checked first, a foreign host short-circuited to `null` - an
  // ordinary skip, exit 0 - so
  // `https://evil.example/wp-content/uploads/../../../../etc/secret.jpg` was
  // waved through silently while the identical path on our own host threw. That
  // contradicted this function's own contract three paragraphs up: a path that
  // could escape is an attack in the content whoever is hosting it, and the
  // alarm must not be silenced by the attacker choosing a different domain.
  const host = hostOf(srcWp);
  if (host !== null && !OUR_HOSTS.includes(host)) return null;
  return relative;
}

/**
 * The repo path an upload becomes, keeping WordPress's year/month folders.
 *
 * The folders are kept because filenames repeat: `Design-without-title.png` exists
 * under both 2024/05 and 2024/07 in this very corpus, and flattening would have
 * one silently overwrite the other.
 */
export function destinationName(srcWp) {
  const relative = relativeUploadPath(srcWp);
  if (relative === null) throw new Error(`Not an upload path: ${srcWp}`);
  // A thumbnail lands on its original's name, so `photo.jpg` and
  // `photo-300x200.jpg` name the same file and the picture is stored once.
  return `${CONTENT_SUBDIR}/${originalName(relative)}`;
}

/**
 * Fails by name when the uploads tree is absent.
 *
 * The same guard, for the same reason, as `db.mjs`'s `requireDump`: without
 * it, a machine that has never held the backups runs the whole migration, finds
 * nothing, writes nothing, prints `Imagini migrate: 0 din 97` and exits 0 - and
 * the first symptom is a site with no pictures that nobody can explain.
 */
export function requireUploads(path = UPLOADS_ROOT) {
  if (!existsSync(path)) {
    throw new Error(
      `The uploads directory was not found: ${path}\n` +
        'The migration reads the images from the backups in the parent directory, ' +
        'which are not part of the repository. Without them no image can be migrated.',
    );
  }
  return path;
}

/**
 * The encoder options, written out rather than left to sharp's defaults.
 *
 * Spec 11 asks that rerunning the migration produce identical output, and an
 * encoder default that moves between sharp versions is exactly the kind of
 * reproducibility bug that has no symptom - the pictures still look right, the
 * bytes are simply different.
 *
 * JPEG AND WEBP ARE TODAY'S DEFAULTS, PINNED, NOT A RE-TUNING. Measured against
 * sharp 0.35.4 / libvips 8.18.6: encoding with these options and encoding with
 * `.toBuffer()` alone produced byte-identical output on every referenced JPEG.
 * That measurement is what makes the pin faithful - without it this block would
 * be a guess about what the defaults are, which is worse than not pinning.
 *
 * PNG DELIBERATELY DEPARTS FROM THE DEFAULT, and that is the one tuning
 * decision in this file. sharp's default writes truecolour at compression 6
 * with no adaptive filtering, and these are Canva exports and screenshots that
 * WordPress held palettised - so the defaults made the 25 referenced PNGs GROW
 * from 39.9 MB to 55.7 MB, in a repository that keeps them forever. Measured:
 *
 *     implicit (compressionLevel 6)              55.7 MB
 *     compressionLevel 9                         54.6 MB
 *     compressionLevel 9 + adaptiveFiltering     35.3 MB
 *     palette true (imagequant)                  12.0 MB
 *
 * Adaptive filtering is chosen and `palette` is NOT, because the first is free
 * and the second is not: palette quantises to 256 colours, which is a visible
 * decision about somebody's photographs and belongs to a person, not to this
 * file. "Free" is verified rather than assumed - both encodings were decoded
 * back to raw pixels and the buffers compared: identical on 25 of 25, and the
 * same bytes on a second encode 25 times out of 25, so determinism holds too.
 */
const ENCODE_OPTIONS = {
  jpeg: (img) =>
    img.jpeg({
      quality: 80, progressive: false, chromaSubsampling: '4:2:0',
      optimiseCoding: true, mozjpeg: false, trellisQuantisation: false,
      overshootDeringing: false, optimiseScans: false, quantisationTable: 0,
    }),
  png: (img) =>
    img.png({ compressionLevel: 9, adaptiveFiltering: true, palette: false, effort: 7 }),
  webp: (img) =>
    img.webp({
      quality: 80, alphaQuality: 100, lossless: false, nearLossless: false,
      smartSubsample: false, effort: 4,
    }),
};

/**
 * COLOUR, AND WHY NOTHING HERE MENTIONS AN ICC PROFILE.
 *
 * sharp imports the embedded ICC profile and converts the pixels to sRGB on
 * INPUT, through lcms, whenever the file carries one and `ignoreIcc` is unset -
 * which it is. So `sharp(...).rotate()` already hands us sRGB pixels, and
 * writing them with no profile attached is correct for the web, where untagged
 * means sRGB.
 *
 * MEASURED, because a previous round of this file got it backwards and shipped
 * the opposite: `sharp(F).raw()` against `sharp(F, { ignoreIcc: true }).raw()`
 * differs by max 60 / mean 2.653 on `2024/06/IMG_1640.jpg` (Display P3), and by
 * 0.000 on a file that carries no profile - so the difference is the profile
 * being applied, not noise. Against a ColorSync conversion of the same file the
 * output agrees to max 1 / mean 0.016 on PNG sources, where both decoders agree
 * exactly and no codec sits in the measurement.
 *
 * DO NOT ADD `keepIccProfile()`. It was added in one round and reverted in the
 * next, and the REASON matters because two different wrong mechanisms have been
 * written down for it already. What it actually does, measured on
 * `2024/06/IMG_1640.jpg` (Display P3) with every arm labelled by the space it
 * is in:
 *
 *   source: converted vs raw numbers                   max 60  mean 2.653
 *   with keepIccProfile, read naively, vs raw numbers  max  0  <- conversion SKIPPED
 *   with keepIccProfile, read colour-managed           max  0  <- correct colour
 *   with keepIccProfile, read naively, vs converted    max 60  <- the harm
 *   without it, read naively, vs converted             max  0  <- what we do now
 *
 * So it does NOT double-transform. It makes sharp skip the input conversion and
 * ship the original numbers under the original profile - self-consistent, and
 * exactly right for a colour-managed reader. The harm is real but narrower than
 * "wrong colour everywhere": a reader that ignores the profile sees max 60.
 *
 * It stays out for two reasons that survive the correction. An ICC profile is
 * attacker-controlled data off a twice-compromised server, and a payload planted
 * inside a structurally valid one survived the copy verbatim -
 * `migration/media.test.mjs` has that control. And converting once here means
 * every reader sees the right colour, not only the colour-managed ones.
 *
 * An earlier version of this comment claimed a double transform and cited
 * "max 42-54". That number came from reading the output while IGNORING its
 * profile and comparing it against a converted source - two arms in different
 * colour spaces, which is the same mistake the paragraph was written to correct.
 */

/**
 * The extensions each decoded format is allowed to be called.
 *
 * Checked rather than trusted, because the two can disagree and each way of
 * resolving the disagreement silently is wrong: encoding by the NAME turns a
 * PNG into a JPEG and drops its alpha channel, and encoding by the CONTENT
 * writes PNG bytes into a file a server will label `image/jpeg`. A file whose
 * name lies about its type is also the plainest signature of the polyglot files
 * this pipeline exists to stop, so it is named and skipped rather than guessed
 * at. Measured: 0 disagreements among the 64 referenced originals.
 */
const EXTENSIONS_FOR_FORMAT = { jpeg: ['jpg', 'jpeg'], png: ['png'], webp: ['webp'] };

/**
 * Decode, resize and re-encode one file, or throw. THE sanitisation, in one
 * place because there are now two trees that must get the same treatment.
 *
 * Extracted from `migrateImages` so `migrateLegacyImages` cannot drift from it:
 * "runs the same decode/re-encode/MAX_EDGE path" is a shared function rather
 * than a second copy of the same six lines. The error text for a name that lies
 * about its type is the one `migrateImages` used to push into its skip list, so
 * its callers' reports are unchanged.
 *
 * `relative` is the name the file was referenced by, used for the extension
 * question only; the bytes come from `source`, which the caller has already
 * proved is inside the tree it belongs to.
 */
async function reencode(source, relative) {
  const raw = await readFile(source);
  // Decode -> resize -> re-encode. Whatever was appended to, or hidden in, the
  // original does not survive being turned back into pixels and written out
  // fresh. Nothing calls `withMetadata`, so EXIF goes too.
  const image = sharp(raw, { failOn: 'error' }).rotate();
  const meta = await image.metadata();
  const ext = relative.split('.').pop().toLowerCase();
  const allowedForFormat = EXTENSIONS_FOR_FORMAT[meta.format];
  if (allowedForFormat === undefined || !allowedForFormat.includes(ext)) {
    throw new Error(`the name says .${ext}, the content is ${meta.format}`);
  }
  // `Math.max` of both edges, so an EXIF orientation that swaps them cannot
  // change the decision.
  const resized =
    Math.max(meta.width ?? 0, meta.height ?? 0) > MAX_EDGE
      ? image.resize({
          width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', kernel: 'lanczos3',
        })
      : image;
  return ENCODE_OPTIONS[meta.format](resized).toBuffer();
}

/** Dimensions as a viewer sees them: EXIF orientation applied. */
async function orientedSize(path) {
  const m = await sharp(path).metadata();
  const turned = (m.orientation ?? 1) >= 5;
  return { width: turned ? m.height : m.width, height: turned ? m.width : m.height };
}

/**
 * Proves a `-WxH` name really is a thumbnail OF the file we are about to put in
 * its place. Throws, by name, when it is not.
 *
 * Stripping `-WxH` is a guess about which other file a name belongs to, and a
 * wrong guess puts a DIFFERENT PICTURE on the page - which no test downstream
 * can see, because a valid image is exactly what it finds. So the guess is
 * checked three ways:
 *
 *   1. the original has to exist. Measured 33 of 33 present; if that stops
 *      being true the run stops, rather than falling back to the thumbnail and
 *      migrating a 370px crop as if it were the picture.
 *   2. the file has to BE the size its name claims. This is what tells a
 *      WordPress-generated thumbnail from a real upload whose name happens to
 *      carry digits and an `x` - WordPress names the file after the size it
 *      actually wrote, and measured, all 33 match exactly. Compared against the
 *      STORED dimensions, because the claim is about the file's own bytes
 *      against its own name.
 *   3. the original has to be at least as big, in both directions. Compared
 *      after orientation, because that one is about the pictures rather than
 *      the files: `IMG_1640.jpg` is stored 4032x3024 with an EXIF quarter turn
 *      and is a 3024x4032 portrait to a reader, which is the only reason its
 *      768x1024 thumbnail makes sense. Measured: 0 of 33 originals are smaller.
 *
 * A thumbnail that is not itself on disk cannot be checked by (2) or (3); the
 * original existing is then the whole of the evidence, and the caller prints
 * the fact rather than letting it pass unsaid. Measured: 0 of 33.
 */
async function checkThumbnail(thumbnailPath, originalPath, thumbnailRelative, originalRelative) {
  if (!existsSync(originalPath)) {
    throw new Error(
      `The thumbnail ${thumbnailRelative} has no original on disk: ${originalRelative}\n` +
        '  A referenced thumbnail is migrated as the original it was cut from. ' +
        'Without the original it cannot be: the thumbnail is not put in its place in ' +
        'silence, because a few hundred pixels of crop is not the photograph.',
    );
  }
  if (!existsSync(thumbnailPath)) return false;
  const claimed = sizeFromName(thumbnailRelative);
  const raw = await sharp(thumbnailPath).metadata();
  if (raw.width !== claimed.width || raw.height !== claimed.height) {
    throw new Error(
      `${thumbnailRelative} is not a thumbnail: the name says ` +
        `${claimed.width}x${claimed.height}, the file is ${raw.width}x${raw.height}.\n` +
        '  So the name was not written by WordPress, and stripping the suffix would be ' +
        `a guess about which file it belongs to (${originalRelative}).`,
    );
  }
  const thumbSize = await orientedSize(thumbnailPath);
  const originalSize = await orientedSize(originalPath);
  if (originalSize.width < thumbSize.width || originalSize.height < thumbSize.height) {
    throw new Error(
      `${originalRelative} is smaller than its supposed thumbnail ` +
        `${thumbnailRelative}: ${originalSize.width}x${originalSize.height} against ` +
        `${thumbSize.width}x${thumbSize.height}. They are not the same photograph.`,
    );
  }
  return true;
}

/**
 * Copies the referenced images across, sanitising each one by re-encoding it.
 *
 * Returns a map from the original `src` to its new repo path. A source that is
 * missing, or that sharp cannot decode, is reported by name and LEFT OUT of
 * the map - the caller then knows the reference is dead and can say so, rather
 * than emitting Markdown pointing at a file that was never written.
 *
 * WITH ONE EXCEPTION, STATED HERE BECAUSE IT BENDS THAT RULE. The
 * destination-collision guard registers a claim BEFORE the file is read, so a
 * reference that is merely dead, but whose name differs only by case from a
 * live one, stops the run instead of being named and skipped. That is
 * deliberate and it is the same direction Task 6 takes with an unmapped
 * reference: two names this repository cannot hold apart are worth a person
 * looking, whether or not either file turned out to be readable. Measured: 0 in
 * this corpus, either way.
 *
 * `uploadsRoot` is injectable for the same reason `db.mjs`'s `start`
 * takes a dump path: no real caller passes one, and it exists so the positive
 * controls in `media.test.mjs` can show the sanitiser meeting a poisoned file
 * and a file that is not an image at all, without either the backups or a
 * checked-in binary fixture. A sanitiser that is never shown a malicious file
 * is not known to sanitise.
 */
export async function migrateImages(
  sources,
  repoRoot = process.cwd(),
  uploadsRoot = UPLOADS_ROOT,
) {
  requireUploads(uploadsRoot);
  const mapping = new Map();
  const skipped = [];
  const contentDir = join(repoRoot, CONTENT_SUBDIR);
  // Destination per SOURCE file, so a picture referenced both directly and
  // through one or more of its thumbnails is decoded and written exactly once.
  const written = new Map();
  const undecodable = new Set();
  // A COUNTER, not `written.size`: a Map de-duplicates by construction, so its
  // size reports one whether the file was written once or three times - which
  // is exactly the thing this number exists to report on.
  let writes = 0;
  // Destination (lower-cased) -> the source file that claimed it. Two DIFFERENT
  // source files reaching one destination is only possible when their names
  // differ merely by case, and that is a real platform-dependent bug: on Linux,
  // which builds this site, they are two files and one overwrites the other in
  // the repository; on macOS, which it is developed on, they are one file and
  // nobody sees it. Measured 0 among the 100 real references - so today this
  // holds by luck, and this map is what makes it hold by construction.
  const claims = new Map();
  // What resolution did, for the report below.
  const fromThumbnails = new Set();
  const direct = new Set();
  const unverified = [];
  let thumbnailsResolved = 0;

  for (const src of [...new Set(sources)]) {
    // The TYPE question comes before the thumbnail question: an SVG is not
    // migrated at all, and that must not change because its name carries a size.
    if (!allowedExtension(src)) { skipped.push([src, 'disallowed type']); continue; }
    // Deliberately OUTSIDE the try below: an unsafe path must stop the run, not
    // become one more skipped line in a report that exits 0. Validated on the
    // UNTRUSTED text, before anything is derived from it.
    const rawRelative = relativeUploadPath(src);
    if (rawRelative === null) { skipped.push([src, 'foreign path']); continue; }
    const isThumbnail = THUMBNAIL.test(rawRelative);
    const relative = originalName(rawRelative);
    // A name that is NOTHING BUT a size: `-300x200.jpg` strips to `.jpg`, a
    // name with no stem at all. Unreachable in practice, because the missing
    // original fires first, but it was named nowhere - a reader met it as a
    // baffling complaint about a file called `.jpg`.
    if (basename(relative).startsWith('.')) {
      skipped.push([src, 'the name is nothing but a size, nothing is left of it']);
      continue;
    }
    const source = join(uploadsRoot, relative);
    const thumbnailPath = join(uploadsRoot, rawRelative);
    const destinationRelative = destinationName(src);
    const destination = join(repoRoot, destinationRelative);
    // The licence refusal, before the claims map and before sharp: these files
    // are not a decode problem and must not be reported as one.
    if (REFUSED_UPLOADS.has(destinationRelative)) {
      skipped.push([src, 'refused: the licence could not be confirmed (backlog B5)']);
      continue;
    }
    // THE SECOND LOCK, AND IT IS GENUINELY SECOND NOW. It used to sit after
    // `checkThumbnail` and after the de-duplication, so it was made about
    // paths this process had already `existsSync`-ed and handed to sharp to
    // decode, and a de-duplicated `src` never reached it at all. The claim
    // "two locks on one door" was therefore not true of the pipeline, only of
    // the unit control. NOTHING TOUCHES THE FILESYSTEM ABOVE THIS LINE.
    if (
      !isInside(uploadsRoot, source) ||
      (isThumbnail && !isInside(uploadsRoot, thumbnailPath)) ||
      !isInside(contentDir, destination)
    ) {
      throw new Error(
        `Unsafe upload path, caught by the second lock: ${src}\n` +
          `  would have read ${source}\n  would have written ${destination}`,
      );
    }
    // `toLowerCase()` stands in for what APFS and HFS+ do, and it is only
    // faithful because `ALLOWED_SEGMENT` keeps every path ASCII - HFS+ also
    // normalises to NFD and APFS folds all of Unicode. See that rule's comment.
    const key = destinationRelative.toLowerCase();
    const claimedBy = claims.get(key);
    if (claimedBy !== undefined && claimedBy !== relative) {
      throw new Error(
        `The destination ${destinationRelative} is claimed by two different source ` +
          `files: ${claimedBy} and ${relative}.\n` +
          '  They differ only in case, so on Linux they are two photographs and one ' +
          'overwrites the other in the repository, while on macOS they are a single ' +
          'file and nobody notices. Rename one at the source before resuming the migration.',
      );
    }
    claims.set(key, relative);
    if (isThumbnail) {
      // Throws, by name, when the resolution cannot be justified.
      const verified = await checkThumbnail(thumbnailPath, source, rawRelative, relative);
      if (!verified) unverified.push(rawRelative);
      thumbnailsResolved += 1;
      fromThumbnails.add(relative);
    } else {
      direct.add(relative);
    }
    if (written.has(relative)) { mapping.set(src, written.get(relative)); continue; }
    if (undecodable.has(relative)) continue;
    // Declared out here because the WRITE must not be inside the catch below:
    // a file that cannot be decoded is a corpus problem, named and skipped, but
    // a file that cannot be written is an environment problem - a full disk, a
    // read-only checkout - and reporting the two the same way leaves a run that
    // prints a tidy list and exits 0 having written nothing.
    let output;
    try {
      output = await reencode(source, relative);
    } catch (e) {
      skipped.push([src, e instanceof Error ? e.message : String(e)]);
      undecodable.add(relative);
      continue;
    }
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, output);
    writes += 1;
    written.set(relative, destinationRelative);
    mapping.set(src, destinationRelative);
  }
  // Print what was measured, not only the verdict. `process.stdout.write` and
  // not `console.log`, which vitest's default reporter swallows on exactly the
  // green run a later reader would check these numbers against.
  process.stdout.write(
    `\nImages migrated: ${mapping.size} of ${new Set(sources).size} referenced.\n`,
  );
  // What resolution did is the number a later reader will want to audit: how
  // much of the corpus reaches the site only because a thumbnail was pointed
  // back at its original.
  const newOnes = [...fromThumbnails].filter((r) => !direct.has(r));
  process.stdout.write(
    `  ${thumbnailsResolved} thumbnail(s) resolved to ${fromThumbnails.size} ` +
      `distinct original(s), of which ${newOnes.length} original(s) that ` +
      `no <img> references directly.\n`,
  );
  process.stdout.write(`  ${writes} source file(s) written.\n`);
  for (const rel of unverified) {
    process.stdout.write(`  unverified: ${rel} is not on disk, resolved by name alone\n`);
  }
  for (const [src, reason] of skipped) process.stdout.write(`  skipped: ${src} - ${reason}\n`);
  return mapping;
}

/**
 * Copies the legacy album's images across, sanitising each one the same way.
 *
 * A SECOND TREE, NOT A SECOND PIPELINE: `reencode` is the same decode, resize
 * and encode `migrateImages` uses, so the two cannot drift. What differs is
 * where the files come from and go to - the legacy page names them
 * `galerie/8.jpg` under `htdocs/`, not WordPress upload paths - and the
 * destination is flattened to the basename under
 * `src/assets/content/galleries/legacy/`.
 *
 * `legacyRoot` is a parameter rather than a constant here because the tree
 * belongs to the caller: `galleries.mjs` owns `LEGACY_ROOT`, and the positive
 * controls in `media.test.mjs` pass a temporary tree. `requireUploads` is
 * reused for the missing-tree guard - it takes a path for exactly this reason -
 * because a machine without the backups must fail by name rather than migrate
 * zero in silence.
 *
 * THE SECOND LOCK IS HERE TOO, for the same reason it exists for uploads: the
 * legacy tree sits outside the repository and is read by absolute path, and the
 * paths come out of HTML from a twice-compromised server. `isInside` is asked
 * of the resolved paths before anything touches the filesystem, so a
 * `galerie/../../…` reference stops the run instead of becoming a read.
 *
 * Returns `Map<src, repoRelativePath>` like `migrateImages`, so the callers'
 * `assertImageReferences` and path rewriting work unchanged.
 */
export async function migrateLegacyImages(sources, legacyRoot, repoRoot = process.cwd()) {
  requireUploads(legacyRoot);
  const mapping = new Map();
  const skipped = [];
  const destinationDir = join(repoRoot, LEGACY_GALLERY_SUBDIR);
  // Destination (lower-cased) -> the source that claimed it. FLATTENING TO THE
  // BASENAME is what makes this guard necessary here: two legacy paths in
  // different directories would become one destination, and the tag/unique
  // count guards in `galleries.mjs` cannot see that difference. Same
  // `toLowerCase()` key, and the same ASCII-only reasoning, as `migrateImages`.
  const claims = new Map();
  let writes = 0;

  for (const src of [...new Set(sources)]) {
    // The type question first, as in `migrateImages`: an SVG is not migrated at
    // all, whatever the tree says.
    if (!allowedExtension(src)) { skipped.push([src, 'disallowed type']); continue; }
    const source = join(legacyRoot, src);
    const destinationRelative = `${LEGACY_GALLERY_SUBDIR}/${basename(src)}`;
    const destination = join(repoRoot, destinationRelative);
    // NOTHING TOUCHES THE FILESYSTEM ABOVE THIS LINE. Both the read and the
    // write are checked before either happens.
    if (!isInside(legacyRoot, source) || !isInside(destinationDir, destination)) {
      throw new Error(
        `Unsafe legacy path, caught by the second lock: ${src}\n` +
          `  would have read ${source}\n  would have written ${destination}`,
      );
    }
    const key = destinationRelative.toLowerCase();
    const claimedBy = claims.get(key);
    if (claimedBy !== undefined && claimedBy !== src) {
      throw new Error(
        `The destination ${destinationRelative} is claimed by two different legacy ` +
          `files: ${claimedBy} and ${src}.\n` +
          '  The legacy destination keeps only the basename, so two directories would ' +
          'overwrite each other; rename one at the source before resuming the migration.',
      );
    }
    claims.set(key, src);
    let output;
    try {
      output = await reencode(source, src);
    } catch (e) {
      skipped.push([src, e instanceof Error ? e.message : String(e)]);
      continue;
    }
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, output);
    writes += 1;
    mapping.set(src, destinationRelative);
  }

  // Print what was measured, not only the verdict - `process.stdout.write` for
  // the reason the other reporters use it.
  process.stdout.write(
    `\nLegacy images migrated: ${mapping.size} of ${new Set(sources).size} referenced.\n` +
      `  ${writes} source file(s) written.\n`,
  );
  for (const [src, reason] of skipped) process.stdout.write(`  skipped: ${src} - ${reason}\n`);
  return mapping;
}
