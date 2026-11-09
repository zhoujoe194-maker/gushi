import type { Desk } from './team';

export const MAX_TASK_IMAGES = 6;
export const MAX_TASK_IMAGE_BYTES = 5 * 1024 * 1024;
export const TASK_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export type TaskImage = {
  id: string;
  name: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: string;
  createdBy: string;
  previewUrl?: string;
};
export const taskImageUrl = (image: TaskImage, desk: Desk) =>
  image.previewUrl ||
  `/api/tasks/images/${encodeURIComponent(image.id)}?desk=${desk}`;

export function readTaskImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error('图片读取失败，请重新选择'));
    reader.readAsDataURL(file);
  });
}
