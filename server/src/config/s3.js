import { S3Client } from "@aws-sdk/client-s3";
import { env } from "./env.js";

// No credentials are supplied here. The AWS SDK's default provider chain supports
// local AWS profiles/environment credentials and IAM roles in deployed workloads.
const s3Client = new S3Client({ region: env.awsRegion });

export default s3Client;
