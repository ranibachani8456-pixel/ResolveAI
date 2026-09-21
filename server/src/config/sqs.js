import { SQSClient } from "@aws-sdk/client-sqs";
import { env } from "./env.js";

// Credentials intentionally come from the AWS SDK default provider chain.
const sqsClient = new SQSClient({ region: env.awsRegion });

export default sqsClient;
