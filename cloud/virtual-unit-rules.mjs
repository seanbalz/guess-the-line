import { readOptional } from './optional-rpc.mjs';
import { CUSTOM_UNIT_RULES, LEGACY_UNIT_RULES } from '../shared/virtual-unit-amount.mjs';

// M-41 is optional. Absence, rollback, malformed data and outages never advertise
// writable hundredths. The SQL writers remain the final authority on every save.
export function readVirtualUnitRules(optionalRpc) {
  return readOptional(optionalRpc, 'gtl_virtual_unit_rules', {}, {
    fallback: LEGACY_UNIT_RULES,
    parse: value => value?.hundredths === true && value?.version === 1
      ? CUSTOM_UNIT_RULES : LEGACY_UNIT_RULES,
  });
}
