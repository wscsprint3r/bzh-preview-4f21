import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * WHAT THIS PROVES: every launch-checklist step the rulings document sends a
 * reader to is a step that exists in `docs/handover.md`.
 *
 * `phase-1-rulings.md` ends with six things decided provisionally and not
 * verified here, under the sentence "Each is in the launch checklist." That
 * sentence was FALSE for two of the six. `handover.md` contained no mention of
 * cancellation, Google Calendar or German at all.
 *
 * The one that cost something is the first. Ruling #28 shipped an explicit
 * `ANULAT:` marker in the summary AND `STATUS:CANCELLED` precisely BECAUSE
 * Google's handling of the second was reported rather than observed, and made a
 * real subscription after launch the thing that settles it. A sentence claiming
 * that check was scheduled somewhere it was not is how it never happens: the
 * document a future reader consults says it is covered, so nobody looks. The
 * behaviour at stake is whether a parishioner learns a Liturgy is cancelled, or
 * watches the day quietly disappear from their phone.
 *
 * ASSERT THAT A REFERENCE RESOLVES, NOT THAT ITS BUILT_TEXT APPEARS. This project's
 * own rule, and it is why this file does not grep `handover.md` for the word
 * "cancel". A rule for a path that does not exist looks exactly like a rule that
 * works; so does a checklist entry for a step nobody wrote. Each open item now
 * names its step as `checklist:<ID>`, and this fails if that id stops resolving.
 *
 * IT CANNOT PASS BY HAVING FOUND NOTHING. A rulings file with no `checklist:`
 * markers left in it, or a `handover.md` with no steps, fails the two cases
 * below rather than reporting an empty agreement - the failure shape this
 * project has paid for more than once.
 *
 * WHAT IT DOES NOT PROVE: that the step is the RIGHT one, or that anybody ran
 * it. Only that the reference is not dangling. The sixth open item deliberately
 * has no step - German breaks the phone day-name row, and there is no German
 * copy to break it with until Phase 2 - and the rulings say so in words rather
 * than pointing at something that does not exist.
 *
 * ===========================================================================
 * A REFERENCE THAT DECAYS MUST DANGLE, NOT VANISH - and it used to vanish.
 *
 * The extractor was `/\bchecklist:([A-Z]\d*)\b/`, which recognises a reference
 * only when it is already well formed. `checklist:ZZ9` matches nothing at all, so
 * a decayed id left the SET rather than failing to resolve, and the floor was a
 * constant `>= 5` that five survivors met. Measured: EXIT 0.
 *
 * That is this project's most-paid-for shape, on the guard written to close an
 * earlier instance of it: A GUARD THAT DERIVES ITS SUBJECT FROM THE ARTIFACT IT
 * CHECKS CAN ONLY CHECK WHAT IT RECOGNISED. So the subject is taken from
 * somewhere the defect cannot edit - the LIST OF OPEN ITEMS, which is the
 * structure the claim is about - and what the scanner does not recognise is loud:
 *
 *   - every `checklist:` token is collected whether or not it parses, and one
 *     that is not a well-formed id fails by name;
 *   - every open item must either carry a reference that resolves, or say in
 *     words that it is not a launch step. There is no constant to satisfy: the
 *     count comes from the items themselves, so a decayed reference leaves its
 *     item with neither half and fails whatever the other items do;
 *   - the sentence introducing the section counts the items in words, and that
 *     count is checked against the parse, because a number in prose that nothing
 *     compares is the thing that decays.
 * ===========================================================================
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

const RULINGS = 'docs/superpowers/phase-1-rulings.md';
const HANDOVER = 'docs/handover.md';

function read(path: string): string {
  const text = readFileSync(ROOT + path, 'utf8');
  expect(text.length, `${path} is empty`).toBeGreaterThan(0);
  return text;
}

/**
 * Every `checklist:<ID>` the rulings document names.
 *
 * The marker is a chosen convention, exactly like the backtick rule in
 * `public/_headers`: outside it there is no way to tell a step id from a letter
 * followed by a digit in ordinary prose, and a resolver that guessed would
 * either miss references or invent them.
 */
const VALID_ID = /^[A-Z]\d*$/;

