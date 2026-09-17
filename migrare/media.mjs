import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import sharp from 'sharp';

/**
 * The uploads tree, by absolute path, OUTSIDE this repository.
 *
 * Same reasoning as `db.mjs`'s `SURSA_DUMP`, and the same directory: the parent
 * holds several GB of forensic backups of the compromised server plus a file of
 * database credentials, and nothing in this tree is ever the source of a
 * migration. The file tree lives in the 08-22 backup and the database in the
 * 08-27 one - they are two different captures, and this is not a typo for the
 * date in `db.mjs`. Measured 2026-09-17: 7,421 files, 997 MB, of which 24 are
 * SVG.
 */
export const RADACINA_UPLOADS =
  '/Users/stefan/Work/stuff/site-bzh/backup-2026-08-22/web01/htdocs/wp-content/uploads';

/** The one place a migrated image may land, relative to the repository root. */
const SUB_CONTINUT = 'src/assets/continut';

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
export const EXTENSII_PERMISE = ['jpeg', 'jpg', 'png', 'webp'];

/** The long edge everything is downscaled to. Spec 11. */
const LATURA_MAXIMA = 2400;

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
const MINIATURA = /-\d+x\d+\.[A-Za-z0-9]+$/;

export function esteOriginal(cale) {
  if (MINIATURA.test(cale)) return false;
  const ext = cale.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSII_PERMISE.includes(ext);
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
 * Refusing rather than decoding is deliberate for percent-encoding in
 * particular - 0 srcs contain a `%` - because `%2e%2e%2f` decodes to a
 * traversal, and a reference nobody can read is worth naming rather than
 * guessing at. Non-ASCII is refused for a second reason: a filename carrying a
 * Turkish cedilla would land in a tracked path and fail the repository-wide
 * sweep in `src/lib/diacritice-surse.test.ts`. Measured: 0 non-ASCII characters
 * in the real set, so the rule is free here too.
 */
const SEGMENT_PERMIS = /^[A-Za-z0-9._-]+$/;

/**
 * Whether `cale` resolves inside `radacina`. The SECOND lock.
 *
 * `SEGMENT_PERMIS` is the first and is meant to be sufficient; this one asks
 * the question of the resolved path itself, so it cannot be fooled by anything
 * about the spelling that was not anticipated. Two locks on one door is
 * deliberate here: this is the boundary the whole task exists to be.
 *
 * `radacina + sep` rather than a bare `startsWith`, or `/a/bc` counts as inside
 * `/a/b`.
 */
export function esteInauntrul(radacina, cale) {
  const r = resolve(radacina);
  const c = resolve(cale);
  return c === r || c.startsWith(r + sep);
}

/**
 * The part of a WordPress `src` below `uploads/`, or `null` when it is not an
 * upload path at all.
 *
 * THE TWO OUTCOMES ARE NOT THE SAME KIND OF EVENT, which is why one is a
 * return value and the other is an exception. A `src` with no `uploads/` in it
 * is an ordinary foreign reference - an external image, a `data:` URL - and the
 * caller skips it and says so. A `src` that IS an upload path but whose shape
 * could escape is an attack in the content, and a pipeline that prints it and
 * exits 0 has shipped it. So that one throws and stops the migration: somebody
 * has to read the document it came from before anything else from that server
 * is trusted. Measured: 0 of the 100 real srcs throw.
 */
function caleaRelativa(srcWp) {
  const m = srcWp.match(/uploads\/(.+)$/);
  if (m === null) return null;
  const relativ = m[1];
  const segmente = relativ.split('/');
  const rele = segmente.filter(
    (s) => !SEGMENT_PERMIS.test(s) || s === '.' || s === '..',
  );
  if (rele.length > 0) {
    throw new Error(
      `Cale de upload nesigura: ${srcWp}\n` +
        `  segmente respinse: ${JSON.stringify(rele)}\n` +
        '  Un `src` din continutul unui server compromis nu devine niciodata o cale ' +
        'pe disc fara sa treaca de lista de caractere permise. Citeste documentul din ' +
        'care vine inainte sa reiei migrarea.',
    );
  }
  return relativ;
}

/**
 * The repo path an upload becomes, keeping WordPress's year/month folders.
 *
 * The folders are kept because filenames repeat: `Design-fara-titlu.png` exists
 * under both 2024/05 and 2024/07 in this very corpus, and flattening would have
 * one silently overwrite the other.
 */
export function numeDestinatie(srcWp) {
  const relativ = caleaRelativa(srcWp);
  if (relativ === null) throw new Error(`Nu este o cale de upload: ${srcWp}`);
  return `${SUB_CONTINUT}/${relativ}`;
}

/**
 * Fails by name when the uploads tree is absent.
 *
 * The same guard, for the same reason, as `db.mjs`'s `verificaSursa`: without
 * it, a machine that has never held the backups runs the whole migration, finds
 * nothing, writes nothing, prints `Imagini migrate: 0 din 97` and exits 0 - and
 * the first symptom is a site with no pictures that nobody can explain.
 */
export function verificaUploads(cale = RADACINA_UPLOADS) {
  if (!existsSync(cale)) {
    throw new Error(
      `Directorul uploads nu a fost gasit: ${cale}\n` +
        'Migrarea citeste imaginile din copiile de siguranta din directorul parinte, ' +
        'care nu fac parte din depozit. Fara ele nu se poate migra nicio imagine.',
    );
  }
  return cale;
}

/**
 * The encoder options, written out rather than left to sharp's defaults.
 *
 * Spec 11 asks that rerunning the migration produce identical output, and an
 * encoder default that moves between sharp versions is exactly the kind of
 * reproducibility bug that has no symptom - the pictures still look right, the
 * bytes are simply different.
 *
 * THESE ARE TODAY'S DEFAULTS, PINNED, NOT A RE-TUNING. Measured on all 64
 * referenced originals against sharp 0.35.4 / libvips 8.18.6: encoding with
 * these options and encoding with `.toBuffer()` alone produced byte-identical
 * output 64 times out of 64. That measurement is what makes the pin faithful -
 * without it this block would be a guess about what the defaults are, which is
 * worse than not pinning at all.
 */
const OPTIUNI_ENCODARE = {
  jpeg: (img) =>
    img.jpeg({
      quality: 80, progressive: false, chromaSubsampling: '4:2:0',
      optimiseCoding: true, mozjpeg: false, trellisQuantisation: false,
      overshootDeringing: false, optimiseScans: false, quantisationTable: 0,
    }),
  png: (img) =>
    img.png({ compressionLevel: 6, adaptiveFiltering: false, palette: false, effort: 7 }),
  webp: (img) =>
    img.webp({
      quality: 80, alphaQuality: 100, lossless: false, nearLossless: false,
      smartSubsample: false, effort: 4,
    }),
};

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
const EXTENSII_PENTRU_FORMAT = { jpeg: ['jpg', 'jpeg'], png: ['png'], webp: ['webp'] };

/**
 * Copies the referenced images across, sanitising each one by re-encoding it.
 *
 * Returns a map from the original `src` to its new repo path. A source that is
 * missing, or that sharp cannot decode, is reported by name and LEFT OUT of
 * the map - the caller then knows the reference is dead and can say so, rather
 * than emitting Markdown pointing at a file that was never written.
 *
 * `radacinaUploads` is injectable for the same reason `db.mjs`'s `porneste`
 * takes a dump path: no real caller passes one, and it exists so the positive
 * controls in `media.test.mjs` can show the sanitiser meeting a poisoned file
 * and a file that is not an image at all, without either the backups or a
 * checked-in binary fixture. A sanitiser that is never shown a malicious file
 * is not known to sanitise.
 */
export async function migreazaImagini(
  surse,
  radacinaRepo = process.cwd(),
  radacinaUploads = RADACINA_UPLOADS,
) {
  verificaUploads(radacinaUploads);
  const harta = new Map();
  const esuate = [];
  const subContinut = join(radacinaRepo, SUB_CONTINUT);
  for (const src of [...new Set(surse)]) {
    if (!esteOriginal(src)) {
      esuate.push([src, MINIATURA.test(src) ? 'miniatura WordPress' : 'tip nepermis']);
      continue;
    }
    // Deliberately OUTSIDE the try below: an unsafe path must stop the run, not
    // become one more skipped line in a report that exits 0.
    const relativ = caleaRelativa(src);
    if (relativ === null) { esuate.push([src, 'cale straina']); continue; }
    const sursa = join(radacinaUploads, relativ);
    const destinatieRel = numeDestinatie(src);
    const destinatie = join(radacinaRepo, destinatieRel);
    if (!esteInauntrul(radacinaUploads, sursa) || !esteInauntrul(subContinut, destinatie)) {
      throw new Error(
        `Cale de upload nesigura, prinsa de a doua incuietoare: ${src}\n` +
          `  ar fi citit ${sursa}\n  ar fi scris ${destinatie}`,
      );
    }
    try {
      const brut = await readFile(sursa);
      // Decode -> resize -> re-encode. This is the sanitisation: whatever was
      // appended to, or hidden in, the original does not survive being turned
      // back into pixels and written out fresh. Nothing calls `withMetadata`,
      // so EXIF goes too - which is where a payload hides when appending one
      // after the end marker stops working.
      const imagine = sharp(brut, { failOn: 'error' }).rotate();
      const meta = await imagine.metadata();
      const ext = relativ.split('.').pop().toLowerCase();
      const permise = EXTENSII_PENTRU_FORMAT[meta.format];
      if (permise === undefined || !permise.includes(ext)) {
        esuate.push([src, `numele spune .${ext}, continutul este ${meta.format}`]);
        continue;
      }
      // `Math.max` of both edges, so an EXIF orientation that swaps them cannot
      // change the decision.
      const redimensionata =
        Math.max(meta.width ?? 0, meta.height ?? 0) > LATURA_MAXIMA
          ? imagine.resize({
              width: LATURA_MAXIMA, height: LATURA_MAXIMA, fit: 'inside', kernel: 'lanczos3',
            })
          : imagine;
      const iesire = await OPTIUNI_ENCODARE[meta.format](redimensionata).toBuffer();
      await mkdir(dirname(destinatie), { recursive: true });
      await writeFile(destinatie, iesire);
      harta.set(src, destinatieRel);
    } catch (e) {
      esuate.push([src, e instanceof Error ? e.message : String(e)]);
    }
  }
  // Print what was measured, not only the verdict. `process.stdout.write` and
  // not `console.log`, which vitest's default reporter swallows on exactly the
  // green run a later reader would check these numbers against.
  process.stdout.write(
    `\nImagini migrate: ${harta.size} din ${new Set(surse).size} referite.\n`,
  );
  for (const [src, motiv] of esuate) process.stdout.write(`  sarita: ${src} - ${motiv}\n`);
  return harta;
}
