import { EPL_CLUBS } from '../../../../shared/epl-clubs.mjs';

export const clubName = code => EPL_CLUBS.find(club => club.code === code)?.name ?? code;