/**
 * Every `checklist:` token in the text, exactly as written, PARSED OR NOT.
 *
 * Deliberately permissive where the old extractor was strict. It stops at
 * whitespace and at the punctuation that surrounds a reference in Markdown, so
 * `` `checklist:H9` `` yields `H9` and `checklist:ZZ9` yields `ZZ9` - which is
 * the point: a token that does not parse must arrive here and be rejected by
 * name, not fail to be seen.
 */
export function checklistTokens(text: string): string[] {
  return [...text.matchAll(/\bchecklist:([^\s`*,;.)\]]*)/g)].map((m) => m[1] as string);
}

/** The tokens that are not well-formed step ids. Empty means every one parsed. */
export function brokenTokens(text: string): string[] {
  return [...new Set(checklistTokens(text).filter((t) => !VALID_ID.test(t)))].sort();
}

/** Every well-formed `checklist:<ID>` the text names. */
export function rulingsReferences(text: string): string[] {
  return [...new Set(checklistTokens(text).filter((t) => VALID_ID.test(t)))].sort();
}

/** The "Still open" section, cut at the next heading so the last item ends where it ends. */
export function stillOpenSection(rulings: string): string {
  const begin = rulings.indexOf('## Still open');
  const after = rulings.indexOf('\n## ', begin + 1);
  return rulings.slice(begin, after === -1 ? undefined : after);
}

/** Each open item, as its own text: the subject the claim is actually about. */
export function openItems(rulings: string): string[] {
  const section = stillOpenSection(rulings);
  const starts = [...section.matchAll(/^\d+\. \*\*/gm)].map((m) => m.index as number);
  return starts.map((start, i) => section.slice(start, starts[i + 1] ?? section.length));
}

/** The words a count can be written as in that sentence, so prose can be compared with a parse. */
const NUMERALS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** The number the section's opening sentence claims, or null if it does not say. */
export function countInProse(rulings: string): number | null {
  const m = stillOpenSection(rulings).match(/^([A-Za-z]+) things are decided provisionally/m);
  if (m === null) return null;
  const i = NUMERALS.indexOf((m[1] as string).toLowerCase());
  return i === -1 ? null : i;
}

/** Whether an open item says in words that it is not a launch step. */
const EXEMPTION = 'NOT in the launch checklist';

/**
 * Every step id `handover.md` defines: `**A1.** …` for a step, `## G — …` for a
 * section that is itself the instruction.
 */
export function handoverSteps(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/^\*\*([A-Z]\d+)\./gm)) found.add(m[1] as string);
  for (const m of text.matchAll(/^## ([A-Z]) —/gm)) found.add(m[1] as string);
  return [...found].sort();
}

const RULINGS_TEXT = read(RULINGS);
const REFERENCES = rulingsReferences(RULINGS_TEXT);
const STEPS = handoverSteps(read(HANDOVER));
const ITEMS = openItems(RULINGS_TEXT);

describe('the references from rulings to the launch checklist', () => {
  it('rulings really does have open items to read', () => {
    // A guard that reads something must prove it read something. Without
    // this, the rule "every item either sends a reference, or explains itself" would be true
    // of zero items — exactly the shape of empty pass this project has paid for twice already.
    expect(ITEMS.length, `no open item in ${RULINGS}`).toBeGreaterThan(1);
  });

  it('rulings really does name checklist steps', () => {
    // Without this, "every reference resolves" would be true of zero references.
    expect(REFERENCES.length, `no checklist:<ID> in ${RULINGS}`).toBeGreaterThan(0);
  });

  it('handover really does have steps', () => {
    expect(STEPS.length, `no step in ${HANDOVER}`).toBeGreaterThan(10);
  });

  it('no malformed reference: an id that cannot be read must fail, not vanish', () => {
    /*
     * The hole `checklist:ZZ9` passed through with EXIT 0: the extractor recognised
     * a reference only when it was already well formed, so a decayed one left the
     * set instead of failing to resolve, and the floor was a constant that the
     * survivors met.
     */
    const malformed = brokenTokens(RULINGS_TEXT);
    expect(
      malformed,
      `„checklist:" urmat de ceva ce nu e un id de pas, în ${RULINGS}: ${malformed.join(', ')}. ` +
        'Un id decăzut trebuie să atârne, nu să dispară.',
    ).toEqual([]);
  });

  it('the malformed-reference detector really does fire', () => {
    // Positive control, on the exact shape measured: `ZZ9` was not being read at all.
    expect(brokenTokens('vezi `checklist:ZZ9` pentru restul')).toEqual(['ZZ9']);
    expect(rulingsReferences('vezi `checklist:ZZ9` pentru restul')).toEqual([]);
    expect(brokenTokens('vezi `checklist:h9`')).toEqual(['h9']);
    expect(brokenTokens('vezi `checklist:` pentru restul')).toEqual(['']);
    // And the other direction: a well-formed reference is not "broken".
    expect(brokenTokens('vezi `checklist:H9` și checklist:A4.')).toEqual([]);
    expect(rulingsReferences('vezi `checklist:H9` și checklist:A4.')).toEqual(['A4', 'H9']);
  });

  it('every open item either points at a step, or says there is none', () => {
    /*
     * The subject is taken from somewhere the defect cannot edit: THE LIST OF ITEMS,
     * which is the structure the claim is actually about. There is no more constant
     * to meet — a decayed reference leaves its item with neither half, and it
     * fails whatever the other items do.
     */
    const without: string[] = [];
    let withReference = 0;
    let exemptCount = 0;
    for (const item of ITEMS) {
      const refs = rulingsReferences(item);
      const exempt = item.includes(EXEMPTION);
      if (refs.length > 0) withReference += 1;
      if (exempt) exemptCount += 1;
      if (refs.length === 0 && !exempt) without.push((item.split('\n')[0] as string).slice(0, 90));
    }
    process.stdout.write(
      `\nElemente deschise în ${RULINGS}: ${ITEMS.length}` +
        ` — cu trimitere ${withReference}, scutite în cuvinte ${exemptCount}.\n`,
    );
    expect(
      without,
      'elemente deschise fără nicio trimitere `checklist:` și fără să spună că nu sunt pași de ' +
        `lansare:\n${without.join('\n')}\nScrie pasul, sau spune de ce nu este unul — „${EXEMPTION}".`,
    ).toEqual([]);
    // Both halves have to exist, or the rule would be true of a list in
    // which every item is exempted, or in which none is.
    expect(withReference, 'no item carries a reference').toBeGreaterThan(0);
    expect(exemptCount, 'no item exempted in words').toBeGreaterThan(0);
  });

  it('the number written in the prose is the number of items, not a figure from another day', () => {
    // A number in prose that nothing compares it to is exactly what decays. The
    // sentence says "Six things are decided provisionally"; the items are counted.
    const fromProse = countInProse(RULINGS_TEXT);
    expect(fromProse, `the opening sentence of ${RULINGS} no longer counts the items`).not.toBeNull();
    expect(fromProse).toBe(ITEMS.length);
  });

  it('every reference resolves to a step that exists', () => {
    process.stdout.write(
      `\nTrimiteri checklist din ${RULINGS}: ${REFERENCES.join(', ')}\n` +
        `Pași găsiți în ${HANDOVER} (${STEPS.length}): ${STEPS.join(', ')}\n`,
    );
    const missing = REFERENCES.filter((id) => !STEPS.includes(id));
    expect(
      missing,
      `rulings trimite la pași care nu există în ${HANDOVER}: ${missing.join(', ')}. ` +
        'Scrie pasul, sau spune în rulings că elementul nu este un pas de lansare și de ce.',
    ).toEqual([]);
  });

  it('the detector really does fire on a reference that does not resolve', () => {
    // Positive control: a guard that cannot fire verifies nothing.
    const invented = rulingsReferences('vezi `checklist:Z9` pentru restul');
    expect(invented).toEqual(['Z9']);
    expect(STEPS).not.toContain('Z9');
  });

  it('the item detector really does cut the section where it should', () => {
    /*
     * Without this, "every item" could be true of one giant item that swallows
     * the rest of the document, or of none. The shape is checked: the first item
     * starts at the first numbered point, the last ends before the next heading,
     * and none contains another item's start.
     */
    expect(ITEMS[0]).toContain('**');
    expect(stillOpenSection(RULINGS_TEXT)).not.toContain('## What generalises');
    for (const item of ITEMS) {
      expect([...item.matchAll(/^\d+\. \*\*/gm)]).toHaveLength(1);
    }
  });
});
