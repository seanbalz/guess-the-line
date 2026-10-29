// Disposable acceptance world only. All identities, events and prices are synthetic.
// The caller supplies the production EPL service assembled with its confirmed collector contract.
import { createCloudHandler } from '../../cloud/handler.mjs';
import { providerEplError } from '../../cloud/epl.mjs';
import { ALL } from '../migrations.mjs';
import { createCommunityWorld, SUPABASE, ACCOUNTS } from './community-world.mjs';
import { isWebfont } from '../fixtures/webfonts.mjs';

export const MONEYLINE_OWNERS = Object.freeze({ troy: '719658248843632640', sean: '473955676301815808' });

// Exercise the production REST adapter's reads against the same disposable database as its RPCs.
// Unsupported query syntax fails visibly rather than returning a manufactured application reply.
export function moneylineRest(db) {
  const identifier = value => {
    if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('Unsupported fixture identifier');
    return `"${value}"`;
  };
  const rows = async (table, query = {}, max = 1000) => {
    if (!table.startsWith('gtl_epl_')) throw new Error('Unexpected moneyline fixture table');
    const params = [], where = [];
    for (const [column, filter] of Object.entries(query)) {
      if (['select', 'order', 'limit'].includes(column)) continue;
      const [operator, ...parts] = String(filter).split('.'), value = parts.join('.');
      if (operator === 'is' && value === 'null') { where.push(`${identifier(column)} is null`); continue; }
      const sqlOperator = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[operator];
      if (!sqlOperator) throw new Error(`Unsupported fixture filter ${operator}`);
      params.push(value); where.push(`${identifier(column)} ${sqlOperator} $${params.length}`);
    }
    const select = !query.select || query.select === '*' ? '*' : query.select.split(',').map(identifier).join(',');
    const order = query.order ? ' order by ' + query.order.split(',').map(part => {
      const [column, direction = 'asc'] = part.split('.');
      if (!['asc', 'desc'].includes(direction)) throw new Error('Unsupported fixture ordering');
      return `${identifier(column)} ${direction}`;
    }).join(',') : '';
    const limit = Math.min(max, Number(query.limit ?? max));
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid fixture row limit');
    return (await db.query(`select ${select} from public.${identifier(table)}${where.length ? ' where ' + where.join(' and ') : ''}${order} limit ${limit}`, params)).rows;
  };
  return { rows, rest: async (table, query) => (await rows(table, query, 1))[0] ?? null };
}

export async function moneylineFlowWorld(page, baseURL, createService) {
  const world = await createCommunityWorld({ migrations: ALL, optionalRpc: true, troyBallots: false });
  const calls = [], replies = [], controls = { dropNextSaveReply: false, blockGuessReads: false };
  const kickoff = new Date(Date.now() + 3 * 86400000).toISOString();
  try {
    for (const [account, owner] of Object.entries(MONEYLINE_OWNERS)) {
      await world.db.query('update public.gtl_epl_managers set user_id=$1 where owner_id=$2', [ACCOUNTS[account].id, owner]);
    }
    await world.db.query(`insert into public.gtl_epl_weeks(season,week,window_start,window_end,first_kickoff,pick_order,status)
      values(2026,9,now()-interval '1 day',now()+interval '7 days',$1,$2,'open')`,
    [kickoff, Object.values(MONEYLINE_OWNERS)]);
    await world.db.query(`insert into public.gtl_epl_fixtures(event_id,season,week,home,away,commence_time) values
      ('flow-ars-che',2026,9,'ARS','CHE',$1),('flow-liv-eve',2026,9,'LIV','EVE',$1),
      ('flow-tot-ful',2026,9,'TOT','FUL',$1)`, [kickoff]);
    const rpc = async (name, args) => {
      if (!/^gtl_[a-z0-9_]+$/.test(name) || !Object.keys(args).every(key => /^p_[a-z0-9_]+$/.test(key))) {
        throw new Error('Invalid fixture RPC identifier');
      }
      try {
        return await world.db.transaction(async tx => {
          await tx.exec('set local role service_role');
          return (await tx.query(`select public.${name}(${Object.keys(args).map((key, i) => `${key}=>$${i + 1}`).join(',')}) result`,
            Object.values(args))).rows[0].result;
        });
      } catch (error) { throw providerEplError(error.message); }
    };
    const service = await createService({ ...world, rpc, kickoff, controls });
    const handler = createCloudHandler({
      authenticate: async token => world.users.has(token) ? { ...world.users.get(token), emailConfirmed: true } : null,
      epl: service,
    });
    const api = async (account, action, body = {}) => {
      const token = world.sessions[ACCOUNTS[account].email].access_token;
      const response = await handler(new Request(`${SUPABASE}/functions/v1/gtl-api/epl/${action}`, {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
      }));
      return { status: response.status, body: await response.json() };
    };
    page.on('pageerror', error => world.errors.push(error.message));
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin === new URL(baseURL).origin) return route.continue();
      if (isWebfont(url)) return route.abort();
      if (url.origin !== SUPABASE) { world.errors.push(`Unexpected origin ${url.origin}`); return route.abort(); }
      const reply = (status, body) => route.fulfill({ status, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      if (url.pathname === '/auth/v1/token') return reply(200, world.sessions[req.postDataJSON().email]);
      if (url.pathname === '/auth/v1/user') return reply(200, world.users.get(req.headers().authorization?.replace('Bearer ', '')));
      if (url.pathname === '/auth/v1/logout') return reply(200, {});
      const path = url.pathname.split('/gtl-api/')[1];
      calls.push({ path, body: req.method() === 'POST' ? req.postDataJSON() : null });
      if (path === 'epl/guess/read' && controls.blockGuessReads) return reply(503, { error: 'Synthetic read outage' });
      const response = await (path?.startsWith('epl/') ? handler : world.handler)(new Request(req.url(), {
        method: req.method(), headers: req.headers(), ...(req.method() === 'POST' ? { body: req.postData() } : {}),
      }));
      const body = await response.json();
      if (path === 'lobby') body.epl = true;
      replies.push({ path, status: response.status, body });
      if (path === 'epl/guess/save' && controls.dropNextSaveReply) {
        controls.dropNextSaveReply = false;
        return route.abort('failed'); // The real SQL has committed; only its response is lost.
      }
      return reply(response.status, body);
    });
    return { ...world, api, rpc, handler, service, kickoff, controls, calls, replies };
  } catch (error) { await world.db.close(); throw error; }
}
