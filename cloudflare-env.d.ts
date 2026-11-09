declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    APP_OWNER_EMAIL?: string;
    BUCKET?: R2Bucket;
  }
}
