/**
 * Vercel Serverless Function: Google Apps Script API Reverse Proxy
 * Mengeliminasi kendala CORS, preflight OPTIONS, dan redirect 302 dari browser.
 */
export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const targetGasUrl =
    process.env.GAS_API_URL ||
    process.env.VITE_GAS_API_URL ||
    req.query.gasUrl ||
    '';

  if (!targetGasUrl) {
    return res.status(400).json({
      success: false,
      message: 'Konfigurasi GAS_API_URL belum diatur di Vercel Environment Variables.'
    });
  }

  try {
    if (req.method === 'GET') {
      const url = new URL(targetGasUrl);
      for (const [key, val] of Object.entries(req.query)) {
        if (key !== 'gasUrl') {
          url.searchParams.set(key, String(val));
        }
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        redirect: 'follow'
      });

      const data = await response.json();
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const response = await fetch(targetGasUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: payload,
        redirect: 'follow'
      });

      const data = await response.json();
      return res.status(200).json(data);
    }

    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Proxy Error: ' + (err?.message || String(err))
    });
  }
}
