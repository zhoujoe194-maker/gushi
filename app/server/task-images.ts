import sharp from 'sharp';
import { HttpError } from './auth';
import {
  MAX_TASK_IMAGE_BYTES,
  TASK_IMAGE_TYPES,
  type TaskImage,
} from '../task-images';

// Bound the stream before parsing multipart data, including requests without Content-Length.
export async function readTaskBody(req: Request) {
  const multipart = req.headers
    .get('content-type')
    ?.startsWith('multipart/form-data');
  const limit = multipart ? 31 * 1024 * 1024 : 20000;
  if (Number(req.headers.get('content-length') || 0) > limit)
    throw new HttpError(413, '提交内容过大，最多 6 张、每张 5 MB');
  const reader = req.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(413, '提交内容过大，最多 6 张、每张 5 MB');
      }
      chunks.push(value);
    }
  }
  const bytes = Buffer.concat(chunks);
  if (!multipart)
    return { body: JSON.parse(bytes.toString('utf8')), files: [] as File[] };
  let form: FormData;
  try {
    form = await new Response(bytes, {
      headers: { 'Content-Type': req.headers.get('content-type')! },
    }).formData();
  } catch {
    throw new HttpError(400, '图片表单格式不正确，请重新选择图片');
  }
  const payload = form.get('payload');
  if (typeof payload !== 'string' || payload.length > 20000)
    throw new HttpError(400, '任务内容格式不正确');
  const files = form.getAll('images');
  if (files.some((file) => typeof file === 'string'))
    throw new HttpError(400, '请使用图片文件');
  return { body: JSON.parse(payload), files: files as File[] };
}

export async function prepareTaskImage(file: File, actor: string, now: string) {
  if (!TASK_IMAGE_TYPES.includes(file.type) || !file.size)
    throw new HttpError(400, '仅支持 JPG、PNG、WebP 静态图片');
  if (file.size > MAX_TASK_IMAGE_BYTES)
    throw new HttpError(413, '每张图片不能超过 5 MB');
  const bytes = Buffer.from(await file.arrayBuffer());
  // Reject vector and other formats before decoding, even with a forged MIME type.
  const format = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? 'png'
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      ? 'jpeg'
      : bytes.toString('ascii', 0, 4) === 'RIFF' &&
          bytes.toString('ascii', 8, 12) === 'WEBP'
        ? 'webp'
        : '';
  if (!format || file.type !== 'image/' + format)
    throw new HttpError(400, '图片格式与内容不符，请重新选择图片');
  try {
    const pipeline = sharp(bytes, {
      limitInputPixels: 25_000_000,
      failOn: 'warning',
    });
    const meta = await pipeline.metadata();
    if ((meta.pages || 1) !== 1)
      throw new HttpError(400, '暂不支持动态图片，请选择静态图片');
    // Normalize rotation and strip EXIF/location metadata. No public filesystem upload path.
    const { data, info } = await pipeline
      .rotate()
      .resize({
        width: 2400,
        height: 2400,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    if (data.length > 2 * 1024 * 1024)
      throw new HttpError(413, '图片压缩后仍较大，请缩小尺寸后重试');
    const name =
      file.name
        .replace(/[\u0000-\u001f\u007f/\\]/g, '')
        .replace(/\.[^.]*$/, '')
        .slice(0, 100) || '任务图片';
    const image: TaskImage = {
      id: crypto.randomUUID(),
      name: name + '.webp',
      width: info.width,
      height: info.height,
      bytes: data.length,
      createdAt: now,
      createdBy: actor,
    };
    return { image, content: data.toString('base64') };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(
      400,
      '无法读取图片，请选择完整的静态图片，且不超过 2500 万像素',
    );
  }
}
