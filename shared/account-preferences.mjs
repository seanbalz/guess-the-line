export const SPORTSBOOK_NAMES = Object.freeze({ draftkings: 'DraftKings', fanduel: 'FanDuel', betmgm: 'BetMGM', betrivers: 'BetRivers', betonlineag: 'BetOnline.ag', betus: 'BetUS', bovada: 'Bovada', lowvig: 'LowVig.ag', mybookieag: 'MyBookie.ag' });
export const validBooks = books => Array.isArray(books) && books.length <= 9 && new Set(books).size === books.length && books.every(book => typeof book === 'string' && Object.hasOwn(SPORTSBOOK_NAMES, book));
export const preferenceValue = value => ({ sportsbooks: [...value.sportsbooks].sort(), guidanceCollapsed: value.guidanceCollapsed });
