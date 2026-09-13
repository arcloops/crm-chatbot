import {
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, isStorageConfigured } from "./env.js";
import { getLogger } from "./logger.js";

const log = getLogger({ module: "storage" });

let client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!isStorageConfigured()) {
    throw new Error(
      "Object storage is not configured. Set S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY.",
    );
  }

  if (!client) {
    const e = env();
    client = new S3Client({
      region: e.S3_REGION,
      credentials: {
        accessKeyId: e.S3_ACCESS_KEY_ID!,
        secretAccessKey: e.S3_SECRET_ACCESS_KEY!,
      },
      ...(e.S3_ENDPOINT
        ? {
            endpoint: e.S3_ENDPOINT,
            forcePathStyle: true,
          }
        : {}),
    });
  }

  return client;
}

export type UploadInput = {
  key: string;
  body: PutObjectCommandInput["Body"];
  contentType: string;
};

export async function uploadObject(
  input: UploadInput,
): Promise<{ key: string; url: string }> {
  const e = env();
  const command = new PutObjectCommand({
    Bucket: e.S3_BUCKET,
    Key: input.key,
    Body: input.body,
    ContentType: input.contentType,
  });

  await getS3Client().send(command);
  log.info({ key: input.key }, "Uploaded object");

  const url = e.S3_PUBLIC_URL
    ? `${e.S3_PUBLIC_URL.replace(/\/$/, "")}/${input.key}`
    : `https://${e.S3_BUCKET}.s3.${e.S3_REGION}.amazonaws.com/${input.key}`;

  return { key: input.key, url };
}

export async function createPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 900,
): Promise<string> {
  const e = env();
  const command = new PutObjectCommand({
    Bucket: e.S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(getS3Client(), command, { expiresIn: expiresInSeconds });
}

export { isStorageConfigured };
