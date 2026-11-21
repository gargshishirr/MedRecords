/**
 * Simple safety checks when a medicine is added or edited: a clash with a
 * recorded allergy, the same medicine twice, or two medicines that contain the
 * same kind of drug (a common way to take too much paracetamol or painkiller).
 *
 * This is a short, hand-picked list of common medicine families and Indian
 * brand names. It can't catch everything, so the wording always points people
 * to their doctor or pharmacist.
 */
import type { Allergy, Medication } from './types';
import { isCurrentlyActive } from './meds';

interface DrugFamily {
  id: string;
  label: string;
  /** Words in an allergy's name that mean this family. */
  allergy: RegExp;
  /** Medicines and brands in this family. */
  drugs: RegExp;
  /** Taking two at once is a usual cause of overdose. */
  noDoubling?: boolean;
}

const FAMILIES: DrugFamily[] = [
  {
    id: 'penicillin',
    label: 'a penicillin',
    allergy: /penicillin|amoxi|ampici|augmentin|beta.?lactam/i,
    drugs: /penicillin|amoxicillin|amoxycillin|amoxyclav|amoxiclav|augmentin|clavam|moxikind|mox\b|ampicillin|cloxacillin|flucloxacillin|piperacillin/i,
  },
  {
    id: 'cephalosporin',
    label: 'a cephalosporin',
    allergy: /cephalo|cef/i,
    drugs: /\bcef|\bceph|taxim|monocef|zifi/i,
  },
  {
    id: 'sulfa',
    label: 'a sulfa medicine',
    allergy: /sulfa|sulpha|sulfon|sulphon|co-?trimoxazole|septran|bactrim/i,
    drugs: /sulfa|sulpha|co-?trimoxazole|septran|bactrim|sulfasalazine|sulphasalazine/i,
  },
  {
    id: 'macrolide',
    label: 'a macrolide antibiotic',
    allergy: /macrolide|azithro|erythro|clarithro/i,
    drugs: /azithromycin|azithral|azee|erythromycin|clarithromycin/i,
  },
  {
    id: 'quinolone',
    label: 'a quinolone antibiotic',
    allergy: /quinolone|ciproflox|levoflox|oflox|norflox/i,
    drugs: /ciprofloxacin|ciplox|levofloxacin|levoflox|ofloxacin|moxifloxacin|norfloxacin|norflox/i,
  },
  {
    id: 'nsaid',
    label: 'an NSAID painkiller',
    allergy: /nsaid|aspirin|ibuprofen|diclofenac|naproxen|painkiller/i,
    drugs: /aspirin|ecosprin|disprin|ibuprofen|brufen|combiflam|diclofenac|voveran|naproxen|mefenamic|meftal|ketorolac|aceclofenac|zerodol|hifenac|nimesulide|nise\b|etoricoxib|piroxicam|indomethacin/i,
    noDoubling: true,
  },
  {
    id: 'paracetamol',
    label: 'paracetamol',
    allergy: /paracetamol|acetaminophen/i,
    drugs: /paracetamol|acetaminophen|crocin|dolo|calpol|pacimol|combiflam|sumo\b|febrex|p-?650|p-?500/i,
    noDoubling: true,
  },
];

export interface SafetyWarning {
  kind: 'allergy' | 'duplicate' | 'same-family';
  message: string;
}

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function familiesOf(name: string): DrugFamily[] {
  return FAMILIES.filter((f) => f.drugs.test(name));
}

/** Does this allergy cover this medicine? Checks medicine families, then plain name overlap. */
function allergyClash(allergy: Allergy, medName: string): DrugFamily | 'name' | null {
  const family = familiesOf(medName).find((f) => f.allergy.test(allergy.name));
  if (family) return family;
  const med = normalise(medName);
  const words = normalise(allergy.name)
    .split(' ')
    .filter((w) => w.length >= 5 && !['allergy', 'drugs', 'medicine', 'tablets'].includes(w));
  return words.some((w) => med.includes(w)) ? 'name' : null;
}

/**
 * Warnings for a medicine called `name`, given the person's allergies and
 * their other medicines (the one being edited is left out by `editingId`).
 */
export function medicationWarnings(
  name: string,
  allergies: Allergy[],
  others: Medication[],
  now: Date,
  editingId?: string,
): SafetyWarning[] {
  const trimmed = name.trim();
  if (trimmed.length < 3) return [];
  const warnings: SafetyWarning[] = [];

  for (const allergy of allergies) {
    const clash = allergyClash(allergy, trimmed);
    if (!clash) continue;
    warnings.push({
      kind: 'allergy',
      message:
        clash === 'name'
          ? `There's a recorded allergy to ${allergy.name}. Check with the doctor before taking ${trimmed}.`
          : `${trimmed} is ${clash.label}, and there's a recorded allergy to ${allergy.name}. Check with the doctor first.`,
    });
  }

  const active = others.filter((m) => m.id !== editingId && isCurrentlyActive(m, now));
  const same = active.find((m) => normalise(m.name) === normalise(trimmed));
  if (same) {
    warnings.push({ kind: 'duplicate', message: `${same.name} is already in the active medicines.` });
  } else {
    for (const family of familiesOf(trimmed).filter((f) => f.noDoubling)) {
      const twin = active.find((m) => family.drugs.test(m.name));
      if (twin) {
        warnings.push({
          kind: 'same-family',
          message: `${twin.name} also contains ${family.label}. Taking both can mean too much — ask a pharmacist.`,
        });
      }
    }
  }
  return warnings;
}
