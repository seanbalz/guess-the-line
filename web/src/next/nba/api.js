import { cloudApi } from '../../api.js';
export function nbaApi(action, body = {}, options = {}) {
  if (!['read', 'save', 'games'].includes(action)) throw new TypeError('Unknown NBA action.');
  return cloudApi(`nba/${action}`, body, { ...options, save: action === 'save' });
}
