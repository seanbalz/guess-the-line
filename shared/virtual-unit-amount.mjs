// Approved Virtual entry: Custom hundredths (0.01–100U). Existing half-unit
// records/writers had no server maximum: keep those valid, including historical
// values above the screen's 100U maximum. Tracked tickets keep their own precision.
export const halfUnits = value => Number.isFinite(value) && value > 0 && Number.isInteger(value * 2);
export const hundredthUnits = value => Number.isFinite(value) && value >= 0.01 && value <= 100
  // Compare to the canonical cent number, not an epsilon around it. Ordinary
  // values such as 0.29 survive binary multiplication; extra input precision does not.
  && value === Math.round(value * 100) / 100;
export const validVirtualUnits = value => halfUnits(value) || hundredthUnits(value);
export const LEGACY_UNIT_RULES = Object.freeze({ hundredths: false });
export const CUSTOM_UNIT_RULES = Object.freeze({ hundredths: true });
export const customUnitsEnabled = rules => rules?.hundredths === true;
