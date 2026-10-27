// Vercel serves existing build files before rewrites. Only a missing /assets
// resource reaches this function; its headers override the asset cache rule.
export default function staticNotFound(req, res) {
  res.statusCode = 404;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(req.method === 'HEAD' ? undefined : 'Not found');
}
