
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
// D1-RECTIFY: private image access is authorized on the server from the
// session's capability grants; no desk/scope query hint is sent.
export const taskImageUrl = (image: TaskImage) =>
  image.previewUrl || `/api/tasks/images/${encodeURIComponent(image.id)}`;

export function readTaskImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error('图片读取失败，请重新选择'));
    reader.readAsDataURL(file);
  });
}
