export function requireProductionOrigin() {
  const origin = process.env.APP_ORIGIN || '';
  try {
    const url = new URL(origin);
    if (url.protocol === 'https:' && url.hostname && url.origin === origin)
      return;
  } catch {}
  throw Error(
    'APP_ORIGIN 必须为完整的 HTTPS 源地址，例如 https://crm.example.com；不含路径、尾部斜杠、账号、查询参数或片段',
  );
}
