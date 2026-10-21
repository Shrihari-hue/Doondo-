/**
 * Trade tools — the config behind "trade-specific micro-apps".
 *
 * Each trade maps to a few small tools a worker in that trade actually
 * uses on the job: calculators (pure functions over a few number inputs)
 * and checklists. Labels are i18n keys (`trade_tools.<id>.*`). Adding a
 * trade or tool is config-only — the screen renders whatever is here.
 *
 * Calculators give rule-of-thumb estimates and say so; they are not a
 * substitute for site measurement or electrical codes.
 */

export interface ToolInput {
  key: string;
  unit?: string;
  default: number;
}

export interface CalcTool {
  kind: 'calc';
  id: string;
  inputs: ToolInput[];
  /** Returns [labelKey suffix, formatted value] rows. */
  compute: (v: Record<string, number>) => Array<[string, string]>;
}

export interface ChecklistTool {
  kind: 'checklist';
  id: string;
  items: string[];
}

export type TradeTool = CalcTool | ChecklistTool;

const rs = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const r1 = (n: number) => (Math.round(n * 10) / 10).toString();

const earnings: CalcTool = {
  kind: 'calc',
  id: 'earnings',
  inputs: [
    { key: 'days', default: 26 },
    { key: 'rate', unit: '₹', default: 700 },
    { key: 'ot_hours', default: 0 },
    { key: 'ot_rate', unit: '₹', default: 100 },
  ],
  compute: (v) => [
    ['base', rs(v.days! * v.rate!)],
    ['overtime', rs(v.ot_hours! * v.ot_rate!)],
    ['total', rs(v.days! * v.rate! + v.ot_hours! * v.ot_rate!)],
  ],
};

const WIRE: Array<[number, string]> = [[10, '1.5 mm²'], [16, '2.5 mm²'], [25, '4 mm²'], [32, '6 mm²'], [40, '10 mm²'], [63, '16 mm²']];
const MCB = [6, 10, 16, 20, 25, 32, 40, 63];
const electricLoad: CalcTool = {
  kind: 'calc',
  id: 'electric_load',
  inputs: [{ key: 'watts', unit: 'W', default: 2000 }, { key: 'volts', unit: 'V', default: 230 }],
  compute: (v) => {
    const amps = v.watts! / Math.max(1, v.volts!);
    const wire = WIRE.find(([a]) => amps * 1.25 <= a)?.[1] ?? '> 16 mm²';
    const mcb = MCB.find((m) => m >= amps * 1.25) ?? 63;
    return [['current', `${r1(amps)} A`], ['wire', wire], ['mcb', `${mcb} A`]];
  },
};

const paint: CalcTool = {
  kind: 'calc',
  id: 'paint',
  inputs: [
    { key: 'length', unit: 'ft', default: 12 },
    { key: 'width', unit: 'ft', default: 10 },
    { key: 'height', unit: 'ft', default: 10 },
    { key: 'openings', default: 2 },
    { key: 'coats', default: 2 },
  ],
  compute: (v) => {
    const wallSqft = 2 * (v.length! + v.width!) * v.height! - v.openings! * 20;
    const litres = (Math.max(0, wallSqft) * v.coats!) / 120; // ~120 sq ft / L / coat for emulsion
    return [['area', `${Math.round(Math.max(0, wallSqft))} sq ft`], ['paint', `${r1(litres)} L`], ['primer', `${r1(Math.max(0, wallSqft) / 110)} L`]];
  },
};

const bricks: CalcTool = {
  kind: 'calc',
  id: 'bricks',
  inputs: [{ key: 'length', unit: 'ft', default: 10 }, { key: 'height', unit: 'ft', default: 10 }, { key: 'thick_in', unit: 'in', default: 9 }],
  compute: (v) => {
    const m2 = (v.length! * v.height!) / 10.764;
    const perM2 = v.thick_in! >= 9 ? 100 : 50;
    const n = Math.ceil(m2 * perM2 * 1.05);
    const cementBags = Math.ceil(m2 * (v.thick_in! >= 9 ? 0.55 : 0.3));
    return [['area', `${r1(m2)} m²`], ['bricks', n.toLocaleString('en-IN')], ['cement', `${cementBags}`]];
  },
};

const tank: CalcTool = {
  kind: 'calc',
  id: 'tank',
  inputs: [{ key: 'length', unit: 'ft', default: 4 }, { key: 'width', unit: 'ft', default: 4 }, { key: 'height', unit: 'ft', default: 4 }],
  compute: (v) => [['litres', `${Math.round(v.length! * v.width! * v.height! * 28.317).toLocaleString('en-IN')} L`]],
};

