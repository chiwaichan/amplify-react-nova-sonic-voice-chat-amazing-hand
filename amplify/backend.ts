import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';

const backend = defineBackend({
  auth,
});

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
