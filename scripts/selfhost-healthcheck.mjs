// Probe the local instance only; do not expose environment or database details.
try {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error();
  const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
    signal: AbortSignal.timeout(4000),
    redirect: 'error',
  });
  if (response.status !== 200 || (await response.json()).status !== 'ok')
    throw Error();
  console.log('服务与数据库就绪');
} catch {
  console.error('服务或数据库尚未就绪');
  process.exitCode = 1;
}
