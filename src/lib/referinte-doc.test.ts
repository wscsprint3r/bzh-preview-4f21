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
 * ASSERT THAT A REFERENCE RESOLVES, NOT THAT ITS TEXT APPEARS. This project's
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

const RADACINA = fileURLToPath(new URL('../../', import.meta.url));

const RULINGS = 'docs/superpowers/phase-1-rulings.md';
const HANDOVER = 'docs/handover.md';

function citeste(cale: string): string {
  const text = readFileSync(RADACINA + cale, 'utf8');
  expect(text.length, `${cale} este gol`).toBeGreaterThan(0);
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
const ID_VALID = /^[A-Z]\d*$/;

/**
 * Every `checklist:` token in the text, exactly as written, PARSED OR NOT.
 *
 * Deliberately permissive where the old extractor was strict. It stops at
 * whitespace and at the punctuation that surrounds a reference in Markdown, so
 * `` `checklist:H9` `` yields `H9` and `checklist:ZZ9` yields `ZZ9` - which is
 * the point: a token that does not parse must arrive here and be rejected by
 * name, not fail to be seen.
 */
export function tokenuriChecklist(text: string): string[] {
  return [...text.matchAll(/\bchecklist:([^\s`*,;.)\]]*)/g)].map((m) => m[1] as string);
}

/** The tokens that are not well-formed step ids. Empty means every one parsed. */
export function tokenuriStricate(text: string): string[] {
  return [...new Set(tokenuriChecklist(text).filter((t) => !ID_VALID.test(t)))].sort();
}

/** Every well-formed `checklist:<ID>` the text names. */
export function referinteleRulings(text: string): string[] {
  return [...new Set(tokenuriChecklist(text).filter((t) => ID_VALID.test(t)))].sort();
}

/** The "Still open" section, cut at the next heading so the last item ends where it ends. */
export function sectiuneaDeschisa(rulings: string): string {
  const inceput = rulings.indexOf('## Still open');
  const dupa = rulings.indexOf('\n## ', inceput + 1);
  return rulings.slice(inceput, dupa === -1 ? undefined : dupa);
}

/** Each open item, as its own text: the subject the claim is actually about. */
export function elementeleDeschise(rulings: string): string[] {
  const sectiune = sectiuneaDeschisa(rulings);
  const inceputuri = [...sectiune.matchAll(/^\d+\. \*\*/gm)].map((m) => m.index as number);
  return inceputuri.map((start, i) => sectiune.slice(start, inceputuri[i + 1] ?? sectiune.length));
}

/** The words a count can be written as in that sentence, so prose can be compared with a parse. */
const NUMERALE = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** The number the section's opening sentence claims, or null if it does not say. */
export function numarulDinProza(rulings: string): number | null {
  const m = sectiuneaDeschisa(rulings).match(/^([A-Za-z]+) things are decided provisionally/m);
  if (m === null) return null;
  const i = NUMERALE.indexOf((m[1] as string).toLowerCase());
  return i === -1 ? null : i;
}

/** Whether an open item says in words that it is not a launch step. */
const SCUTIRE = 'NOT in the launch checklist';

/**
 * Every step id `handover.md` defines: `**A1.** …` for a step, `## G — …` for a
 * section that is itself the instruction.
 */
export function pasiiHandover(text: string): string[] {
  const gasite = new Set<string>();
  for (const m of text.matchAll(/^\*\*([A-Z]\d+)\./gm)) gasite.add(m[1] as string);
  for (const m of text.matchAll(/^## ([A-Z]) —/gm)) gasite.add(m[1] as string);
  return [...gasite].sort();
}

const RULINGS_TEXT = citeste(RULINGS);
const REFERINTE = referinteleRulings(RULINGS_TEXT);
const PASI = pasiiHandover(citeste(HANDOVER));
const ELEMENTE = elementeleDeschise(RULINGS_TEXT);

describe('trimiterile din rulings către lista de lansare', () => {
  it('rulings chiar are elemente deschise de citit', () => {
    // O gardă care citește ceva trebuie să dovedească faptul că a citit ceva. Fără
    // asta, regula „fiecare element sau trimite, sau se explică" ar fi adevărată
    // despre zero elemente — exact felul de trecere goală plătit aici de două ori.
    expect(ELEMENTE.length, `niciun element deschis în ${RULINGS}`).toBeGreaterThan(1);
  });

  it('rulings chiar numește pași de checklist', () => {
    // Fără asta, „fiecare trimitere rezolvă" ar fi adevărat despre zero trimiteri.
    expect(REFERINTE.length, `niciun checklist:<ID> în ${RULINGS}`).toBeGreaterThan(0);
  });

  it('handover chiar are pași', () => {
    expect(PASI.length, `niciun pas în ${HANDOVER}`).toBeGreaterThan(10);
  });

  it('nicio trimitere stricată: un id care nu se citește trebuie să pice, nu să dispară', () => {
    /*
     * Gaura, prin care a trecut `checklist:ZZ9` cu EXIT 0: extractorul recunoștea
     * o trimitere numai dacă era deja bine formată, deci una decăzută ieșea din
     * mulțime în loc să nu rezolve, iar podeaua era o constantă pe care cei
     * rămași o îndeplineau.
     */
    const stricate = tokenuriStricate(RULINGS_TEXT);
    expect(
      stricate,
      `„checklist:" urmat de ceva ce nu e un id de pas, în ${RULINGS}: ${stricate.join(', ')}. ` +
        'Un id decăzut trebuie să atârne, nu să dispară.',
    ).toEqual([]);
  });

  it('detectorul de trimiteri stricate chiar se declanșează', () => {
    // Control pozitiv, pe exact forma măsurată: `ZZ9` nu se citea deloc.
    expect(tokenuriStricate('vezi `checklist:ZZ9` pentru restul')).toEqual(['ZZ9']);
    expect(referinteleRulings('vezi `checklist:ZZ9` pentru restul')).toEqual([]);
    expect(tokenuriStricate('vezi `checklist:h9`')).toEqual(['h9']);
    expect(tokenuriStricate('vezi `checklist:` pentru restul')).toEqual(['']);
    // Și cealaltă direcție: o trimitere bine formată nu este „stricată".
    expect(tokenuriStricate('vezi `checklist:H9` și checklist:A4.')).toEqual([]);
    expect(referinteleRulings('vezi `checklist:H9` și checklist:A4.')).toEqual(['A4', 'H9']);
  });

  it('fiecare element deschis ori trimite la un pas, ori spune că nu este unul', () => {
    /*
     * Subiectul luat de unde nu-l poate edita defectul: LISTA DE ELEMENTE, care
     * este structura despre care vorbește afirmația. Nu mai există nicio constantă
     * de îndeplinit — o trimitere decăzută își lasă elementul fără nicio jumătate
     * și pică, orice ar face celelalte elemente.
     */
    const fara: string[] = [];
    let cuTrimitere = 0;
    let scutite = 0;
    for (const element of ELEMENTE) {
      const ale = referinteleRulings(element);
      const scutit = element.includes(SCUTIRE);
      if (ale.length > 0) cuTrimitere += 1;
      if (scutit) scutite += 1;
      if (ale.length === 0 && !scutit) fara.push((element.split('\n')[0] as string).slice(0, 90));
    }
    process.stdout.write(
      `\nElemente deschise în ${RULINGS}: ${ELEMENTE.length}` +
        ` — cu trimitere ${cuTrimitere}, scutite în cuvinte ${scutite}.\n`,
    );
    expect(
      fara,
      'elemente deschise fără nicio trimitere `checklist:` și fără să spună că nu sunt pași de ' +
        `lansare:\n${fara.join('\n')}\nScrie pasul, sau spune de ce nu este unul — „${SCUTIRE}".`,
    ).toEqual([]);
    // Ambele jumătăți trebuie să existe, altfel regula ar fi adevărată despre o
    // listă în care toate elementele sunt scutite, sau în care niciunul nu e.
    expect(cuTrimitere, 'niciun element cu trimitere').toBeGreaterThan(0);
    expect(scutite, 'niciun element scutit în cuvinte').toBeGreaterThan(0);
  });

  it('numărul scris în proză este numărul elementelor, nu o cifră de altădată', () => {
    // Un număr din proză pe care nu-l compară nimeni este tocmai ce decade. Fraza
    // spune „Six things are decided provisionally"; elementele se numără.
    const dinProza = numarulDinProza(RULINGS_TEXT);
    expect(dinProza, `fraza de deschidere din ${RULINGS} nu mai numără elementele`).not.toBeNull();
    expect(dinProza).toBe(ELEMENTE.length);
  });

  it('fiecare trimitere rezolvă la un pas care există', () => {
    process.stdout.write(
      `\nTrimiteri checklist din ${RULINGS}: ${REFERINTE.join(', ')}\n` +
        `Pași găsiți în ${HANDOVER} (${PASI.length}): ${PASI.join(', ')}\n`,
    );
    const lipsa = REFERINTE.filter((id) => !PASI.includes(id));
    expect(
      lipsa,
      `rulings trimite la pași care nu există în ${HANDOVER}: ${lipsa.join(', ')}. ` +
        'Scrie pasul, sau spune în rulings că elementul nu este un pas de lansare și de ce.',
    ).toEqual([]);
  });

  it('detectorul chiar se declanșează pe o trimitere care nu rezolvă', () => {
    // Control pozitiv: o gardă care nu poate să se declanșeze nu verifică nimic.
    const inventat = referinteleRulings('vezi `checklist:Z9` pentru restul');
    expect(inventat).toEqual(['Z9']);
    expect(PASI).not.toContain('Z9');
  });

  it('detectorul de elemente chiar taie secțiunea unde trebuie', () => {
    /*
     * Fără asta, „fiecare element" ar putea fi adevărat despre un element uriaș
     * care înghite tot restul documentului, sau despre niciunul. Se verifică
     * forma: primul element începe cu primul punct numerotat, ultimul se termină
     * înainte de titlul următor, și niciunul nu conține un alt început de element.
     */
    expect(ELEMENTE[0]).toContain('**');
    expect(sectiuneaDeschisa(RULINGS_TEXT)).not.toContain('## What generalises');
    for (const element of ELEMENTE) {
      expect([...element.matchAll(/^\d+\. \*\*/gm)]).toHaveLength(1);
    }
  });
});
