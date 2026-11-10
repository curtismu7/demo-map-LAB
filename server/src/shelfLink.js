// shelf-link service (family standard): GET /api/shelf returns { shelfUrl } for the header "Shelf" button. Here the URL comes from
// this app's own settings (SHELF_URL in .env or the environment), never a shared file. Unset or invalid means null and the
// web component renders nothing. Distinct from the Real data fetch, which is server-side and loopback only.
import { shelfLinkUrl } from './config.js';

export function mountShelfRoute(router, { env = process.env, settingsOpts } = {}) {
  router.get('/shelf', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ shelfUrl: shelfLinkUrl(env, settingsOpts) });
  });
}
