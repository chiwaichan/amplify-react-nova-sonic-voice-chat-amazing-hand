import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { Stack } from 'aws-cdk-lib';
import { CfnPolicy } from 'aws-cdk-lib/aws-iot';

const backend = defineBackend({
  auth,
});

const authStack = Stack.of(backend.auth.resources.authenticatedUserIamRole);

// Grant authenticated users permission to invoke Nova Sonic via Bedrock
backend.auth.resources.authenticatedUserIamRole.addToPrincipalPolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'bedrock:InvokeModelWithResponseStream',
      'bedrock:InvokeModel',
    ],
    resources: [
      'arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-sonic-v1:0',
      'arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-2-sonic-v1:0',
    ],
  })
);

// Grant authenticated users IAM permissions for IoT publish + connect
backend.auth.resources.authenticatedUserIamRole.addToPrincipalPolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['iot:Publish', 'iot:Connect'],
    resources: [
      `arn:aws:iot:us-east-1:${authStack.account}:topic/the-project/robotic-hand/*`,
      `arn:aws:iot:us-east-1:${authStack.account}:client/*`,
    ],
  })
);

// DescribeEndpoint is an account-level action (requires resource: *)
backend.auth.resources.authenticatedUserIamRole.addToPrincipalPolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['iot:DescribeEndpoint'],
    resources: ['*'],
  })
);

// Allow authenticated users to attach the IoT policy to their own Cognito identity
backend.auth.resources.authenticatedUserIamRole.addToPrincipalPolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['iot:AttachPolicy'],
    resources: ['*'],
  })
);

// Create an IoT Core policy (required for authenticated Cognito identities)
// Cognito identities need BOTH an IAM policy AND an IoT Core policy attached via AttachPolicy
// Policy name includes stack name to avoid conflicts between sandbox and CI/CD deploys
const iotPolicyName = `RoboticHandPolicy-${authStack.stackName}`;
new CfnPolicy(authStack, 'RoboticHandIoTPolicy', {
  policyName: iotPolicyName,
  policyDocument: {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['iot:Publish'],
        Resource: [`arn:aws:iot:us-east-1:${authStack.account}:topic/the-project/robotic-hand/*`],
      },
      {
        Effect: 'Allow',
        Action: ['iot:Connect'],
        Resource: [`arn:aws:iot:us-east-1:${authStack.account}:client/*`],
      },
    ],
  },
});

// Expose the IoT policy name so the frontend can attach it at runtime
backend.addOutput({
  custom: {
    iotPolicyName,
  },
});
