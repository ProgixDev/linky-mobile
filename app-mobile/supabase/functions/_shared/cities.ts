// Single source of truth (server side) for the Guinea cities allowlist used
// by address validation. Mirrors the client GUINEA_CITIES list in
// src/components/onboarding/CityMapPicker.tsx — 38 prefecture capitals +
// Conakry communes + the rollup "Conakry" entry. Keep these two lists in
// sync ; the client picker is what gives the user the value, the server
// validates against the same names so a tampered client can't insert junk.
const GUINEA_CITY_LIST: ReadonlyArray<string> = [
  'Conakry', 'Kaloum', 'Dixinn', 'Matam', 'Ratoma', 'Matoto',
  'Boké', 'Boffa', 'Fria', 'Gaoual', 'Koundara',
  'Kindia', 'Coyah', 'Dubréka', 'Forécariah', 'Télimélé',
  'Labé', 'Koubia', 'Lélouma', 'Mali', 'Tougué',
  'Mamou', 'Dalaba', 'Pita',
  'Faranah', 'Dabola', 'Dinguiraye', 'Kissidougou',
  'Kankan', 'Kérouané', 'Kouroussa', 'Mandiana', 'Siguiri',
  'Nzérékoré', 'Beyla', 'Guéckédou', 'Lola', 'Macenta', 'Yomou',
];
const GUINEA_CITY_SET = new Set<string>(GUINEA_CITY_LIST);

export function isKnownGuineaCity(city: string): boolean {
  return GUINEA_CITY_SET.has(city);
}
