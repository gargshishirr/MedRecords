import type {
  ActivityItem,
  AppData,
  Appointment,
  Attachment,
  DoseLog,
  HealthRecord,
  LabResult,
  LabTestId,
  Medication,
  Profile,
  RecordType,
  VitalKind,
  VitalReading,
} from './types';
import { DEFAULT_AUTO_LOCK_MINUTES } from './types';
import { addDays, addMonths, daysBetween, parseISODate, startOfDay, toISODate } from './date';
import { RECORD_TYPE_META } from './recordMeta';
import { LAB_TESTS } from './ranges';
import { dosesForDay } from './meds';

/* All people, clinicians and facilities below are fictional. Phone numbers are non-dialable placeholders (+91 00000 …). */

const FACILITY = {
  lotus: 'Lotus Family Clinic, Baner',
  sunrise: 'Sunrise Diagnostics, Aundh',
  ashoka: 'Ashoka Heart & Diabetes Centre',
  nilgiri: 'Nilgiri Multispeciality Hospital',
  kaveri: 'Kaveri Imaging Centre',
  pearl: 'Pearl Dental Studio',
  drishti: 'Drishti Eye Institute',
  littleSteps: "Little Steps Children's Clinic",
  sanjeevani: 'Sanjeevani Pharmacy',
} as const;

const DOCTOR = {
  rao: 'Dr. Ananya Rao',
  menon: 'Dr. Vikram Menon',
  desai: 'Dr. Arjun Desai',
  iyer: 'Dr. Kavya Iyer',
  bhat: 'Dr. Rohan Bhat',
  kulkarni: 'Dr. Neha Kulkarni',
  siddiqui: 'Dr. Farah Siddiqui',
  sen: 'Dr. Ishaan Sen',
} as const;

/** Small deterministic PRNG so the demo looks the same on every first load. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable pseudo-random number in [0, 1) derived from a string key (FNV-1a + mulberry32 step). */
function hashUnit(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return mulberry32(h)();
}

interface RecordSpec {
  /** Months before today. */
  m: number;
  /** Extra day offset (can be negative). */
  d?: number;
  type: RecordType;
  title: string;
  doctor?: string;
  facility?: string;
  summary?: string;
  notes?: string;
  cost?: number;
  files?: string[];
  labs?: Partial<Record<LabTestId, number>>;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);

function defaultFiles(spec: RecordSpec, date: string): string[] {
  const ym = date.slice(0, 7);
  const base = slug(spec.title);
  switch (spec.type) {
    case 'lab':
      return [`${base}-${ym}.pdf`];
    case 'imaging':
      return [`${base}-report.pdf`, `${base}-images.zip`];
    case 'visit':
      return [`consultation-notes-${ym}.pdf`];
    case 'prescription':
      return [`prescription-${ym}.jpg`];
    case 'vaccination':
      return [`vaccination-certificate-${ym}.pdf`];
    case 'document':
      return [`${base}.pdf`];
  }
}

function formatLabSummary(labs: Partial<Record<LabTestId, number>>): string {
  return (Object.entries(labs) as [LabTestId, number][])
    .map(([id, v]) => `${LAB_TESTS[id].short} ${v.toFixed(LAB_TESTS[id].decimals)} ${LAB_TESTS[id].unit}`)
    .join(' · ');
}

