import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config.module.js';
import { AppError } from '../common/app-error.js';

export interface CloudinaryResource {
  public_id: string;
  resource_type: 'image' | 'video' | 'raw';
  secure_url: string;
  width?: number;
  height?: number;
  bytes?: number;
}

/** Cloudinary's signature: the parameters sorted and joined, with the secret on the end, hashed with SHA-1. */
export function sign(params: Record<string, string | number>, secret: string): string {
  const joined = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha1').update(`${joined}${secret}`).digest('hex');
}

/**
 * The few Cloudinary calls the media library needs. Files go from the person's browser straight to Cloudinary, signed by
 * us for one folder, so a video never passes through this server. We then ask Cloudinary what was stored before recording
 * it, so a file is never recorded on the browser's word alone.
 */
@Injectable()
export class CloudinaryClient {
  private readonly fetcher: typeof fetch = fetch;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get configured() {
    return Boolean(
      this.config.CLOUDINARY_CLOUD_NAME && this.config.CLOUDINARY_API_KEY && this.config.CLOUDINARY_API_SECRET,
    );
  }

  private require() {
    if (!this.configured) throw AppError.conflict('The media library is not set up yet on this server.');
    return {
      cloud: this.config.CLOUDINARY_CLOUD_NAME!,
      key: this.config.CLOUDINARY_API_KEY!,
      secret: this.config.CLOUDINARY_API_SECRET!,
    };
  }

  /** What the browser needs to upload one file into one folder. */
  uploadTicket(folder: string) {
    const { cloud, key, secret } = this.require();
    const timestamp = Math.floor(Date.now() / 1000);
    return {
      cloudName: cloud,
      apiKey: key,
      timestamp,
      folder,
      signature: sign({ folder, timestamp }, secret),
    };
  }

  /** What Cloudinary holds under this id. Throws if it holds nothing. */
  async describe(publicId: string, type: 'image' | 'video'): Promise<CloudinaryResource> {
    const { cloud, key, secret } = this.require();
    const response = await this.fetcher(
      `https://api.cloudinary.com/v1_1/${cloud}/resources/${type}/upload/${encodeURIComponent(publicId).replace(/%2F/g, '/')}`,
      {
        headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) throw AppError.notFound('Cloudinary has no such file.');
    return (await response.json()) as CloudinaryResource;
  }

  async destroy(publicId: string, type: 'image' | 'video'): Promise<void> {
    const { cloud, key, secret } = this.require();
    const timestamp = Math.floor(Date.now() / 1000);
    const body = new URLSearchParams({
      public_id: publicId,
      timestamp: String(timestamp),
      api_key: key,
      signature: sign({ public_id: publicId, timestamp }, secret),
    });
    await this.fetcher(`https://api.cloudinary.com/v1_1/${cloud}/${type}/destroy`, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(15_000),
    });
  }

  /** A picture cut to a shape, or the original. Cloudinary does the cropping when the address is first fetched. */
  variant(publicId: string, preset: 'original' | 'square' | 'portrait' | 'landscape'): string {
    const { cloud } = this.require();
    const cut = { square: 'ar_1:1,w_1080', portrait: 'ar_9:16,w_1080', landscape: 'ar_16:9,w_1920' }[preset as string];
    return `https://res.cloudinary.com/${cloud}/image/upload/${cut ? `c_fill,g_auto,${cut}/` : ''}${publicId}`;
  }
}
