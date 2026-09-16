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
export function referinteleRulings(text: string): string[] {
  return [...new Set([...text.matchAll(/\bchecklist:([A-Z]\d*)\b/g)].map((m) => m[1] as string))].sort();
}

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

const REFERINTE = referinteleRulings(citeste(RULINGS));
const PASI = pasiiHandover(citeste(HANDOVER));

describe('trimiterile din rulings către lista de lansare', () => {
  it('rulings chiar numește pași de checklist', () => {
    // Fără asta, „fiecare trimitere rezolvă" ar fi adevărat despre zero trimiteri.
    expect(REFERINTE.length, `niciun checklist:<ID> în ${RULINGS}`).toBeGreaterThanOrEqual(5);
  });

  it('handover chiar are pași', () => {
    expect(PASI.length, `niciun pas în ${HANDOVER}`).toBeGreaterThan(10);
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

  it('elementul care NU are pas spune asta în cuvinte, nu tăcând', () => {
    /*
     * A doua jumătate, și cea pe care o sentință falsă o ascundea: un element
     * fără trimitere trebuie să fie o decizie scrisă, nu o omisiune. Se verifică
     * numărul: șase elemente deschise, cinci cu trimitere, unul explicat.
     */
    const rulings = citeste(RULINGS);
    const deschise = rulings.slice(rulings.indexOf('## Still open'));
    const elemente = [...deschise.matchAll(/^\d+\. \*\*/gm)].length;
    expect(elemente, 'elementele deschise din rulings').toBe(6);
    expect(deschise).toContain('NOT in the launch checklist');
  });
});