export function createSeedData(now: Date = new Date()): AppData {
  const rand = mulberry32(20261114);
  const noise = (amp: number) => ((rand() + rand() + rand() - 1.5) / 1.5) * amp;
  const round = (n: number, decimals = 0) => Number(n.toFixed(decimals));
  const today = startOfDay(now);
  const todayISO = toISODate(today);
  const clampPast = (d: Date) => (d > today ? today : d);
  const ago = (months: number, days = 0) => toISODate(clampPast(addDays(addMonths(today, -months), days)));
  const yearsAgo = (years: number, days = 0) => toISODate(addDays(addMonths(today, -12 * years), -days));
  const inDays = (days: number, time: string) => `${toISODate(addDays(today, days))}T${time}`;

  /* ---------------------------------------------------------------- */
  /* Profiles                                                          */
  /* ---------------------------------------------------------------- */
  const profiles: Profile[] = [
    {
      id: 'riya',
      name: 'Riya Kapoor',
      relation: 'Self',
      dob: yearsAgo(29, 143),
      sex: 'Female',
      bloodGroup: 'O+',
      heightCm: 163,
      hue: 174,
      allergies: [
        { name: 'Sulfa drugs', severity: 'moderate', reaction: 'Itchy rash' },
        { name: 'Dust mites', severity: 'mild', reaction: 'Sneezing, watery eyes' },
      ],
      conditions: [
        { name: 'Allergic rhinitis', since: yearsAgo(6), status: 'active' },
        { name: 'Iron-deficiency anaemia', since: ago(16), status: 'resolved' },
        { name: 'Vitamin D deficiency', since: ago(16), status: 'managed' },
      ],
      emergencyContacts: [
        { name: 'Arjun Kapoor', relation: 'Husband', phone: '+91 00000 01234' },
        { name: 'Meera Kapoor', relation: 'Mother', phone: '+91 00000 04321' },
      ],
      primaryDoctor: { name: DOCTOR.rao, specialty: 'General Physician', facility: FACILITY.lotus, phone: '+91 00000 10001' },
    },
    {
      id: 'meera',
      name: 'Meera Kapoor',
      relation: 'Mother',
      dob: yearsAgo(58, 61),
      sex: 'Female',
      bloodGroup: 'B+',
      heightCm: 156,
      hue: 22,
      allergies: [
        { name: 'Penicillin', severity: 'severe', reaction: 'Hives, facial swelling' },
        { name: 'Shellfish', severity: 'moderate', reaction: 'Hives' },
      ],
      conditions: [
        { name: 'Type 2 diabetes', since: yearsAgo(6), status: 'managed' },
        { name: 'Hypertension', since: yearsAgo(4), status: 'managed' },
        { name: 'Hypothyroidism', since: ago(14), status: 'managed' },
      ],
      emergencyContacts: [
        { name: 'Riya Kapoor', relation: 'Daughter', phone: '+91 00000 01111' },
        { name: 'Sanjay Kapoor', relation: 'Husband', phone: '+91 00000 02222' },
      ],
      primaryDoctor: {
        name: DOCTOR.menon,
        specialty: 'Endocrinologist',
        facility: FACILITY.ashoka,
        phone: '+91 00000 20002',
      },
    },
    {
      id: 'kabir',
      name: 'Kabir Kapoor',
      relation: 'Son',
      dob: yearsAgo(6, 97),
      sex: 'Male',
      bloodGroup: 'O+',
      heightCm: 116,
      hue: 232,
      allergies: [{ name: 'Peanuts', severity: 'severe', reaction: 'Hives, wheezing' }],
      conditions: [{ name: 'Mild eczema', since: yearsAgo(3), status: 'managed' }],
      emergencyContacts: [
        { name: 'Riya Kapoor', relation: 'Mother', phone: '+91 00000 01111' },
        { name: 'Arjun Kapoor', relation: 'Father', phone: '+91 00000 01234' },
      ],
      primaryDoctor: {
        name: DOCTOR.siddiqui,
        specialty: 'Paediatrician',
        facility: FACILITY.littleSteps,
        phone: '+91 00000 30003',
      },
    },
  ];

  /* ---------------------------------------------------------------- */
  /* Records + lab results                                             */
  /* ---------------------------------------------------------------- */
  const specs: Record<string, RecordSpec[]> = {
    riya: [
      { m: 16, d: -4, type: 'visit', title: 'Fatigue & breathlessness consult', doctor: DOCTOR.rao, facility: FACILITY.lotus, summary: 'Tiredness for 2 months, pale conjunctiva. Ordered CBC, iron studies, vitamin D.', cost: 800 },
      { m: 16, d: -2, type: 'lab', title: 'CBC, iron studies & vitamin D', doctor: DOCTOR.rao, facility: FACILITY.sunrise, cost: 2150, labs: { hb: 10.6, vitd: 14, tsh: 2.4 }, notes: 'Serum ferritin 9 ng/mL (low).' },
      { m: 16, type: 'prescription', title: 'Iron & vitamin D course', doctor: DOCTOR.rao, facility: FACILITY.sanjeevani, summary: 'Ferrous ascorbate 100 mg daily · Cholecalciferol 60,000 IU weekly for 8 weeks.', cost: 640 },
      { m: 14, d: 6, type: 'document', title: 'Employer health insurance e-card', facility: 'Suraksha Health Insurance (fictional)', summary: 'Family floater policy covering Riya, Arjun and Kabir. Valid for 12 months.', files: ['insurance-ecard.pdf'] },
      { m: 13, d: 3, type: 'vaccination', title: 'Influenza vaccine (annual)', doctor: DOCTOR.rao, facility: FACILITY.lotus, summary: 'Quadrivalent influenza vaccine, left deltoid. No reaction.', cost: 1450 },
      { m: 12, d: -6, type: 'lab', title: 'CBC & vitamin D follow-up', doctor: DOCTOR.rao, facility: FACILITY.sunrise, cost: 1350, labs: { hb: 11.4, vitd: 22 } },
      { m: 12, d: -3, type: 'visit', title: 'Anaemia follow-up', doctor: DOCTOR.rao, facility: FACILITY.lotus, summary: 'Haemoglobin improving. Continue iron for 3 more months; switch to daily vitamin D3 + calcium.', cost: 800 },
      { m: 11, d: 8, type: 'vaccination', title: 'Td booster', doctor: DOCTOR.rao, facility: FACILITY.lotus, summary: 'Tetanus–diphtheria booster (10-yearly).', cost: 450 },
      { m: 9, d: -10, type: 'visit', title: 'Annual gynaecology check-up', doctor: DOCTOR.iyer, facility: FACILITY.nilgiri, summary: 'Routine review. Pap smear normal. Advised pelvic ultrasound for mild cramps.', cost: 1200 },
      { m: 9, d: -7, type: 'imaging', title: 'Pelvic ultrasound', doctor: DOCTOR.sen, facility: FACILITY.kaveri, summary: 'Normal study. No abnormality detected.', cost: 1900 },
      { m: 7, d: -2, type: 'lab', title: 'CBC & vitamin D review', doctor: DOCTOR.rao, facility: FACILITY.sunrise, cost: 1350, labs: { hb: 12.3, vitd: 31 } },
      { m: 6, d: 4, type: 'visit', title: 'Dental cleaning & check-up', doctor: DOCTOR.kulkarni, facility: FACILITY.pearl, summary: 'Scaling and polishing. One small cavity on lower left molar to watch.', cost: 1800 },
      { m: 6, d: 4, type: 'imaging', title: 'Dental X-ray (OPG)', doctor: DOCTOR.kulkarni, facility: FACILITY.pearl, summary: 'Panoramic X-ray. Wisdom teeth erupted normally.', cost: 650, files: ['opg-xray.jpg'] },
      { m: 4, d: -8, type: 'visit', title: 'Eye examination', doctor: DOCTOR.bhat, facility: FACILITY.drishti, summary: 'Mild myopia, stable. Spectacle power −1.25 D both eyes.', cost: 700 },
      { m: 1, d: -6, type: 'lab', title: 'Annual health check', doctor: DOCTOR.rao, facility: FACILITY.sunrise, cost: 3200, labs: { hb: 12.6, vitd: 36, tsh: 2.1, fbs: 86, ldl: 92, hba1c: 5.2 } },
      { m: 1, d: -4, type: 'document', title: 'Annual health check summary', doctor: DOCTOR.rao, facility: FACILITY.lotus, summary: 'All parameters within normal limits. Continue vitamin D3 + calcium.', files: ['health-check-summary.pdf'] },
      { m: 1, d: -1, type: 'vaccination', title: 'Influenza vaccine (annual)', doctor: DOCTOR.rao, facility: FACILITY.lotus, summary: 'Quadrivalent influenza vaccine, left deltoid.', cost: 1450 },
      { m: 0, d: -21, type: 'visit', title: 'Seasonal allergy flare-up', doctor: DOCTOR.rao, facility: FACILITY.lotus, summary: 'Sneezing and congestion with the change in weather. Started cetirizine at night.', cost: 800 },
      { m: 0, d: -21, type: 'prescription', title: 'Cetirizine 10 mg', doctor: DOCTOR.rao, facility: FACILITY.sanjeevani, summary: 'Cetirizine 10 mg at bedtime for 30 days.', cost: 95 },
    ],
    meera: [
      { m: 17, d: -5, type: 'lab', title: 'Diabetes & lipid panel', doctor: DOCTOR.menon, facility: FACILITY.sunrise, cost: 2450, labs: { hba1c: 7.9, fbs: 156, ldl: 148, creatinine: 0.92 } },
      { m: 17, d: -2, type: 'visit', title: 'Diabetes review', doctor: DOCTOR.menon, facility: FACILITY.ashoka, summary: 'HbA1c above target. Added glimepiride 1 mg; diet counselling booked.', cost: 1200 },
      { m: 17, d: -2, type: 'prescription', title: 'Metformin SR + glimepiride', doctor: DOCTOR.menon, facility: FACILITY.sanjeevani, summary: 'Metformin SR 500 mg twice daily · Glimepiride 1 mg before breakfast.', cost: 820 },
      { m: 15, d: 3, type: 'imaging', title: 'Ultrasound abdomen', doctor: DOCTOR.sen, facility: FACILITY.kaveri, summary: 'Grade I fatty liver. Kidneys normal in size and echotexture.', cost: 2200 },
      { m: 14, d: -6, type: 'lab', title: 'Quarterly diabetes panel + thyroid', doctor: DOCTOR.menon, facility: FACILITY.sunrise, cost: 2900, labs: { hba1c: 7.6, fbs: 148, ldl: 156, tsh: 6.8, vitd: 18 } },
      { m: 14, d: -3, type: 'visit', title: 'Diabetes & thyroid review', doctor: DOCTOR.menon, facility: FACILITY.ashoka, summary: 'TSH raised — started levothyroxine 50 mcg. Vitamin D low; supplement advised.', cost: 1200 },
      { m: 13, d: 2, type: 'vaccination', title: 'Influenza vaccine (annual)', doctor: DOCTOR.menon, facility: FACILITY.ashoka, summary: 'Quadrivalent influenza vaccine.', cost: 1450 },
      { m: 12, d: 5, type: 'visit', title: 'Diabetic eye screening', doctor: DOCTOR.bhat, facility: FACILITY.drishti, summary: 'Dilated fundus exam — no diabetic retinopathy. Repeat in 12 months.', cost: 900 },
      { m: 11, d: -4, type: 'lab', title: 'Quarterly diabetes panel', doctor: DOCTOR.menon, facility: FACILITY.sunrise, cost: 2600, labs: { hba1c: 7.2, fbs: 138, ldl: 162, tsh: 4.6, hb: 12.4, creatinine: 0.98 } },
      { m: 11, d: -1, type: 'visit', title: 'Diabetes review', doctor: DOCTOR.menon, facility: FACILITY.ashoka, summary: 'LDL high — started atorvastatin 10 mg at night. Sugar control improving.', cost: 1200 },
      { m: 10, d: 2, type: 'visit', title: 'Cardiology consult — ankle swelling', doctor: DOCTOR.desai, facility: FACILITY.ashoka, summary: 'Ankle oedema likely from amlodipine. Switched to telmisartan 40 mg.', cost: 1500 },
      { m: 10, d: 2, type: 'imaging', title: '2D echocardiogram', doctor: DOCTOR.desai, facility: FACILITY.ashoka, summary: 'Normal LV function, EF 62%. Mild diastolic dysfunction (grade I).', cost: 3500 },
      { m: 10, d: 3, type: 'prescription', title: 'Telmisartan 40 mg (replaces amlodipine)', doctor: DOCTOR.desai, facility: FACILITY.sanjeevani, summary: 'Stop amlodipine 5 mg. Start telmisartan 40 mg every morning.', cost: 310 },
      { m: 9, d: 6, type: 'vaccination', title: 'Pneumococcal vaccine (PCV)', doctor: DOCTOR.menon, facility: FACILITY.ashoka, summary: 'Recommended for adults with diabetes. Single dose.', cost: 2100 },
      { m: 8, d: -5, type: 'lab', title: 'Quarterly diabetes panel + vitamin D', doctor: DOCTOR.menon, facility: FACILITY.sunrise, cost: 2900, labs: { hba1c: 6.9, fbs: 129, ldl: 118, tsh: 3.4, vitd: 27 } },
      { m: 8, d: -2, type: 'visit', title: 'Diabetes review', doctor: DOCTOR.menon, facility: FACILITY.ashoka, summary: 'Good progress. Stopped glimepiride; continue metformin SR. Walk 30 min daily.', cost: 1200 },
      { m: 6, d: 1, type: 'document', title: 'Health insurance renewal', facility: 'Suraksha Health Insurance (fictional)', summary: 'Senior citizen policy renewed. Pre-existing diabetes cover active.', files: ['policy-schedule.pdf', 'renewal-receipt.pdf'] },
      { m: 5, d: -6, type: 'lab', title: 'Quarterly diabetes panel', doctor: DOCTOR.menon, facility: FACILITY.sunrise, cost: 2450, labs: { hba1c: 7.0, fbs: 132, ldl: 104, tsh: 2.8, creatinine: 1.02 } },
      { m: 5, d: -3, type: 'visit', title: 'Diabetes review', doctor: DOCTOR.menon, facility: FACILITY.ashoka, summary: 'Stable. Festive-season dip in control discussed. No medication change.', cost: 1200 },
      { m: 3, d: 2, type: 'visit', title: 'Knee pain consult', doctor: DOCTOR.rao, facility: FACILITY.lotus, summary: 'Early osteoarthritis, right knee. Physiotherapy and weight loss advised.', cost: 800 },
      { m: 3, d: 4, type: 'imaging', title: 'X-ray right knee', doctor: DOCTOR.sen, facility: FACILITY.kaveri, summary: 'Mild joint space narrowing, medial compartment.', cost: 750, files: ['knee-xray-report.pdf', 'knee-xray.jpg'] },
      { m: 2, d: -5, type: 'lab', title: 'Quarterly diabetes panel + vitamin D', doctor: DOCTOR.menon, facility: FACILITY.sunrise, cost: 3100, labs: { hba1c: 6.7, fbs: 121, ldl: 96, tsh: 2.6, vitd: 33, hb: 12.8, creatinine: 0.99 } },
      { m: 2, d: -2, type: 'visit', title: 'Diabetes review', doctor: DOCTOR.menon, facility: FACILITY.ashoka, summary: 'Best HbA1c in 18 months. LDL now at target. Continue current regimen.', cost: 1200 },
      { m: 2, d: -2, type: 'prescription', title: 'Repeat prescription — 3 months', doctor: DOCTOR.menon, facility: FACILITY.sanjeevani, summary: 'Metformin SR 500 mg · Levothyroxine 50 mcg · Atorvastatin 10 mg.', cost: 1180 },
      { m: 1, d: 2, type: 'vaccination', title: 'Influenza vaccine (annual)', doctor: DOCTOR.menon, facility: FACILITY.ashoka, summary: 'Quadrivalent influenza vaccine.', cost: 1450 },
    ],
    kabir: [
      { m: 17, d: 4, type: 'vaccination', title: 'Typhoid conjugate vaccine (TCV)', doctor: DOCTOR.siddiqui, facility: FACILITY.littleSteps, summary: 'Single dose, right thigh. Mild soreness for a day.', cost: 1850 },
      { m: 15, d: -3, type: 'visit', title: 'Well-child check-up', doctor: DOCTOR.siddiqui, facility: FACILITY.littleSteps, summary: 'Growth on the 50th centile. Development age-appropriate.', cost: 900 },
      { m: 13, d: 6, type: 'vaccination', title: 'Influenza vaccine (paediatric)', doctor: DOCTOR.siddiqui, facility: FACILITY.littleSteps, summary: 'Annual flu shot.', cost: 1350 },
      { m: 12, d: -2, type: 'vaccination', title: 'DTaP booster 2 + IPV', doctor: DOCTOR.siddiqui, facility: FACILITY.littleSteps, summary: 'School-entry booster doses. Low-grade fever for 1 day.', cost: 2200 },
      { m: 11, d: 3, type: 'vaccination', title: 'MMR — 3rd dose', doctor: DOCTOR.siddiqui, facility: FACILITY.littleSteps, summary: 'Measles, mumps, rubella booster.', cost: 750 },
      { m: 9, d: -1, type: 'visit', title: 'Well-child check-up', doctor: DOCTOR.siddiqui, facility: FACILITY.littleSteps, summary: 'Looks a little pale. Ordered haemoglobin and vitamin D.', cost: 900 },
      { m: 9, d: 1, type: 'lab', title: 'Haemoglobin & vitamin D', doctor: DOCTOR.siddiqui, facility: FACILITY.sunrise, cost: 1100, labs: { hb: 11.2, vitd: 22 } },
      { m: 7, d: 5, type: 'visit', title: 'First dental visit', doctor: DOCTOR.kulkarni, facility: FACILITY.pearl, summary: 'No cavities. Fluoride varnish applied.', cost: 900 },
      { m: 6, d: -4, type: 'document', title: 'School health form', doctor: DOCTOR.siddiqui, facility: FACILITY.littleSteps, summary: 'Signed fitness certificate and vaccination record for school admission.', files: ['school-health-form.pdf'] },
      { m: 5, d: -2, type: 'visit', title: 'Ear pain & fever', doctor: DOCTOR.siddiqui, facility: FACILITY.littleSteps, summary: 'Acute otitis media, left ear. 7-day antibiotic course.', cost: 900 },
      { m: 5, d: -2, type: 'prescription', title: 'Azithromycin syrup', doctor: DOCTOR.siddiqui, facility: FACILITY.sanjeevani, summary: 'Azithromycin 200 mg/5 mL — 5 mL once daily for 3 days. Paracetamol as needed.', cost: 240 },
      { m: 3, d: -6, type: 'visit', title: 'Well-child check-up', doctor: DOCTOR.siddiqui, facility: FACILITY.littleSteps, summary: 'Height 116 cm, weight 20.4 kg. Eczema well controlled with moisturiser.', cost: 900 },
      { m: 3, d: -5, type: 'lab', title: 'Haemoglobin & vitamin D follow-up', doctor: DOCTOR.siddiqui, facility: FACILITY.sunrise, cost: 1100, labs: { hb: 12.0, vitd: 31 } },
      { m: 3, d: 2, type: 'vaccination', title: 'Influenza vaccine (paediatric)', doctor: DOCTOR.siddiqui, facility: FACILITY.littleSteps, summary: 'Annual flu shot.', cost: 1350 },
      { m: 2, d: 1, type: 'prescription', title: 'Multivitamin syrup', doctor: DOCTOR.siddiqui, facility: FACILITY.sanjeevani, summary: 'Multivitamin with iron, 5 mL every morning for 3 months.', cost: 210 },
    ],
  };

  const records: HealthRecord[] = [];
  const labs: LabResult[] = [];
  for (const [profileId, list] of Object.entries(specs)) {
    list.forEach((spec, i) => {
      const date = ago(spec.m, spec.d ?? 0);
      const id = `rec-${profileId}-${String(i + 1).padStart(2, '0')}`;
      const files = spec.files ?? defaultFiles(spec, date);
      const attachments: Attachment[] = files.map((name) => ({
        name,
        sizeKb: Math.round(120 + rand() * (name.endsWith('.zip') ? 9000 : 640)),
      }));
      records.push({
        id,
        profileId,
        type: spec.type,
        title: spec.title,
        date,
        doctor: spec.doctor,
        facility: spec.facility,
        summary: spec.summary ?? (spec.labs ? formatLabSummary(spec.labs) : undefined),
        notes: spec.notes,
        cost: spec.cost,
        attachments,
        createdAt: `${toISODate(clampPast(addDays(parseISODate(date), 1)))}T19:${String(10 + i).padStart(2, '0')}:00`,
      });
      if (spec.labs) {
        for (const [testId, value] of Object.entries(spec.labs) as [LabTestId, number][]) {
          labs.push({ id: `lab-${id}-${testId}`, profileId, testId, date, value, recordId: id });
        }
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /* Vitals                                                            */
  /* ---------------------------------------------------------------- */
  const vitals: VitalReading[] = [];
  const start = addMonths(today, -18);
  const totalDays = daysBetween(start, today);
  let vitalSeq = 0;
  const pushVital = (profileId: string, kind: VitalKind, dayIndex: number, value: number, value2?: number) => {
    vitalSeq += 1;
    vitals.push({
      id: `vit-${profileId}-${kind}-${vitalSeq}`,
      profileId,
      kind,
      date: toISODate(addDays(start, dayIndex)),
      value,
      value2,
    });
  };
  /** Linear interpolation over the 18-month window (t = 0 → oldest, 1 → today). */
  const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

  for (let day = 0; day <= totalDays; day++) {
    const t = day / totalDays;
    // Meera: home BP monitor and glucometer, improving after medication changes.
    if (day % 4 === 0 || day === totalDays) {
      const bpT = Math.min(1, t * 1.25);
      pushVital('meera', 'bp', day, round(lerp(148, 130, bpT) + noise(6)), round(lerp(93, 83, bpT) + noise(4)));
    }
    if (day % 3 === 0 || day === totalDays - 1) {
      pushVital('meera', 'glucose', day, round(lerp(158, 116, t) + noise(9)));
    }
    if (day % 7 === 2) {
      pushVital('meera', 'hr', day, round(78 + noise(5)));
      pushVital('meera', 'spo2', day, round(97 + noise(1.2)));
    }
    if (day % 14 === 5 || day === totalDays - 2) {
      pushVital('meera', 'weight', day, round(lerp(72.6, 68.2, t) + noise(0.5), 1));
    }

    // Riya: smartwatch heart rate, monthly BP at the pharmacy kiosk, fortnightly weigh-ins.
    if (day % 30 === 11 || day === totalDays - 3) {
      pushVital('riya', 'bp', day, round(112 + noise(5)), round(72 + noise(4)));
    }
    if (day % 6 === 1 || day === totalDays) {
      pushVital('riya', 'hr', day, round(lerp(76, 68, t) + noise(4)));
    }
    if (day % 14 === 3 || day === totalDays - 1) {
      pushVital('riya', 'weight', day, round(lerp(56.4, 57.8, t) + noise(0.5), 1));
    }
    if (day % 45 === 20) {
      pushVital('riya', 'glucose', day, round(88 + noise(5)));
    }
    if (day % 20 === 9 || day === totalDays) {
      pushVital('riya', 'spo2', day, round(98 + noise(0.9)));
    }

    // Kabir: measured at clinic visits and monthly at home. No glucose readings.
    if (day % 30 === 14 || day === totalDays - 4) {
      pushVital('kabir', 'weight', day, round(lerp(18.4, 20.9, t) + noise(0.2), 1));
    }
    if (day % 60 === 25 || day === totalDays - 4) {
      pushVital('kabir', 'bp', day, round(98 + noise(4)), round(62 + noise(3)));
      pushVital('kabir', 'hr', day, round(96 + noise(6)));
      pushVital('kabir', 'spo2', day, round(99 + noise(0.6)));
    }
  }
  for (const v of vitals) {
    if (v.kind === 'spo2') v.value = Math.min(100, v.value);
  }

  /* ---------------------------------------------------------------- */
  /* Medications                                                       */
  /* ---------------------------------------------------------------- */
  const refillAgo = (days: number) => toISODate(addDays(today, -days));
  const medications: Medication[] = [
    // Meera — active
    { id: 'med-meera-metformin', profileId: 'meera', name: 'Metformin SR', strength: '500 mg', form: 'tablet', dose: '1 tablet', frequency: 'Twice daily, after meals', schedule: ['morning', 'night'], purpose: 'Type 2 diabetes', instructions: 'Take with breakfast and dinner.', prescriber: DOCTOR.menon, startDate: yearsAgo(6), refillDate: refillAgo(26), supplyDays: 30 },
    { id: 'med-meera-levothyroxine', profileId: 'meera', name: 'Levothyroxine', strength: '50 mcg', form: 'tablet', dose: '1 tablet', frequency: 'Once daily, empty stomach', schedule: ['morning'], purpose: 'Hypothyroidism', instructions: '30 minutes before breakfast, with water only.', prescriber: DOCTOR.menon, startDate: ago(14, -3), refillDate: refillAgo(29), supplyDays: 30 },
    { id: 'med-meera-telmisartan', profileId: 'meera', name: 'Telmisartan', strength: '40 mg', form: 'tablet', dose: '1 tablet', frequency: 'Once daily', schedule: ['morning'], purpose: 'Blood pressure', prescriber: DOCTOR.desai, startDate: ago(10, 3), refillDate: refillAgo(9), supplyDays: 30 },
    { id: 'med-meera-atorvastatin', profileId: 'meera', name: 'Atorvastatin', strength: '10 mg', form: 'tablet', dose: '1 tablet', frequency: 'Once daily, at bedtime', schedule: ['night'], purpose: 'Cholesterol', prescriber: DOCTOR.menon, startDate: ago(11, -1), refillDate: refillAgo(12), supplyDays: 30 },
    // Meera — past
    { id: 'med-meera-glimepiride', profileId: 'meera', name: 'Glimepiride', strength: '1 mg', form: 'tablet', dose: '1 tablet', frequency: 'Once daily, before breakfast', schedule: ['morning'], purpose: 'Type 2 diabetes', prescriber: DOCTOR.menon, startDate: ago(17, -2), endDate: ago(8, -2), refillDate: ago(9), supplyDays: 30 },
    { id: 'med-meera-amlodipine', profileId: 'meera', name: 'Amlodipine', strength: '5 mg', form: 'tablet', dose: '1 tablet', frequency: 'Once daily', schedule: ['morning'], purpose: 'Blood pressure', instructions: 'Stopped due to ankle swelling.', prescriber: DOCTOR.desai, startDate: yearsAgo(4), endDate: ago(10, 2), refillDate: ago(11), supplyDays: 30 },
    { id: 'med-meera-vitd', profileId: 'meera', name: 'Cholecalciferol', strength: '60,000 IU', form: 'sachet', dose: '1 sachet', frequency: 'Once a week for 8 weeks', schedule: ['morning'], purpose: 'Vitamin D deficiency', prescriber: DOCTOR.menon, startDate: ago(14, -3), endDate: ago(12, -3), refillDate: ago(14, -3), supplyDays: 56 },
    // Riya — active
    { id: 'med-riya-calcium', profileId: 'riya', name: 'Calcium + Vitamin D3', strength: '500 mg / 1,000 IU', form: 'tablet', dose: '1 tablet', frequency: 'Once daily, after lunch', schedule: ['afternoon'], purpose: 'Vitamin D deficiency', prescriber: DOCTOR.rao, startDate: ago(12, -3), refillDate: refillAgo(25), supplyDays: 30 },
    { id: 'med-riya-cetirizine', profileId: 'riya', name: 'Cetirizine', strength: '10 mg', form: 'tablet', dose: '1 tablet', frequency: 'Once daily, at bedtime', schedule: ['night'], purpose: 'Allergic rhinitis', instructions: 'May cause drowsiness.', prescriber: DOCTOR.rao, startDate: ago(0, -21), refillDate: ago(0, -21), supplyDays: 30 },
    // Riya — past
    { id: 'med-riya-iron', profileId: 'riya', name: 'Ferrous ascorbate', strength: '100 mg', form: 'tablet', dose: '1 tablet', frequency: 'Once daily, before breakfast', schedule: ['morning'], purpose: 'Iron-deficiency anaemia', prescriber: DOCTOR.rao, startDate: ago(16), endDate: ago(9), refillDate: ago(10), supplyDays: 30 },
    { id: 'med-riya-vitd', profileId: 'riya', name: 'Cholecalciferol', strength: '60,000 IU', form: 'sachet', dose: '1 sachet', frequency: 'Once a week for 8 weeks', schedule: ['morning'], purpose: 'Vitamin D deficiency', prescriber: DOCTOR.rao, startDate: ago(16), endDate: ago(14), refillDate: ago(16), supplyDays: 56 },
    // Kabir — active
    { id: 'med-kabir-multivitamin', profileId: 'kabir', name: 'Multivitamin with iron', strength: '5 mL', form: 'syrup', dose: '5 mL', frequency: 'Once daily, after breakfast', schedule: ['morning'], purpose: 'Low iron & vitamin D', prescriber: DOCTOR.siddiqui, startDate: ago(2, 1), refillDate: refillAgo(36), supplyDays: 40 },
    { id: 'med-kabir-cetirizine', profileId: 'kabir', name: 'Cetirizine syrup', strength: '5 mg / 5 mL', form: 'syrup', dose: '2.5 mL', frequency: 'Once daily, at bedtime', schedule: ['night'], purpose: 'Eczema itch', instructions: 'Use the dosing syringe. May cause mild drowsiness.', prescriber: DOCTOR.siddiqui, startDate: ago(3, -6), refillDate: refillAgo(18), supplyDays: 45 },
    // Kabir — past
    { id: 'med-kabir-azithro', profileId: 'kabir', name: 'Azithromycin syrup', strength: '200 mg / 5 mL', form: 'syrup', dose: '5 mL', frequency: 'Once daily for 3 days', schedule: ['morning'], purpose: 'Ear infection', prescriber: DOCTOR.siddiqui, startDate: ago(5, -2), endDate: ago(5, 0), refillDate: ago(5, -2), supplyDays: 3 },
  ];

  /* ---------------------------------------------------------------- */
  /* Dose log — ~30 days of history                                    */
  /* ---------------------------------------------------------------- */
  const adherence: Record<string, number> = { meera: 0.9, riya: 0.84, kabir: 0.93 };
  const doseLog: DoseLog = {};
  for (const p of profiles) {
    const meds = medications.filter((m) => m.profileId === p.id);
    const log: Record<string, string[]> = {};
    for (let i = 30; i >= 1; i--) {
      const date = toISODate(addDays(today, -i));
      const taken = dosesForDay(meds, date)
        .filter((d) => hashUnit(`${date}|${d.key}`) < (adherence[p.id] ?? 0.9))
        .map((d) => d.key);
      if (taken.length) log[date] = taken;
    }
    if (now.getHours() >= 10) {
      const morning = dosesForDay(meds, todayISO)
        .filter((d) => d.slot === 'morning')
        .map((d) => d.key);
      if (morning.length) log[todayISO] = morning;
    }
    doseLog[p.id] = log;
  }

  /* ---------------------------------------------------------------- */
  /* Appointments (upcoming)                                           */
  /* ---------------------------------------------------------------- */
  const appointments: Appointment[] = [
    { id: 'apt-meera-1', profileId: 'meera', at: inDays(5, '10:30'), doctor: DOCTOR.menon, specialty: 'Endocrinology', facility: FACILITY.ashoka, reason: 'Quarterly diabetes review — bring glucose log' },
    { id: 'apt-meera-2', profileId: 'meera', at: inDays(19, '16:00'), doctor: DOCTOR.bhat, specialty: 'Ophthalmology', facility: FACILITY.drishti, reason: 'Annual diabetic eye screening (dilated exam)' },
    { id: 'apt-meera-3', profileId: 'meera', at: inDays(41, '09:15'), doctor: DOCTOR.desai, specialty: 'Cardiology', facility: FACILITY.ashoka, reason: 'Blood pressure follow-up' },
    { id: 'apt-riya-1', profileId: 'riya', at: inDays(12, '11:15'), doctor: DOCTOR.kulkarni, specialty: 'Dentistry', facility: FACILITY.pearl, reason: 'Six-monthly cleaning; review lower-left molar' },
    { id: 'apt-riya-2', profileId: 'riya', at: inDays(34, '17:45'), doctor: DOCTOR.iyer, specialty: 'Gynaecology', facility: FACILITY.nilgiri, reason: 'Annual check-up' },
    { id: 'apt-kabir-1', profileId: 'kabir', at: inDays(9, '17:30'), doctor: DOCTOR.siddiqui, specialty: 'Paediatrics', facility: FACILITY.littleSteps, reason: 'Typhoid conjugate booster' },
  ];

  /* ---------------------------------------------------------------- */
  /* Activity                                                          */
  /* ---------------------------------------------------------------- */
  const activity: ActivityItem[] = records.map((r) => ({
    id: `act-${r.id}`,
    profileId: r.profileId,
    at: r.createdAt,
    kind: 'record',
    text: `Added ${RECORD_TYPE_META[r.type].noun}: ${r.title}`,
  }));
  for (const med of medications.filter((m) => !m.endDate)) {
    activity.push({
      id: `act-refill-${med.id}`,
      profileId: med.profileId,
      at: `${med.refillDate}T18:30:00`,
      kind: 'refill',
      text: `Refilled ${med.name} ${med.strength}`,
    });
  }

  return {
    schemaVersion: 1,
    demo: true,
    seededAt: now.toISOString(),
    activeProfileId: 'riya',
    profiles,
    records,
    labs,
    vitals,
    medications,
    appointments,
    doseLog,
    activity,
    settings: { autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES },
  };
}
