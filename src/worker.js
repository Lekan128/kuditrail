// KudiTrail Worker entry point.
// /api/* goes to the API; everything else is a static file from public/
// (served by Cloudflare's asset handler, with headers from public/_headers).
import { handleApi } from './api.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },
};
