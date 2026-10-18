import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const bucket = process.env.R2_BUCKET_NAME!;

export async function uploadResumeFile(params: {
  userId: string;
  fileName: string;
  contentType: string;
  body: Buffer;
}): Promise<{ key: string }> {
  const extension = params.fileName.split(".").pop() ?? "bin";
  const key = `resumes/${params.userId}/${randomUUID()}.${extension}`;

  await r2Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: params.body,
      ContentType: params.contentType,
    }),
  );

  return { key };
}

export async function getResumeDownloadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(r2Client, command, { expiresIn: 60 * 10 });
}

export async function uploadTailoredResumePdf(params: {
  userId: string;
  applicationId: string;
  body: Uint8Array;
}): Promise<{ key: string }> {
  const key = `tailored-resumes/${params.userId}/${params.applicationId}.pdf`;

  await r2Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: params.body,
      ContentType: "application/pdf",
    }),
  );

  return { key };
}

export async function uploadApplicationScreenshot(params: {
  userId: string;
  applicationId: string;
  body: Buffer;
}): Promise<{ key: string }> {
  const key = `application-screenshots/${params.userId}/${params.applicationId}.png`;

  await r2Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: params.body,
      ContentType: "image/png",
    }),
  );

  return { key };
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const res = await r2Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error(`R2 object not found or empty: ${key}`);
  return Buffer.from(bytes);
}
