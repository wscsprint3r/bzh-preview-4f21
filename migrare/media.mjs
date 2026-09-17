import { existsSync, realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
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

/** Just the extension question, asked without the thumbnail question. */
function extensiePermisa(cale) {
  const ext = cale.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSII_PERMISE.includes(ext);
}

export function esteOriginal(cale) {
  if (MINIATURA.test(cale)) return false;
  return extensiePermisa(cale);
}

/**
 * The original a WordPress thumbnail was cut from: `poza-300x200.jpg` ->
 * `poza.jpg`. Anything that is not a thumbnail comes back unchanged.
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
 * Same regex as `MINIATURA`, with the extension captured so it survives. The
 * two must keep matching the same shape, which is why the pattern is written
 * once here and `MINIATURA` is the same expression anchored the same way.
 */
export function numeOriginalului(cale) {
  return cale.replace(/-\d+x\d+(\.[A-Za-z0-9]+)$/, '$1');
}

/** The size a thumbnail's own name claims it is, or `null`. */
function dimensiuniDinNume(cale) {
  const m = cale.match(/-(\d+)x(\d+)\.[A-Za-z0-9]+$/);
  return m === null ? null : { latime: Number(m[1]), inaltime: Number(m[2]) };
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
  const r = realCatSePoate(radacina);
  const c = realCatSePoate(cale);
  return c === r || c.startsWith(r + sep);
}

/**
 * `realpath` of the deepest part of `cale` that exists, with the rest appended.
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
function realCatSePoate(cale) {
  let p = resolve(cale);
  const ramase = [];
  for (;;) {
    try {
      return ramase.length === 0 ? realpathSync(p) : join(realpathSync(p), ...ramase);
    } catch {
      const parinte = dirname(p);
      if (parinte === p) return resolve(cale);
      ramase.unshift(basename(p));
      p = parinte;
    }
  }
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
  // ANCHORED. Unanchored, `https://evil.example/myuploads/2024/05/poza.jpg`
  // matched, and the pipeline would then have migrated the parish's OWN
  // `2024/05/poza.jpg` in its place - not an escape, but a foreign page
  // choosing which of our files lands under which name. Measured: all 100 real
  // srcs carry `/wp-content/uploads/`, including the two protocol-relative ones.
  const m = srcWp.match(/(?:^|\/)wp-content\/uploads\/(.+)$/);
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
  // A thumbnail lands on its original's name, so `poza.jpg` and
  // `poza-300x200.jpg` name the same file and the picture is stored once.
  return `${SUB_CONTINUT}/${numeOriginalului(relativ)}`;
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
const OPTIUNI_ENCODARE = {
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

/** Dimensions as a viewer sees them: EXIF orientation applied. */
async function dimensiuniOrientate(cale) {
  const m = await sharp(cale).metadata();
  const intors = (m.orientation ?? 1) >= 5;
  return { latime: intors ? m.height : m.width, inaltime: intors ? m.width : m.height };
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
async function verificaMiniatura(caleMiniatura, caleOriginal, relativMiniatura, relativOriginal) {
  if (!existsSync(caleOriginal)) {
    throw new Error(
      `Miniatura ${relativMiniatura} nu are original pe disc: ${relativOriginal}\n` +
        '  O miniatura referita este migrata ca originalul din care a fost taiata. ' +
        'Fara original nu se poate: nu se pune miniatura in locul lui in tacere, ' +
        'fiindca o taietura de cateva sute de pixeli nu este poza.',
    );
  }
  if (!existsSync(caleMiniatura)) return false;
  const cerut = dimensiuniDinNume(relativMiniatura);
  const brut = await sharp(caleMiniatura).metadata();
  if (brut.width !== cerut.latime || brut.height !== cerut.inaltime) {
    throw new Error(
      `${relativMiniatura} nu este o miniatura: numele spune ` +
        `${cerut.latime}x${cerut.inaltime}, fisierul este ${brut.width}x${brut.height}.\n` +
        '  Deci numele nu a fost scris de WordPress, iar dezbracarea sufixului ar fi ' +
        `o presupunere despre carui fisier ii apartine (${relativOriginal}).`,
    );
  }
  const mini = await dimensiuniOrientate(caleMiniatura);
  const orig = await dimensiuniOrientate(caleOriginal);
  if (orig.latime < mini.latime || orig.inaltime < mini.inaltime) {
    throw new Error(
      `${relativOriginal} este mai mic decat miniatura lui presupusa ` +
        `${relativMiniatura}: ${orig.latime}x${orig.inaltime} fata de ` +
        `${mini.latime}x${mini.inaltime}. Nu sunt aceeasi poza.`,
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
  // Destination per SOURCE file, so a picture referenced both directly and
  // through one or more of its thumbnails is decoded and written exactly once.
  const scrise = new Map();
  const cazute = new Set();
  // A COUNTER, not `scrise.size`: a Map de-duplicates by construction, so its
  // size reports one whether the file was written once or three times - which
  // is exactly the thing this number exists to report on.
  let scrieri = 0;
  // Destination (lower-cased) -> the source file that claimed it. Two DIFFERENT
  // source files reaching one destination is only possible when their names
  // differ merely by case, and that is a real platform-dependent bug: on Linux,
  // which builds this site, they are two files and one overwrites the other in
  // the repository; on macOS, which it is developed on, they are one file and
  // nobody sees it. Measured 0 among the 100 real references - so today this
  // holds by luck, and this map is what makes it hold by construction.
  const revendicate = new Map();
  // What resolution did, for the report below.
  const dinMiniaturi = new Set();
  const directe = new Set();
  const neverificate = [];
  let miniaturiRezolvate = 0;

  for (const src of [...new Set(surse)]) {
    // The TYPE question comes before the thumbnail question: an SVG is not
    // migrated at all, and that must not change because its name carries a size.
    if (!extensiePermisa(src)) { esuate.push([src, 'tip nepermis']); continue; }
    // Deliberately OUTSIDE the try below: an unsafe path must stop the run, not
    // become one more skipped line in a report that exits 0. Validated on the
    // UNTRUSTED text, before anything is derived from it.
    const relativBrut = caleaRelativa(src);
    if (relativBrut === null) { esuate.push([src, 'cale straina']); continue; }
    const esteMin = MINIATURA.test(relativBrut);
    const relativ = numeOriginalului(relativBrut);
    // A name that is NOTHING BUT a size: `-300x200.jpg` strips to `.jpg`, a
    // name with no stem at all. Unreachable in practice, because the missing
    // original fires first, but it was named nowhere - a reader met it as a
    // baffling complaint about a file called `.jpg`.
    if (basename(relativ).startsWith('.')) {
      esuate.push([src, 'numele este numai o dimensiune, nu ramane nimic din el']);
      continue;
    }
    const sursa = join(radacinaUploads, relativ);
    const caleMiniatura = join(radacinaUploads, relativBrut);
    const destinatieRel = numeDestinatie(src);
    const destinatie = join(radacinaRepo, destinatieRel);
    // THE SECOND LOCK, AND IT IS GENUINELY SECOND NOW. It used to sit after
    // `verificaMiniatura` and after the de-duplication, so it was made about
    // paths this process had already `existsSync`-ed and handed to sharp to
    // decode, and a de-duplicated `src` never reached it at all. The claim
    // "two locks on one door" was therefore not true of the pipeline, only of
    // the unit control. NOTHING TOUCHES THE FILESYSTEM ABOVE THIS LINE.
    if (
      !esteInauntrul(radacinaUploads, sursa) ||
      (esteMin && !esteInauntrul(radacinaUploads, caleMiniatura)) ||
      !esteInauntrul(subContinut, destinatie)
    ) {
      throw new Error(
        `Cale de upload nesigura, prinsa de a doua incuietoare: ${src}\n` +
          `  ar fi citit ${sursa}\n  ar fi scris ${destinatie}`,
      );
    }
    const cheie = destinatieRel.toLowerCase();
    const revendicatDe = revendicate.get(cheie);
    if (revendicatDe !== undefined && revendicatDe !== relativ) {
      throw new Error(
        `Destinatia ${destinatieRel} este revendicata de doua fisiere sursa ` +
          `diferite: ${revendicatDe} si ${relativ}.\n` +
          '  Se deosebesc doar prin majuscule, deci pe Linux sunt doua poze si una ' +
          'o suprascrie pe cealalta in depozit, iar pe macOS sunt una singura si ' +
          'nimeni nu observa. Redenumeste una in sursa inainte sa reiei migrarea.',
      );
    }
    revendicate.set(cheie, relativ);
    if (esteMin) {
      // Throws, by name, when the resolution cannot be justified.
      const verificata = await verificaMiniatura(caleMiniatura, sursa, relativBrut, relativ);
      if (!verificata) neverificate.push(relativBrut);
      miniaturiRezolvate += 1;
      dinMiniaturi.add(relativ);
    } else {
      directe.add(relativ);
    }
    if (scrise.has(relativ)) { harta.set(src, scrise.get(relativ)); continue; }
    if (cazute.has(relativ)) continue;
    // Declared out here because the WRITE must not be inside the catch below:
    // a file that cannot be decoded is a corpus problem, named and skipped, but
    // a file that cannot be written is an environment problem - a full disk, a
    // read-only checkout - and reporting the two the same way leaves a run that
    // prints a tidy list and exits 0 having written nothing.
    let iesire;
    try {
      const brut = await readFile(sursa);
      // Decode -> resize -> re-encode. This is the sanitisation: whatever was
      // appended to, or hidden in, the original does not survive being turned
      // back into pixels and written out fresh. Nothing calls `withMetadata`,
      // so EXIF goes too - which is where a payload hides when appending one
      // after the end marker stops working.
      const imagine = sharp(brut, { failOn: 'error' }).rotate().keepIccProfile();
      const meta = await imagine.metadata();
      const ext = relativ.split('.').pop().toLowerCase();
      const permise = EXTENSII_PENTRU_FORMAT[meta.format];
      if (permise === undefined || !permise.includes(ext)) {
        esuate.push([src, `numele spune .${ext}, continutul este ${meta.format}`]);
        cazute.add(relativ);
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
      iesire = await OPTIUNI_ENCODARE[meta.format](redimensionata).toBuffer();
    } catch (e) {
      esuate.push([src, e instanceof Error ? e.message : String(e)]);
      cazute.add(relativ);
      continue;
    }
    await mkdir(dirname(destinatie), { recursive: true });
    await writeFile(destinatie, iesire);
    scrieri += 1;
    scrise.set(relativ, destinatieRel);
    harta.set(src, destinatieRel);
  }
  // Print what was measured, not only the verdict. `process.stdout.write` and
  // not `console.log`, which vitest's default reporter swallows on exactly the
  // green run a later reader would check these numbers against.
  process.stdout.write(
    `\nImagini migrate: ${harta.size} din ${new Set(surse).size} referite.\n`,
  );
  // What resolution did is the number a later reader will want to audit: how
  // much of the corpus reaches the site only because a thumbnail was pointed
  // back at its original.
  const noi = [...dinMiniaturi].filter((r) => !directe.has(r));
  process.stdout.write(
    `  ${miniaturiRezolvate} miniatura(i) rezolvate la ${dinMiniaturi.size} ` +
      `original(e) distinct(e), dintre care ${noi.length} original(e) pe care ` +
      `niciun <img> nu le refera direct.\n`,
  );
  process.stdout.write(`  ${scrieri} fisier(e) sursa scrise.\n`);
  for (const rel of neverificate) {
    process.stdout.write(`  neverificata: ${rel} nu este pe disc, rezolvata doar dupa nume\n`);
  }
  for (const [src, motiv] of esuate) process.stdout.write(`  sarita: ${src} - ${motiv}\n`);
  return harta;
}
