export const PROPERTY_TYPES = [
  { value: 'apartment', label: 'Apartment',          emoji: '🏢' },
  { value: 'rumah',     label: 'Rumah',               emoji: '🏠' },
  { value: 'tanah',     label: 'Tanah',               emoji: '🌿' },
  { value: 'kost',      label: 'Kost',                emoji: '🏗️' },
  { value: 'hotel',     label: 'Hotel',               emoji: '🏨' },
  { value: 'homestay',  label: 'Homestay/Guesthouse', emoji: '🏡' },
  { value: 'villa',     label: 'Villa',               emoji: '🌴' },
  { value: 'ruko',      label: 'Ruko',                emoji: '🏪' },
  { value: 'gudang',    label: 'Gudang',              emoji: '🏭' },
  { value: 'komersial', label: 'Komersial Lainnya',   emoji: '🏬' },
] as const;

export const PROPERTY_TYPE_VALUES = PROPERTY_TYPES.map(t => t.value);

export function getPropertyTypeLabel(value: string): string {
  const found = PROPERTY_TYPES.find(t => t.value === value);
  if (found) return found.label;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function getPropertyTypeEmoji(value: string): string {
  const found = PROPERTY_TYPES.find(t => t.value === value);
  return found?.emoji ?? '🏠';
}
