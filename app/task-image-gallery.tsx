'use client';
/* eslint-disable @next/next/no-img-element -- Private images require session cookies; do not proxy them through the public image optimizer. */
import { useState, useId } from 'react';
import {
  MAX_TASK_IMAGES,
  MAX_TASK_IMAGE_BYTES,
  TASK_IMAGE_TYPES,
  readTaskImage,
  taskImageUrl,
  type TaskImage,
} from './task-images';
import './task-images.css';
export type PendingTaskImage = { file: File; image: TaskImage };
export function TaskImageGallery({
  images,
  remove,
  disabled = false,
}: {
  images: TaskImage[];
  remove?: (id: string) => void;
  disabled?: boolean;
}) {
  if (!images.length) return null;
  return (
    <ul className="task-image-grid" aria-label="任务图片">
      {images.map((image) => (
        <li key={image.id}>
          {image.previewUrl ? (
            <details className="task-image-preview">
              <summary>
                <img
                  src={image.previewUrl}
                  alt={image.name}
                  width={image.width || 640}
                  height={image.height || 480}
                />
                {image.name} · 展开预览
              </summary>
              <img
                className="task-image-full"
                src={image.previewUrl}
                alt={`${image.name} 大图`}
                width={image.width || 640}
                height={image.height || 480}
              />
            </details>
          ) : (
            <a
              href={taskImageUrl(image)}
              target="_blank"
              rel="noreferrer"
              aria-label={`查看大图：${image.name}（新窗口）`}
            >
              <img
                src={taskImageUrl(image)}
                alt={image.name}
                width={image.width || 640}
                height={image.height || 480}
                loading="lazy"
              />
              <span>{image.name}</span>
              <small>查看大图 ↗</small>
            </a>
          )}
          {remove && (
            <button
              type="button"
              className="text-button"
              disabled={disabled}
              onClick={() => remove(image.id)}
              aria-label={`移除图片 ${image.name}`}
            >
              移除
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
export function TaskImagePicker({
  saved,
  pending,
  setPending,
  removeSaved,
  busy,
  reading,
  setReading,
}: {
  saved: TaskImage[];
  pending: PendingTaskImage[];
  setPending: (value: PendingTaskImage[]) => void;
  removeSaved: (id: string) => void;
  busy: boolean;
  reading: boolean;
  setReading: (value: boolean) => void;
}) {
  const [error, setError] = useState('');
  const hint = useId();
  const count = saved.length + pending.length;
  return (
    <div className="task-image-picker">
      <label className="field">
        添加处理图片（选填）
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={busy || reading || count >= MAX_TASK_IMAGES}
          aria-describedby={hint}
          onChange={async (e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = '';
            setError('');
            if (!files.length) return;
            if (count + files.length > MAX_TASK_IMAGES) {
              setError('最多保留 6 张图片，请先移除不需要的图片。');
              return;
            }
            if (
              files.some((f) => !TASK_IMAGE_TYPES.includes(f.type) || !f.size)
            ) {
              setError('请选择 JPG、PNG 或 WebP 图片。');
              return;
            }
            if (files.some((f) => f.size > MAX_TASK_IMAGE_BYTES)) {
              setError('每张图片最多 5 MB，请缩小后重新选择。');
              return;
            }
            setReading(true);
            try {
              const additions = await Promise.all(
                files.map(async (file) => ({
                  file,
                  image: {
                    id: crypto.randomUUID(),
                    name: file.name,
                    width: 0,
                    height: 0,
                    bytes: file.size,
                    createdAt: '',
                    createdBy: '',
                    previewUrl: await readTaskImage(file),
                  },
                })),
              );
              setPending([...pending, ...additions]);
            } catch (e) {
              setError(e instanceof Error ? e.message : '图片读取失败');
            } finally {
              setReading(false);
            }
          }}
        />
      </label>
      <p id={hint} className="helper-text">
        JPG、PNG、WebP；最多 6 张，每张 5
        MB。大图会压缩保存。选图后点击“保存进展”或“提交验收”才会保存。
      </p>
      <p className="helper-text" role="status">
        {reading ? '正在读取图片…' : `已选择 ${count} / 6 张`}
      </p>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <TaskImageGallery
        images={[...saved, ...pending.map((p) => p.image)]}
        disabled={busy || reading}
        remove={(id) => {
          if (pending.some((p) => p.image.id === id))
            setPending(pending.filter((p) => p.image.id !== id));
          else removeSaved(id);
        }}
      />
      {!!saved.length && (
        <p className="helper-text">
          已提交图片从本次结果移除后，仍保留在历史任务记录中。
        </p>
      )}
    </div>
  );
}
