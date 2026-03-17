const Minio = require('minio');
require('dotenv').config();

const client = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT,
  port: parseInt(process.env.MINIO_PORT),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

const BUCKET = process.env.MINIO_BUCKET;

const initialize = async () => {
  const exists = await client.bucketExists(BUCKET);
  if (!exists) {
    await client.makeBucket(BUCKET);
    const policy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${BUCKET}/*`],
      }],
    });
    await client.setBucketPolicy(BUCKET, policy);
    console.log(`MinIO bucket '${BUCKET}' created`);
  } else {
    console.log(`MinIO bucket '${BUCKET}' ready`);
  }
};

const uploadFile = async (objectKey, buffer, mimetype) => {
  await client.putObject(BUCKET, objectKey, buffer, buffer.length, {
    'Content-Type': mimetype,
  });
  return objectKey;
};

const getFileUrl = (objectKey) => {
  if (!objectKey) return null;
  return `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}/${BUCKET}/${objectKey}`;
};

const deleteFile = async (objectKey) => {
  await client.removeObject(BUCKET, objectKey);
};

module.exports = { client, initialize, uploadFile, getFileUrl, deleteFile, BUCKET };