const trip: CalcTool = {
  kind: 'calc',
  id: 'trip',
  inputs: [
    { key: 'km', default: 120 },
    { key: 'fare_km', unit: '₹', default: 14 },
    { key: 'fuel_price', unit: '₹', default: 102 },
    { key: 'mileage', unit: 'km/L', default: 15 },
  ],
  compute: (v) => {
    const gross = v.km! * v.fare_km!;
    const fuel = (v.km! / Math.max(1, v.mileage!)) * v.fuel_price!;
    return [['gross', rs(gross)], ['fuel', rs(fuel)], ['net', rs(gross - fuel)]];
  },
};

const recipe: CalcTool = {
  kind: 'calc',
  id: 'recipe',
  inputs: [{ key: 'base_servings', default: 4 }, { key: 'target_servings', default: 25 }, { key: 'qty', unit: 'g', default: 500 }],
  compute: (v) => {
    const mult = v.target_servings! / Math.max(1, v.base_servings!);
    return [['multiplier', `× ${r1(mult)}`], ['scaled', `${Math.round(v.qty! * mult).toLocaleString('en-IN')} g`]];
  },
};

const acTonnage: CalcTool = {
  kind: 'calc',
  id: 'ac_tonnage',
  inputs: [{ key: 'sqft', default: 150 }, { key: 'top_floor', default: 0 }, { key: 'people', default: 2 }],
  compute: (v) => {
    let tons = v.sqft! / 100 * 0.6;
    if (v.top_floor! > 0) tons *= 1.2;
    tons += Math.max(0, v.people! - 2) * 0.1;
    const pick = [0.75, 1, 1.5, 2, 2.5, 3].find((t) => t >= tons) ?? 3;
    return [['estimate', `${r1(tons)} ton`], ['recommend', `${pick} ton`]];
  },
};

const fabric: CalcTool = {
  kind: 'calc',
  id: 'fabric',
  inputs: [{ key: 'length_in', unit: 'in', default: 42 }, { key: 'sleeve_in', unit: 'in', default: 22 }, { key: 'width_in', unit: 'in', default: 44 }],
  compute: (v) => {
    // Kurta rule of thumb: (length + sleeve + 10" allowance) on 44" cloth.
    const inches = v.length! + v.sleeve_in! + 10;
    const factor = v.width_in! >= 54 ? 0.8 : 1;
    return [['metres', `${r1((inches * factor) / 39.37)} m`]];
  },
};

const ppe = (id: string, items: string[]): ChecklistTool => ({ kind: 'checklist', id, items });

/** Tools per trade slug. Every trade also gets `earnings`. */
export const TRADE_TOOLS: Record<string, TradeTool[]> = {
  electrician: [electricLoad, ppe('electric_safety', ['mains_off', 'tester', 'insulated_tools', 'dry_hands', 'earthing'])],
  painter: [paint, ppe('paint_prep', ['cover_floor', 'scrape', 'putty', 'primer', 'ventilation'])],
  mason: [bricks, ppe('site_safety', ['helmet', 'shoes', 'gloves', 'scaffold', 'water'])],
  helper: [bricks, ppe('site_safety', ['helmet', 'shoes', 'gloves', 'scaffold', 'water'])],
  plumber: [tank],
  welder: [ppe('weld_safety', ['mask', 'gloves', 'apron', 'no_flammables', 'extinguisher'])],
  ac_technician: [acTonnage, electricLoad],
  driver_light: [trip, ppe('vehicle_check', ['tyres', 'brakes', 'lights', 'documents', 'fuel'])],
  driver_heavy: [trip, ppe('vehicle_check', ['tyres', 'brakes', 'lights', 'documents', 'fuel'])],
  delivery: [trip],
  cook: [recipe, ppe('kitchen_hygiene', ['wash_hands', 'hair_cover', 'clean_board', 'fridge_temp', 'gas_off'])],
  baker: [recipe],
  kitchen_helper: [ppe('kitchen_hygiene', ['wash_hands', 'hair_cover', 'clean_board', 'fridge_temp', 'gas_off'])],
  tailor: [fabric],
  domestic_help: [ppe('home_tasks', ['sweep', 'mop', 'dishes', 'laundry', 'dusting'])],
  cleaner: [ppe('home_tasks', ['sweep', 'mop', 'dishes', 'laundry', 'dusting'])],
  security_guard: [ppe('guard_shift', ['register', 'round', 'cctv', 'lights', 'handover'])],
};

export function toolsForTrade(slug: string): TradeTool[] {
  return [...(TRADE_TOOLS[slug] ?? []), earnings];
}
